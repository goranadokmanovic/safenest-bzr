-- -----------------------------------------------------------------------------
-- Fix has_agency_access: ne porediti profiles.role (text) sa member_role (enum).
-- Greška u produkciji: operator does not exist: text = member_role
-- -----------------------------------------------------------------------------

create or replace function public.has_agency_access(check_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.agency_id = check_agency
    )
    or exists (
      select 1
      from public.agency_members am
      where am.user_id = auth.uid()
        and am.agency_id = check_agency
    );
$$;

comment on function public.has_agency_access(uuid) is
  'Da li auth.uid() pripada agenciji (super_admin, profiles.agency_id ili agency_members).';
