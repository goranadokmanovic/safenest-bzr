-- SafeNest BZR — Phase 1 MVP: teren, glas, rizik, kalendar, audit (proširenje jezgro šeme)
-- Primeni posle 20250626120000_phase5_rls_storage_notifications.sql

-- -----------------------------------------------------------------------------
-- field_visits — terenske posete kod klijenta
-- -----------------------------------------------------------------------------
create table public.field_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid not null references public.client_companies (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  assigned_to uuid references auth.users (id) on delete set null,
  visit_date timestamptz not null default now(),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes text,
  address text,
  location_lat double precision,
  location_lng double precision,
  metadata jsonb not null default '{}'::jsonb
);

create index field_visits_agency_id_idx on public.field_visits (agency_id);
create index field_visits_agency_created_idx on public.field_visits (agency_id, created_at desc);
create index field_visits_client_company_id_idx on public.field_visits (client_company_id);

comment on table public.field_visits is 'Terenske posete BZR agenta kod klijenta.';

-- -----------------------------------------------------------------------------
-- field_photos — fotografije sa terena (OCR kasnije)
-- -----------------------------------------------------------------------------
create table public.field_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  field_visit_id uuid not null references public.field_visits (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id),
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  ocr_text text,
  metadata jsonb not null default '{}'::jsonb
);

create index field_photos_agency_id_idx on public.field_photos (agency_id);
create index field_photos_agency_created_idx on public.field_photos (agency_id, created_at desc);
create index field_photos_field_visit_id_idx on public.field_photos (field_visit_id);

comment on table public.field_photos is 'Fotografije povezane sa terenskom posetom; OCR ekstrakcija u Phase 1+.';

-- -----------------------------------------------------------------------------
-- voice_recordings — audio snimci (transkript kasnije)
-- -----------------------------------------------------------------------------
create table public.voice_recordings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  field_visit_id uuid references public.field_visits (id) on delete set null,
  client_company_id uuid references public.client_companies (id) on delete set null,
  recorded_by uuid not null references auth.users (id),
  storage_path text not null,
  audio_url text,
  mime_type text,
  duration_seconds integer,
  transcript text,
  transcript_status text not null default 'pending'
    check (transcript_status in ('pending', 'processing', 'completed', 'failed')),
  metadata jsonb not null default '{}'::jsonb
);

create index voice_recordings_agency_id_idx on public.voice_recordings (agency_id);
create index voice_recordings_agency_created_idx on public.voice_recordings (agency_id, created_at desc);
create index voice_recordings_field_visit_id_idx on public.voice_recordings (field_visit_id);

comment on table public.voice_recordings is 'Audio snimci sa terena; transkript preko eksternog AI servisa.';

-- -----------------------------------------------------------------------------
-- video_recordings — video snimci sa terena
-- -----------------------------------------------------------------------------
create table public.video_recordings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  field_visit_id uuid references public.field_visits (id) on delete set null,
  client_company_id uuid references public.client_companies (id) on delete set null,
  recorded_by uuid not null references auth.users (id),
  storage_path text not null,
  video_url text,
  mime_type text,
  duration_seconds integer,
  transcript text,
  metadata jsonb not null default '{}'::jsonb
);

create index video_recordings_agency_id_idx on public.video_recordings (agency_id);
create index video_recordings_agency_created_idx on public.video_recordings (agency_id, created_at desc);

comment on table public.video_recordings is 'Video snimci sa terena (mobilni modul, Phase 4).';

-- -----------------------------------------------------------------------------
-- risk_assessments — procena rizika na poseti
-- -----------------------------------------------------------------------------
create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  field_visit_id uuid references public.field_visits (id) on delete set null,
  client_company_id uuid not null references public.client_companies (id) on delete cascade,
  assessed_by uuid not null references auth.users (id),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  score numeric(5, 2),
  findings jsonb not null default '{}'::jsonb,
  recommendations text,
  metadata jsonb not null default '{}'::jsonb
);

create index risk_assessments_agency_id_idx on public.risk_assessments (agency_id);
create index risk_assessments_agency_created_idx on public.risk_assessments (agency_id, created_at desc);

comment on table public.risk_assessments is 'Procena rizika BZR po poseti ili klijentu.';

-- -----------------------------------------------------------------------------
-- risk_predictions — prediktivni model rizika (AI)
-- -----------------------------------------------------------------------------
create table public.risk_predictions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid references public.client_companies (id) on delete set null,
  field_visit_id uuid references public.field_visits (id) on delete set null,
  predicted_risk_level text not null
    check (predicted_risk_level in ('low', 'medium', 'high', 'critical')),
  confidence numeric(5, 4),
  model_version text,
  factors jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index risk_predictions_agency_id_idx on public.risk_predictions (agency_id);
create index risk_predictions_agency_created_idx on public.risk_predictions (agency_id, created_at desc);

comment on table public.risk_predictions is 'Predikcije rizika generisane AI modelom.';

-- -----------------------------------------------------------------------------
-- team_messages — timski chat agencije
-- -----------------------------------------------------------------------------
create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  sender_id uuid not null references auth.users (id),
  channel_id uuid not null default gen_random_uuid(),
  body text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index team_messages_agency_id_idx on public.team_messages (agency_id);
create index team_messages_agency_created_idx on public.team_messages (agency_id, created_at desc);
create index team_messages_channel_id_idx on public.team_messages (channel_id);

comment on table public.team_messages is 'Poruke timskog chata unutar agencije.';

-- -----------------------------------------------------------------------------
-- document_templates — šabloni dokumenata
-- -----------------------------------------------------------------------------
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  template_type text not null default 'custom',
  storage_path text,
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index document_templates_agency_id_idx on public.document_templates (agency_id);
create index document_templates_agency_created_idx on public.document_templates (agency_id, created_at desc);

comment on table public.document_templates is 'Šabloni za generisanje BZR dokumenata.';

-- -----------------------------------------------------------------------------
-- inspector_exports — izvoz za inspekciju (PDF/XLSX/JSON)
-- -----------------------------------------------------------------------------
create table public.inspector_exports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid references public.client_companies (id) on delete set null,
  exported_by uuid not null references auth.users (id),
  format text not null check (format in ('pdf', 'xlsx', 'json')),
  storage_path text,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb
);

create index inspector_exports_agency_id_idx on public.inspector_exports (agency_id);
create index inspector_exports_agency_created_idx on public.inspector_exports (agency_id, created_at desc);

comment on table public.inspector_exports is 'Generisani paketi za inspekciju i nadzor.';

-- -----------------------------------------------------------------------------
-- detailed_audit_logs — detaljan audit (append-only, po agenciji)
-- -----------------------------------------------------------------------------
create table public.detailed_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index detailed_audit_logs_agency_id_idx on public.detailed_audit_logs (agency_id);
create index detailed_audit_logs_agency_created_idx on public.detailed_audit_logs (agency_id, created_at desc);
create index detailed_audit_logs_actor_idx on public.detailed_audit_logs (actor_user_id);

comment on table public.detailed_audit_logs is 'Detaljan audit log akcija unutar agencije (immutable, append-only).';

-- -----------------------------------------------------------------------------
-- calendar_events — kalendar događaji (Google sync kasnije)
-- -----------------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid references public.client_companies (id) on delete set null,
  field_visit_id uuid references public.field_visits (id) on delete set null,
  created_by uuid not null references auth.users (id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  external_calendar_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index calendar_events_agency_id_idx on public.calendar_events (agency_id);
create index calendar_events_agency_created_idx on public.calendar_events (agency_id, created_at desc);
create index calendar_events_starts_at_idx on public.calendar_events (agency_id, starts_at);

comment on table public.calendar_events is 'Kalendar događaji agencije; sinhronizacija sa Google Calendar u Phase 2.';

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger field_visits_set_updated_at
  before update on public.field_visits
  for each row execute procedure public.set_updated_at();

create trigger field_photos_set_updated_at
  before update on public.field_photos
  for each row execute procedure public.set_updated_at();

create trigger voice_recordings_set_updated_at
  before update on public.voice_recordings
  for each row execute procedure public.set_updated_at();

create trigger video_recordings_set_updated_at
  before update on public.video_recordings
  for each row execute procedure public.set_updated_at();

create trigger risk_assessments_set_updated_at
  before update on public.risk_assessments
  for each row execute procedure public.set_updated_at();

create trigger risk_predictions_set_updated_at
  before update on public.risk_predictions
  for each row execute procedure public.set_updated_at();

create trigger team_messages_set_updated_at
  before update on public.team_messages
  for each row execute procedure public.set_updated_at();

create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row execute procedure public.set_updated_at();

create trigger inspector_exports_set_updated_at
  before update on public.inspector_exports
  for each row execute procedure public.set_updated_at();

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helper: da li korisnik pripada agenciji (preko agency_members)
-- -----------------------------------------------------------------------------
create or replace function public.user_belongs_to_agency(check_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = check_agency
    )
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.agency_id = check_agency
    );
$$;

-- -----------------------------------------------------------------------------
-- RLS — enable + politike po agency_id
-- -----------------------------------------------------------------------------
alter table public.field_visits enable row level security;
alter table public.field_photos enable row level security;
alter table public.voice_recordings enable row level security;
alter table public.video_recordings enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.risk_predictions enable row level security;
alter table public.team_messages enable row level security;
alter table public.document_templates enable row level security;
alter table public.inspector_exports enable row level security;
alter table public.detailed_audit_logs enable row level security;
alter table public.calendar_events enable row level security;

-- field_visits
create policy field_visits_agency_access on public.field_visits
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- field_photos
create policy field_photos_agency_access on public.field_photos
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- voice_recordings
create policy voice_recordings_agency_access on public.voice_recordings
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- video_recordings
create policy video_recordings_agency_access on public.video_recordings
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- risk_assessments
create policy risk_assessments_agency_access on public.risk_assessments
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- risk_predictions
create policy risk_predictions_agency_access on public.risk_predictions
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- team_messages
create policy team_messages_agency_access on public.team_messages
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- document_templates
create policy document_templates_agency_access on public.document_templates
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- inspector_exports
create policy inspector_exports_agency_access on public.inspector_exports
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- detailed_audit_logs (select + insert; bez update/delete — append-only)
create policy detailed_audit_logs_agency_select on public.detailed_audit_logs
  for select to authenticated
  using (public.user_belongs_to_agency(agency_id));

create policy detailed_audit_logs_agency_insert on public.detailed_audit_logs
  for insert to authenticated
  with check (
    public.user_belongs_to_agency(agency_id)
    and actor_user_id = auth.uid()
  );

-- calendar_events
create policy calendar_events_agency_access on public.calendar_events
  for all to authenticated
  using (public.user_belongs_to_agency(agency_id))
  with check (public.user_belongs_to_agency(agency_id));

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.field_visits to authenticated;
grant select, insert, update, delete on public.field_photos to authenticated;
grant select, insert, update, delete on public.voice_recordings to authenticated;
grant select, insert, update, delete on public.video_recordings to authenticated;
grant select, insert, update, delete on public.risk_assessments to authenticated;
grant select, insert, update, delete on public.risk_predictions to authenticated;
grant select, insert, update, delete on public.team_messages to authenticated;
grant select, insert, update, delete on public.document_templates to authenticated;
grant select, insert, update, delete on public.inspector_exports to authenticated;
grant select, insert on public.detailed_audit_logs to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket voice-recordings
-- Putanja: {agency_id}/{uuid}-{filename}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('voice-recordings', 'voice-recordings', false)
on conflict (id) do nothing;

create policy voice_recordings_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voice-recordings'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );

create policy voice_recordings_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-recordings'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );

create policy voice_recordings_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'voice-recordings'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );
