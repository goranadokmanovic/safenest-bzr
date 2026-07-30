-- -----------------------------------------------------------------------------
-- Compliance: lek. pregledi, osposobljavanja, pregledi opreme
-- + assigned_collaborator_id na client_companies
-- -----------------------------------------------------------------------------

-- 1) Klijent → zaduženi saradnik (profiles.user_id — PK tabele profiles)
alter table public.client_companies
  add column if not exists assigned_collaborator_id uuid
    references public.profiles (user_id) on delete set null;

create index if not exists client_companies_assigned_collaborator_idx
  on public.client_companies (assigned_collaborator_id)
  where assigned_collaborator_id is not null;

comment on column public.client_companies.assigned_collaborator_id is
  'Saradnik zadužen za klijenta (profiles.user_id).';

-- 2) compliance_records
create table if not exists public.compliance_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid not null references public.client_companies (id) on delete cascade,
  record_type text not null
    check (record_type in ('medical_exam', 'training_certification', 'equipment_check')),
  subject_type text not null
    check (subject_type in ('worker', 'equipment')),
  subject_id uuid,
  subject_name text not null,
  category text not null,
  issued_date date,
  expiry_date date,
  document_url text,
  notes text
);

create index if not exists compliance_records_agency_expiry_idx
  on public.compliance_records (agency_id, expiry_date);

create index if not exists compliance_records_client_idx
  on public.compliance_records (client_company_id);

create index if not exists compliance_records_type_idx
  on public.compliance_records (agency_id, record_type);

drop trigger if exists compliance_records_set_updated_at on public.compliance_records;
create trigger compliance_records_set_updated_at
  before update on public.compliance_records
  for each row execute procedure public.set_updated_at();

comment on table public.compliance_records is
  'Lekarski pregledi, stručna osposobljavanja, pregledi opreme/mašina.';

-- 3) RLS
alter table public.compliance_records enable row level security;

drop policy if exists compliance_records_select on public.compliance_records;
drop policy if exists compliance_records_insert on public.compliance_records;
drop policy if exists compliance_records_update on public.compliance_records;
drop policy if exists compliance_records_delete on public.compliance_records;

create policy compliance_records_select on public.compliance_records
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_agency_access(agency_id)
  );

create policy compliance_records_insert on public.compliance_records
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.has_agency_access(agency_id)
  );

create policy compliance_records_update on public.compliance_records
  for update to authenticated
  using (
    public.is_super_admin()
    or public.has_agency_access(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.has_agency_access(agency_id)
  );

create policy compliance_records_delete on public.compliance_records
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.has_agency_access(agency_id)
  );
