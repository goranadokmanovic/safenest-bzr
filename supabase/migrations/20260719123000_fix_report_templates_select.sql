-- -----------------------------------------------------------------------------
-- Fix report_templates SELECT RLS
--
-- Insert radi (can_manage_agency), ali SELECT vraća praznu listu — UI i
-- FieldVisitForm dropdown ne vide kreirane šablone.
--
-- Working agency-scoped tabele (client_companies, …) za čitanje koriste
-- profile_matching_agency. Dodajemo i can_manage_agency (isti check koji
-- već propušta INSERT za vlasnika) radi otpornosti.
-- -----------------------------------------------------------------------------

drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates
  for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
    or public.can_manage_agency(agency_id)
  );

comment on policy report_templates_select on public.report_templates is
  'Čitanje šablona: super_admin, član agencije (profile_matching_agency) ili vlasnik (can_manage_agency).';
