-- -----------------------------------------------------------------------------
-- Javna provera pozivnice (SECURITY DEFINER) — bez RLS za anon korisnike
-- Vraća samo polja potrebna za validate/accept; ne izlaže celu tabelu.
-- -----------------------------------------------------------------------------

create or replace function public.get_agency_invite_by_code(p_code text)
returns table (
  id uuid,
  agency_id uuid,
  email text,
  role text,
  expires_at timestamptz,
  used_at timestamptz,
  agency_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.id,
    i.agency_id,
    i.email,
    i.role,
    i.expires_at,
    i.used_at,
    a.name as agency_name
  from public.agency_invites i
  left join public.agencies a on a.id = i.agency_id
  where i.invite_code = trim(p_code)
  limit 1;
$$;

comment on function public.get_agency_invite_by_code(text) is
  'Lookup pozivnice po kodu za registraciju radnika (bypass RLS, samo jedan red).';

revoke all on function public.get_agency_invite_by_code(text) from public;
grant execute on function public.get_agency_invite_by_code(text) to anon, authenticated, service_role;
