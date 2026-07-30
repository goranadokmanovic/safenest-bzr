-- Klijent: PIB (tax_id), adresa prijave (address), više adresa obavljanja delatnosti

alter table public.client_companies
  add column if not exists operation_addresses jsonb not null default '[]'::jsonb;

alter table public.client_companies
  drop constraint if exists client_companies_operation_addresses_is_array;

alter table public.client_companies
  add constraint client_companies_operation_addresses_is_array
  check (jsonb_typeof(operation_addresses) = 'array');

comment on column public.client_companies.tax_id is 'PIB (poreski identifikacioni broj)';
comment on column public.client_companies.address is 'Adresa prijave delatnosti';
comment on column public.client_companies.operation_addresses is 'Adrese obavljanja delatnosti (JSON niz stringova)';
