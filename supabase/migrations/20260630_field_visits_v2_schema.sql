-- field_visits: scheduled_at, sync_status, assigned_user_id (v2 šema)

-- Nove kolone
alter table public.field_visits
  add column if not exists scheduled_at timestamptz;

alter table public.field_visits
  add column if not exists started_at timestamptz;

alter table public.field_visits
  add column if not exists completed_at timestamptz;

alter table public.field_visits
  add column if not exists sync_status text not null default 'pending';

alter table public.field_visits
  add column if not exists assigned_user_id uuid references auth.users (id) on delete set null;

alter table public.field_visits
  add column if not exists offline_client_id text;

-- Migracija iz starog modela
update public.field_visits
set scheduled_at = visit_date
where scheduled_at is null and visit_date is not null;

update public.field_visits
set scheduled_at = created_at
where scheduled_at is null;

update public.field_visits
set assigned_user_id = assigned_to
where assigned_user_id is null and assigned_to is not null;

update public.field_visits
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('notes', notes)
where notes is not null
  and trim(notes) <> ''
  and not (coalesce(metadata, '{}'::jsonb) ? 'notes');

update public.field_visits
set sync_status = 'synced'
where sync_status = 'pending';

-- scheduled_at obavezan
alter table public.field_visits
  alter column scheduled_at set default now();

alter table public.field_visits
  alter column scheduled_at set not null;

-- sync_status check
alter table public.field_visits
  drop constraint if exists field_visits_sync_status_check;

alter table public.field_visits
  add constraint field_visits_sync_status_check
  check (sync_status in ('pending', 'synced', 'failed'));

-- status: scheduled | in_progress | completed (zadrži cancelled u bazi ako postoji)
alter table public.field_visits
  drop constraint if exists field_visits_status_check;

alter table public.field_visits
  add constraint field_visits_status_check
  check (status in ('scheduled', 'in_progress', 'completed', 'cancelled'));

-- Indeks za sort
create index if not exists field_visits_agency_scheduled_idx
  on public.field_visits (agency_id, scheduled_at desc);

comment on column public.field_visits.scheduled_at is 'Zakazano vreme posete';
comment on column public.field_visits.sync_status is 'pending | synced | failed';
comment on column public.field_visits.assigned_user_id is 'Dodeljeni terenski radnik (auth.users.id)';
comment on column public.field_visits.offline_client_id is 'Lokalni UUID sa uređaja pre sync-a';

-- Stare kolone ostaju privremeno radi kompatibilnosti; aplikacija koristi novi model
