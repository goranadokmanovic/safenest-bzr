-- -----------------------------------------------------------------------------
-- Postoji li klijent tog naziva u MOJOJ agenciji (SECURITY DEFINER)
--
-- Od migracije 20260730210000 saradnik kroz RLS ne vidi klijente koji mu nisu
-- dodeljeni, pa je AI asistent na pitanje o takvom klijentu odgovarao
-- "ne postoji klijent pod tim nazivom" — netačno i zbunjujuće. Treba razlikovati
-- "nema ga nigde" od "postoji, ali nije u tvom opsegu".
--
-- Funkcija namerno vraća SAMO boolean. Ne otkriva id, naziv, zaduženog
-- saradnika ni bilo koji drugi podatak o klijentu.
--
-- Agencija se izvodi iz auth.uid(), NE prima se kao argument — korisnik ne može
-- da ispituje postojanje klijenata u tuđoj agenciji.
-- -----------------------------------------------------------------------------

create or replace function public.client_exists_in_agency(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_needle text;
begin
  select p.agency_id into v_agency
  from public.profiles p
  where p.user_id = auth.uid();

  if v_agency is null then
    return false;
  end if;

  -- Skidamo ILIKE meta-znake da naziv ne može da se pretvori u džoker koji bi
  -- potvrdio postojanje bilo kog klijenta.
  v_needle := regexp_replace(btrim(coalesce(p_name, '')), '[%_\\]', '', 'g');

  if length(v_needle) < 2 then
    return false;
  end if;

  return exists (
    select 1
    from public.client_companies c
    where c.agency_id = v_agency
      and c.archived_at is null
      and (
        c.name ilike '%' || v_needle || '%'
        or c.legal_name ilike '%' || v_needle || '%'
      )
  );
end;
$$;

comment on function public.client_exists_in_agency(text) is
  'Da li u agenciji pozivaoca postoji klijent sa tim nazivom. Vraća samo boolean, bez detalja; agencija se izvodi iz auth.uid(). Koristi AI asistent da razlikuje "ne postoji" od "van tvog opsega".';

revoke all on function public.client_exists_in_agency(text) from public;
grant execute on function public.client_exists_in_agency(text) to authenticated, service_role;
