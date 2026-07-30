-- -----------------------------------------------------------------------------
-- Report templates + AI-generated structured reports on field_visits (Phase B)
-- -----------------------------------------------------------------------------

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  template_content text not null,
  is_default boolean not null default false
);

create index if not exists report_templates_agency_id_idx
  on public.report_templates (agency_id);

create index if not exists report_templates_agency_default_idx
  on public.report_templates (agency_id, is_default)
  where is_default = true;

comment on table public.report_templates is
  'Agency-defined report templates for AI structuring of field visit transcripts';

drop trigger if exists report_templates_set_updated_at on public.report_templates;
create trigger report_templates_set_updated_at
  before update on public.report_templates
  for each row execute procedure public.set_updated_at();

alter table public.report_templates enable row level security;

drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates
  for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
    or public.can_manage_agency(agency_id)
  );

-- can_manage_agency(uuid) — postojeća funkcija u produkciji (agency_owner za
-- datu agenciju). is_agency_owner() iz phase5 migracije nije primenjena.
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

grant select, insert, update, delete on public.report_templates to authenticated;

-- field_visits: template link + generated report
alter table public.field_visits
  add column if not exists report_template_id uuid
    references public.report_templates (id) on delete set null;

alter table public.field_visits
  add column if not exists report text;

alter table public.field_visits
  add column if not exists report_status text not null default 'pending';

alter table public.field_visits
  drop constraint if exists field_visits_report_status_check;

alter table public.field_visits
  add constraint field_visits_report_status_check
  check (
    report_status in ('pending', 'processing', 'done', 'failed', 'skipped')
  );

create index if not exists field_visits_report_template_id_idx
  on public.field_visits (report_template_id);

comment on column public.field_visits.report_template_id is
  'Selected report template for AI structuring after transcription';
comment on column public.field_visits.report is
  'AI-generated or manually edited structured report';
comment on column public.field_visits.report_status is
  'pending | processing | done | failed | skipped';
