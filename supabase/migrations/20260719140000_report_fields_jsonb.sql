-- -----------------------------------------------------------------------------
-- Faza C: strukturirana polja zapisnika
--
-- Dodajemo report_fields (jsonb) pored postojećeg report (text).
-- Stari tekstualni zapisnici ostaju u report; nova generisanja i UI koriste
-- report_fields. Pri čuvanju polja aplikacija sinhronizuje i report tekst.
-- -----------------------------------------------------------------------------

alter table public.field_visits
  add column if not exists report_fields jsonb;

comment on column public.field_visits.report_fields is
  'Strukturirani zapisnik: objekat { "Naziv polja": "vrednost", ... } iz šablona.';

comment on column public.field_visits.report is
  'Tekstualni prikaz zapisnika (sinhronizovan iz report_fields; legacy free-text ostaje).';
