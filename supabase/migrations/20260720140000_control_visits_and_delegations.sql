-- -----------------------------------------------------------------------------
-- Kontrolne posete (parent_visit_id) + izmena broja naloga + visit_delegations
--
-- Broj naloga:
--   - Bez parent_visit_id: sledeći redni N/YY (postojeća godišnja sekvenca).
--   - Sa parent_visit_id: uvek se vezuje za KOREN originalnog naloga (ravan lanac).
--     Koreni broj 24/26 → kontrolne: 24-1/26, 24-2/26, 24-3/26 (nikad 24-1-1/26).
-- -----------------------------------------------------------------------------

-- 1) parent_visit_id — RESTRICT briše: ne dozvoli brisanje originala dok postoje kontrole
alter table public.field_visits
  add column if not exists parent_visit_id uuid
    references public.field_visits (id) on delete restrict;

comment on column public.field_visits.parent_visit_id is
  'Koren originalne posete za kontrolnu posetu (uvek root, ne međukontrola). Null = nova nezavisna poseta.';

create index if not exists field_visits_parent_visit_id_idx
  on public.field_visits (parent_visit_id)
  where parent_visit_id is not null;

-- 2) Trigger: redni broj ILI izvedeni kontrolni broj
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
  root_id uuid;
  walk_parent uuid;
  root_broj text;
  root_agency uuid;
  root_base text;
  sibling_count integer;
begin
  if NEW.agency_id is null then
    raise exception 'agency_id is required for broj_naloga';
  end if;

  NEW.hitno_otklanjanje := coalesce(NEW.hitno_otklanjanje, false);

  -- ---------- Kontrolna poseta ----------
  if NEW.parent_visit_id is not null then
    -- Popni se do korena (ravan lanac: sve kontrole → root)
    root_id := NEW.parent_visit_id;
    for i in 1..50 loop
      select v.parent_visit_id, v.broj_naloga, v.agency_id
        into walk_parent, root_broj, root_agency
      from public.field_visits v
      where v.id = root_id;

      if not found then
        raise exception 'parent_visit_id % ne postoji', NEW.parent_visit_id;
      end if;

      if root_agency is distinct from NEW.agency_id then
        raise exception 'Kontrolna poseta mora biti u istoj agenciji kao original';
      end if;

      if walk_parent is null then
        exit;
      end if;

      root_id := walk_parent;
    end loop;

    -- Uvek čuvaj referencu na koren (ne na međukontrolu)
    NEW.parent_visit_id := root_id;

    -- Zaključaj po korenu da izbegnemo trku za isti sufiks
    perform pg_advisory_xact_lock(hashtext(root_id::text));

    select v.broj_naloga into root_broj
    from public.field_visits v
    where v.id = root_id;

    if root_broj is null or position('/' in root_broj) = 0 then
      raise exception 'Koren posete nema važeći broj_naloga';
    end if;

    -- Iz "24/26" ili "24-1/26" → baza "24", godina "26"
    root_base := split_part(split_part(root_broj, '/', 1), '-', 1);
    year_short := split_part(root_broj, '/', 2);

    select count(*)::integer into sibling_count
    from public.field_visits v
    where v.parent_visit_id = root_id;

    NEW.broj_naloga :=
      root_base || '-' || (sibling_count + 1)::text || '/' || year_short;

    return NEW;
  end if;

  -- ---------- Nova nezavisna poseta (postojeća logika) ----------
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
  return NEW;
end;
$$;

comment on function public.assign_field_visit_broj_naloga() is
  'BEFORE INSERT: N/YY za nove posete; {N}-{k}/YY za kontrolne (ravan lanac do korena).';

-- Trigger već postoji iz prethodne migracije — recreate da koristi novu funkciju
drop trigger if exists field_visits_assign_broj_naloga on public.field_visits;
create trigger field_visits_assign_broj_naloga
  before insert on public.field_visits
  for each row
  execute procedure public.assign_field_visit_broj_naloga();

-- 3) Delegacije — privremeni nastavak tuđih naloga
create table if not exists public.visit_delegations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  from_user_id uuid not null references public.profiles (user_id) on delete cascade,
  to_user_id uuid not null references public.profiles (user_id) on delete cascade,
  granted_by uuid not null references auth.users (id) on delete cascade,
  active boolean not null default true,
  note text,
  revoked_at timestamptz,
  check (from_user_id <> to_user_id)
);

create index if not exists visit_delegations_agency_active_idx
  on public.visit_delegations (agency_id, active)
  where active = true;

create index if not exists visit_delegations_to_user_idx
  on public.visit_delegations (to_user_id, active)
  where active = true;

create unique index if not exists visit_delegations_active_pair_uidx
  on public.visit_delegations (agency_id, from_user_id, to_user_id)
  where active = true;

comment on table public.visit_delegations is
  'Owner dodeljuje radniku B pravo da kreira kontrolne posete za naloge radnika A.';

alter table public.visit_delegations enable row level security;

drop policy if exists visit_delegations_select on public.visit_delegations;
create policy visit_delegations_select on public.visit_delegations
  for select to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
    or to_user_id = auth.uid()
    or from_user_id = auth.uid()
  );

drop policy if exists visit_delegations_insert on public.visit_delegations;
create policy visit_delegations_insert on public.visit_delegations
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists visit_delegations_update on public.visit_delegations;
create policy visit_delegations_update on public.visit_delegations
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists visit_delegations_delete on public.visit_delegations;
create policy visit_delegations_delete on public.visit_delegations
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

grant select, insert, update, delete on public.visit_delegations to authenticated;
