-- -----------------------------------------------------------------------------
-- Pozivnice za agency_collaborator (terenski radnici)
-- -----------------------------------------------------------------------------

create table if not exists public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text,
  invite_code text not null,
  role text not null default 'agency_collaborator'
    check (role in ('agency_collaborator', 'agency_owner', 'field_worker')),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create unique index if not exists agency_invites_invite_code_uidx
  on public.agency_invites (invite_code);

create index if not exists agency_invites_agency_id_idx
  on public.agency_invites (agency_id);

create index if not exists agency_invites_agency_active_idx
  on public.agency_invites (agency_id, expires_at)
  where used_at is null;

comment on table public.agency_invites is
  'Pozivnice za pridruživanje agenciji (agency_collaborator).';

alter table public.agency_invites enable row level security;

drop policy if exists agency_invites_select on public.agency_invites;
create policy agency_invites_select on public.agency_invites
  for select to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists agency_invites_insert on public.agency_invites;
create policy agency_invites_insert on public.agency_invites
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists agency_invites_update on public.agency_invites;
create policy agency_invites_update on public.agency_invites
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

drop policy if exists agency_invites_delete on public.agency_invites;
create policy agency_invites_delete on public.agency_invites
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_agency(agency_id)
  );

grant select, insert, update, delete on public.agency_invites to authenticated;
