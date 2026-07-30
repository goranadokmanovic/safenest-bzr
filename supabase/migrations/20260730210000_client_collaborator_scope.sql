-- -----------------------------------------------------------------------------
-- assigned_collaborator_id postaje pravi RLS opseg (ne samo UX filter)
--
-- Do sada je saradnik (agency_collaborator) preko RLS video SVE klijente svoje
-- agencije; assigned_collaborator_id se koristio samo za prikaz i za routing
-- notifikacija o rokovima. Ova migracija ga pretvara u stvarnu granicu pristupa
-- na nivou baze, za: client_companies, employees, compliance_records,
-- documents, deadlines.
--
-- Opseg po ulozi:
--   super_admin ......... sve
--   agency_owner ........ svi klijenti svoje agencije (bez promene)
--   field_worker ........ svi klijenti svoje agencije (bez promene)
--   agency_collaborator . samo klijenti gde je assigned_collaborator_id = on,
--                         PLUS klijenti na čijoj poseti učestvuje (primarni
--                         radnik ili član tima). Bez tog izuzetka bi saradnik
--                         izgubio naziv klijenta na već dodeljenim posetama.
-- -----------------------------------------------------------------------------

-- 1) Helperi -----------------------------------------------------------------

-- Da li tekući korisnik uopšte podleže sužavanju opsega.
create or replace function public.is_scoped_collaborator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role::text = 'agency_collaborator'
  );
$$;

revoke all on function public.is_scoped_collaborator() from public;
grant execute on function public.is_scoped_collaborator() to authenticated;

-- Da li tekući korisnik učestvuje na bar jednoj poseti za dati klijent.
create or replace function public.works_on_client_company(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.field_visits v
    where v.client_company_id = p_client_id
      and (
        v.assigned_user_id = auth.uid()
        or exists (
          select 1
          from public.field_visit_collaborators fvc
          where fvc.field_visit_id = v.id
            and fvc.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.works_on_client_company(uuid) from public;
grant execute on function public.works_on_client_company(uuid) to authenticated;

-- Glavni predikat — koristi se u politikama nad client_companies, gde su sve
-- tri kolone dostupne bez dodatnog čitanja tabele.
create or replace function public.client_company_in_scope(
  p_client_id uuid,
  p_agency_id uuid,
  p_assigned_collaborator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.profile_matching_agency(p_agency_id)
      and (
        not public.is_scoped_collaborator()
        or p_assigned_collaborator_id = auth.uid()
        or public.works_on_client_company(p_client_id)
      )
    );
$$;

revoke all on function public.client_company_in_scope(uuid, uuid, uuid) from public;
grant execute on function public.client_company_in_scope(uuid, uuid, uuid) to authenticated;

-- Verzija po id-u — za tabele koje nose samo client_company_id.
-- SECURITY DEFINER, pa čitanje client_companies ovde ne prolazi kroz RLS i
-- nema rekurzije sa client_companies_select politikom.
create or replace function public.client_company_in_scope_by_id(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_companies c
    where c.id = p_client_id
      and public.client_company_in_scope(
        c.id,
        c.agency_id,
        c.assigned_collaborator_id
      )
  );
$$;

revoke all on function public.client_company_in_scope_by_id(uuid) from public;
grant execute on function public.client_company_in_scope_by_id(uuid) to authenticated;

-- Indeks za works_on_client_company (pretraga poseta po klijentu i radniku).
create index if not exists field_visits_client_assigned_user_idx
  on public.field_visits (client_company_id, assigned_user_id);

-- 2) client_companies --------------------------------------------------------

drop policy if exists client_companies_select on public.client_companies;
create policy client_companies_select
  on public.client_companies for select to authenticated
  using (
    public.client_company_in_scope(id, agency_id, assigned_collaborator_id)
  );

-- Saradnik sme da kreira klijenta samo ako ga odmah zaduži za sebe — inače bi
-- napravio red koji posle ne može da pročita.
drop policy if exists client_companies_insert on public.client_companies;
create policy client_companies_insert
  on public.client_companies for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and (
        not public.is_scoped_collaborator()
        or assigned_collaborator_id = auth.uid()
      )
    )
  );

-- WITH CHECK istim predikatom sprečava da saradnik prebaci klijenta na drugog
-- saradnika (red bi ispao iz njegovog opsega).
drop policy if exists client_companies_update on public.client_companies;
create policy client_companies_update
  on public.client_companies for update to authenticated
  using (
    public.client_company_in_scope(id, agency_id, assigned_collaborator_id)
  )
  with check (
    public.client_company_in_scope(id, agency_id, assigned_collaborator_id)
  );

drop policy if exists client_companies_delete on public.client_companies;
create policy client_companies_delete
  on public.client_companies for delete to authenticated
  using (
    public.client_company_in_scope(id, agency_id, assigned_collaborator_id)
  );

-- 3) employees ---------------------------------------------------------------

drop policy if exists employees_select on public.employees;
create policy employees_select
  on public.employees for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists employees_insert on public.employees;
create policy employees_insert
  on public.employees for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists employees_update on public.employees;
create policy employees_update
  on public.employees for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists employees_delete on public.employees;
create policy employees_delete
  on public.employees for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

-- 4) compliance_records ------------------------------------------------------
-- Napomena: ostaje has_agency_access (uključuje agency_members), uz dodatni
-- filter po klijentu — isti izvor rokova koji koristi AI asistent.

drop policy if exists compliance_records_select on public.compliance_records;
create policy compliance_records_select
  on public.compliance_records for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.has_agency_access(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists compliance_records_insert on public.compliance_records;
create policy compliance_records_insert
  on public.compliance_records for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.has_agency_access(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists compliance_records_update on public.compliance_records;
create policy compliance_records_update
  on public.compliance_records for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.has_agency_access(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.has_agency_access(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists compliance_records_delete on public.compliance_records;
create policy compliance_records_delete
  on public.compliance_records for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.has_agency_access(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

-- 5) documents ---------------------------------------------------------------

drop policy if exists documents_select on public.documents;
create policy documents_select
  on public.documents for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert
  on public.documents for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists documents_update on public.documents;
create policy documents_update
  on public.documents for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete
  on public.documents for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and public.client_company_in_scope_by_id(client_company_id)
    )
  );

-- 6) deadlines ---------------------------------------------------------------
-- client_company_id je nullable (rok na nivou agencije) — takvi redovi ostaju
-- vidljivi celoj agenciji.

drop policy if exists deadlines_select on public.deadlines;
create policy deadlines_select
  on public.deadlines for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and (
        client_company_id is null
        or public.client_company_in_scope_by_id(client_company_id)
      )
    )
  );

drop policy if exists deadlines_insert on public.deadlines;
create policy deadlines_insert
  on public.deadlines for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and (
        client_company_id is null
        or public.client_company_in_scope_by_id(client_company_id)
      )
    )
  );

drop policy if exists deadlines_update on public.deadlines;
create policy deadlines_update
  on public.deadlines for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and (
        client_company_id is null
        or public.client_company_in_scope_by_id(client_company_id)
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and (
        client_company_id is null
        or public.client_company_in_scope_by_id(client_company_id)
      )
    )
  );

drop policy if exists deadlines_delete on public.deadlines;
create policy deadlines_delete
  on public.deadlines for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.profile_matching_agency(agency_id)
      and (
        client_company_id is null
        or public.client_company_in_scope_by_id(client_company_id)
      )
    )
  );
