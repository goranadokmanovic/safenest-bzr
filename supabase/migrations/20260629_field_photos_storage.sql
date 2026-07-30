-- -----------------------------------------------------------------------------
-- Storage: bucket field-photos (Phase 2 offline-first — sinhronizacija slika)
-- Putanja: {agency_id}/{field_visit_id}/{uuid}-{filename}
-- RLS preslikava obrazac voice-recordings bucketa.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('field-photos', 'field-photos', false)
on conflict (id) do nothing;

create policy field_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-photos'
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

create policy field_photos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'field-photos'
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

create policy field_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'field-photos'
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
