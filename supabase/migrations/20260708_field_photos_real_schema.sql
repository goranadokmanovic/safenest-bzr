-- -----------------------------------------------------------------------------
-- field_photos — usklađivanje sa stvarnom šemom u Supabase
-- Stvarne kolone: id, field_visit_id, photo_url, extracted_dates, ocr_confidence,
-- created_at, updated_at (+ ocr_text dodato ispod za slobodan OCR tekst)
-- Pristup preko field_visits.agency_id (nema agency_id kolone u field_photos).
-- -----------------------------------------------------------------------------

alter table public.field_photos
  add column if not exists ocr_text text;

comment on column public.field_photos.ocr_text is
  'Slobodan OCR tekst (tesseract). extracted_dates drži strukturirane datume iz OCR-a.';

-- Zamenjujemo staru politiku koja koristi nepostojeću agency_id kolonu.
drop policy if exists field_photos_agency_access on public.field_photos;

drop policy if exists field_photos_select on public.field_photos;
drop policy if exists field_photos_insert on public.field_photos;
drop policy if exists field_photos_update on public.field_photos;
drop policy if exists field_photos_delete on public.field_photos;

create policy field_photos_select on public.field_photos
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.field_visits fv
      where fv.id = field_photos.field_visit_id
        and public.has_agency_access(fv.agency_id)
    )
  );

create policy field_photos_insert on public.field_photos
  for insert to authenticated
  with check (
    public.is_super_admin()
    or exists (
      select 1
      from public.field_visits fv
      where fv.id = field_photos.field_visit_id
        and public.has_agency_access(fv.agency_id)
    )
  );

create policy field_photos_update on public.field_photos
  for update to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.field_visits fv
      where fv.id = field_photos.field_visit_id
        and public.has_agency_access(fv.agency_id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
      from public.field_visits fv
      where fv.id = field_photos.field_visit_id
        and public.has_agency_access(fv.agency_id)
    )
  );

create policy field_photos_delete on public.field_photos
  for delete to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.field_visits fv
      where fv.id = field_photos.field_visit_id
        and public.has_agency_access(fv.agency_id)
    )
  );
