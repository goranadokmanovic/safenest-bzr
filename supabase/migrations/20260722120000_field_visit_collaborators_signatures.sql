-- -----------------------------------------------------------------------------
-- Više radnika na poseti + zajedničko potpisivanje zapisnika
-- -----------------------------------------------------------------------------

-- Many-to-many: dodatni saradnici (pored assigned_user_id)
create table if not exists public.field_visit_collaborators (
  id uuid primary key default gen_random_uuid(),
  field_visit_id uuid not null references public.field_visits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  unique (field_visit_id, user_id)
);

create index if not exists field_visit_collaborators_visit_idx
  on public.field_visit_collaborators (field_visit_id);
create index if not exists field_visit_collaborators_user_idx
  on public.field_visit_collaborators (user_id);

comment on table public.field_visit_collaborators is
  'Dodatni radnici na terenskoj poseti (pored field_visits.assigned_user_id).';

-- Istorija / više potpisa po poseti
create table if not exists public.field_visit_signatures (
  id uuid primary key default gen_random_uuid(),
  field_visit_id uuid not null references public.field_visits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  signed_at timestamptz not null default now(),
  signature_statement text not null,
  report_content_hash text,
  unique (field_visit_id, user_id)
);

create index if not exists field_visit_signatures_visit_idx
  on public.field_visit_signatures (field_visit_id);

comment on table public.field_visit_signatures is
  'Potpisi zapisnika: zapisnik je closed tek kad svi učesnici (assigned + collaborators) potpišu.';

-- Da li je korisnik učesnik posete (primarni ili saradnik)
create or replace function public.is_field_visit_participant(p_visit_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.field_visits v
    where v.id = p_visit_id
      and (
        v.assigned_user_id = p_user_id
        or exists (
          select 1
          from public.field_visit_collaborators c
          where c.field_visit_id = v.id
            and c.user_id = p_user_id
        )
      )
  );
$$;

revoke all on function public.is_field_visit_participant(uuid, uuid) from public;
grant execute on function public.is_field_visit_participant(uuid, uuid) to authenticated;

-- Pristup redovima posete: agencija (kao do sada) ILI učesnik
-- Zadržavamo agency-wide SELECT radi „Sve posete“ / owner pregleda;
-- učesnik helper koristi API i buduće restriktivnije politike.
create or replace function public.can_access_field_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.field_visits v
    where v.id = p_visit_id
      and (
        public.has_agency_access(v.agency_id)
        or public.is_field_visit_participant(v.id, auth.uid())
      )
  );
$$;

revoke all on function public.can_access_field_visit(uuid) from public;
grant execute on function public.can_access_field_visit(uuid) to authenticated;

alter table public.field_visit_collaborators enable row level security;
alter table public.field_visit_signatures enable row level security;

drop policy if exists field_visit_collaborators_access on public.field_visit_collaborators;
create policy field_visit_collaborators_access on public.field_visit_collaborators
  for all to authenticated
  using (public.can_access_field_visit(field_visit_id))
  with check (public.can_access_field_visit(field_visit_id));

drop policy if exists field_visit_signatures_access on public.field_visit_signatures;
create policy field_visit_signatures_access on public.field_visit_signatures
  for all to authenticated
  using (public.can_access_field_visit(field_visit_id))
  with check (public.can_access_field_visit(field_visit_id));
