-- -----------------------------------------------------------------------------
-- Upravljanje članovima agencije (tab "Radnici agencije")
--
-- Do sada je agency_members imao samo SELECT politiku, pa su svi upisi išli
-- isključivo preko service role (bootstrap agencije, prihvatanje pozivnice,
-- brisanje korisnika iz admin panela). Vlasnik agencije dobija ekran za
-- upravljanje članovima, pa dodajemo i write politike vezane za
-- can_manage_agency(agency_id) — istu funkciju koju već koriste
-- report_templates, agency_invites i visit_delegations.
--
-- Napomena: promena profiles.role i uklanjanje člana i dalje idu preko service
-- role, jer authenticated na profiles ima samo grant update (full_name, locale).
-- Ove politike pokrivaju agency_members deo i služe kao dubinska zaštita.
-- -----------------------------------------------------------------------------

drop policy if exists agency_members_insert on public.agency_members;
create policy agency_members_insert on public.agency_members
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists agency_members_update on public.agency_members;
create policy agency_members_update on public.agency_members
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists agency_members_delete on public.agency_members;
create policy agency_members_delete on public.agency_members
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

comment on policy agency_members_insert on public.agency_members is
  'Dodavanje člana: super_admin ili vlasnik agencije (can_manage_agency).';
comment on policy agency_members_update on public.agency_members is
  'Izmena člana (member_role, joined_at): super_admin ili vlasnik agencije.';
comment on policy agency_members_delete on public.agency_members is
  'Uklanjanje člana: super_admin ili vlasnik agencije.';

-- Članovi koji su ušli pre nego što je accept počeo da upisuje joined_at
-- ostaju bez tog podatka, pa lista "Radnici agencije" nema šta da prikaže u
-- koloni datuma. Popunjavamo iz invited_at, pa iz created_at.
update public.agency_members
set joined_at = coalesce(invited_at, created_at)
where joined_at is null;
