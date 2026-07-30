-- -----------------------------------------------------------------------------
-- Digitalni potpis pri zatvaranju zapisnika
-- signed_by / signed_at = report_closed_by / report_closed_at (bez dupliranja)
-- -----------------------------------------------------------------------------

alter table public.field_visits
  add column if not exists signature_statement text;

alter table public.field_visits
  add column if not exists report_content_hash text;

comment on column public.field_visits.signature_statement is
  'Tekstualna potvrda potpisa (npr. „Zapisnik potpisan od strane … dana … u …”). Prepisuje se pri svakom novom zatvaranju.';
comment on column public.field_visits.report_content_hash is
  'SHA-256 hash sadržaja zapisnika (report_fields ili report) u trenutku potpisivanja.';
comment on column public.field_visits.report_closed_by is
  'Ko je zatvorio/potpisao zapisnik (auth.users) — služi i kao signed_by.';
comment on column public.field_visits.report_closed_at is
  'Kada je zapisnik zatvoren/potpisan — služi i kao signed_at.';
