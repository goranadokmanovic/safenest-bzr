-- -----------------------------------------------------------------------------
-- Broj naloga (N/YY po agenciji i godini) + Hitno otklanjanje
-- -----------------------------------------------------------------------------

alter table public.field_visits
  add column if not exists broj_naloga text;

alter table public.field_visits
  add column if not exists hitno_otklanjanje boolean not null default false;

comment on column public.field_visits.broj_naloga is
  'Broj naloga u formatu N/YY (npr. 1/26, 153/26); reset po kalendarskoj godini (Europe/Belgrade).';
comment on column public.field_visits.hitno_otklanjanje is
  'Da li poseta zahteva hitno otklanjanje.';

-- Brojač po agenciji + godini (atomički nextval)
create table if not exists public.field_visit_year_counters (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  year smallint not null,
  last_seq integer not null default 0,
  primary key (agency_id, year),
  check (year >= 2000 and year <= 2100),
  check (last_seq >= 0)
);

comment on table public.field_visit_year_counters is
  'Sekvenca broja naloga po agenciji i godini (Europe/Belgrade).';

alter table public.field_visit_year_counters enable row level security;

-- Brojač menja samo trigger (security definer); aplikacija ne čita direktno.
revoke all on public.field_visit_year_counters from authenticated, anon;

create or replace function public.assign_field_visit_broj_naloga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_year integer;
  year_short text;
  next_seq integer;
begin
  if NEW.agency_id is null then
    raise exception 'agency_id is required for broj_naloga';
  end if;

  -- Godina posete po Europe/Belgrade (ne UTC).
  visit_year := extract(
    year from (coalesce(NEW.scheduled_at, now()) at time zone 'Europe/Belgrade')
  )::integer;
  year_short := right(visit_year::text, 2);

  insert into public.field_visit_year_counters (agency_id, year, last_seq)
  values (NEW.agency_id, visit_year, 1)
  on conflict (agency_id, year)
  do update set last_seq = public.field_visit_year_counters.last_seq + 1
  returning last_seq into next_seq;

  NEW.broj_naloga := next_seq::text || '/' || year_short;
  NEW.hitno_otklanjanje := coalesce(NEW.hitno_otklanjanje, false);
  return NEW;
end;
$$;

drop trigger if exists field_visits_assign_broj_naloga on public.field_visits;
create trigger field_visits_assign_broj_naloga
  before insert on public.field_visits
  for each row
  execute procedure public.assign_field_visit_broj_naloga();

-- Backfill postojećih redova (redosled: scheduled_at, created_at)
do $$
declare
  r record;
  visit_year integer;
  year_short text;
  next_seq integer;
begin
  for r in
    select id, agency_id, scheduled_at, created_at
    from public.field_visits
    where broj_naloga is null
    order by agency_id,
      extract(year from (coalesce(scheduled_at, created_at) at time zone 'Europe/Belgrade')),
      coalesce(scheduled_at, created_at),
      created_at,
      id
  loop
    visit_year := extract(
      year from (coalesce(r.scheduled_at, r.created_at, now()) at time zone 'Europe/Belgrade')
    )::integer;
    year_short := right(visit_year::text, 2);

    insert into public.field_visit_year_counters (agency_id, year, last_seq)
    values (r.agency_id, visit_year, 1)
    on conflict (agency_id, year)
    do update set last_seq = public.field_visit_year_counters.last_seq + 1
    returning last_seq into next_seq;

    update public.field_visits
    set broj_naloga = next_seq::text || '/' || year_short
    where id = r.id;
  end loop;
end $$;

alter table public.field_visits
  alter column broj_naloga set not null;

create unique index if not exists field_visits_agency_broj_naloga_uidx
  on public.field_visits (agency_id, broj_naloga);

create index if not exists field_visits_hitno_otklanjanje_idx
  on public.field_visits (agency_id, hitno_otklanjanje)
  where hitno_otklanjanje = true;

create index if not exists field_visits_broj_naloga_idx
  on public.field_visits (agency_id, broj_naloga);
