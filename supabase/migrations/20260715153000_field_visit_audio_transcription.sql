-- -----------------------------------------------------------------------------
-- Field visit audio notes and OpenAI transcription (Phase A)
-- Storage path: {agency_id}/{field_visit_id}/{uuid}-{filename}
-- Existing field_visits RLS continues to protect the new columns row-by-row.
-- -----------------------------------------------------------------------------
alter table public.field_visits
  add column if not exists audio_url text;

alter table public.field_visits
  add column if not exists transcript text;

alter table public.field_visits
  add column if not exists transcript_status text not null default 'pending';

alter table public.field_visits
  add column if not exists noise_mode text;

alter table public.field_visits
  drop constraint if exists field_visits_transcript_status_check;

alter table public.field_visits
  add constraint field_visits_transcript_status_check
  check (transcript_status in ('pending', 'processing', 'done', 'failed'));

alter table public.field_visits
  drop constraint if exists field_visits_noise_mode_check;

alter table public.field_visits
  add constraint field_visits_noise_mode_check
  check (noise_mode is null or noise_mode in ('quiet', 'noisy'));

comment on column public.field_visits.audio_url is
  'Private field-audio Storage object path (not a permanent public URL)';
comment on column public.field_visits.transcript is
  'Raw or manually corrected audio transcript';
comment on column public.field_visits.transcript_status is
  'pending | processing | done | failed';
comment on column public.field_visits.noise_mode is
  'quiet | noisy; controls OpenAI transcription model selection';

insert into storage.buckets (id, name, public)
values ('field-audio', 'field-audio', false)
on conflict (id) do update set public = false;

drop policy if exists field_audio_storage_insert on storage.objects;
create policy field_audio_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-audio'
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

drop policy if exists field_audio_storage_select on storage.objects;
create policy field_audio_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'field-audio'
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

drop policy if exists field_audio_storage_delete on storage.objects;
create policy field_audio_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'field-audio'
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
