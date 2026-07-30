-- -----------------------------------------------------------------------------
-- Fix can_manage_agency: text = member_role mismatch
--
-- Produkcija: INSERT u report_templates pada sa
--   ERROR: operator does not exist: text = member_role
-- Uzrok je ista klasa buga kao stari has_agency_access — poređenje
-- profiles.role (text) ili string literala sa agency_members.member_role
-- (custom enum tip member_role) bez eksplicitnog cast-a.
--
-- Ovde redefinišemo funkciju da uvek poredi preko ::text, kao što rade
-- ispravne agency-scoped provere (bez enum/text mismatch-a).
--
-- VAŽNO: zadržavamo ORIGINALNI naziv parametra (_agency_id). Postgres ne
-- dozvoljava CREATE OR REPLACE da promeni naziv input parametra
-- (ERROR 42P13), a DROP FUNCTION ... CASCADE bi obrisao sve zavisne RLS
-- politike na drugim tabelama. CREATE OR REPLACE sa istim potpisom je
-- bezbedan i ne dira zavisne politike.
-- -----------------------------------------------------------------------------

create or replace function public.can_manage_agency(_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.agency_id = _agency_id
        and p.role::text = 'agency_owner'
    )
    or exists (
      select 1
      from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = _agency_id
        and am.member_role::text = 'owner'
    );
$$;

comment on function public.can_manage_agency(uuid) is
  'Da li auth.uid() može da upravlja agencijom (super_admin, profiles.role=agency_owner, ili agency_members.member_role=owner). Poređenja idu preko ::text da se izbegne text = member_role greška.';

-- Ponovo kreiraj report_templates write politike (idempotentno) da koriste
-- ispravljenu funkciju — bez izmene select politike.
drop policy if exists report_templates_insert on public.report_templates;
create policy report_templates_insert on public.report_templates
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists report_templates_update on public.report_templates;
create policy report_templates_update on public.report_templates
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists report_templates_delete on public.report_templates;
create policy report_templates_delete on public.report_templates
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );
