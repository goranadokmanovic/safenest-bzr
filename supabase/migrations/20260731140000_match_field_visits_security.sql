-- -----------------------------------------------------------------------------
-- match_field_visits: vrati RLS i skini pravo izvršavanja sa anon
--
-- Funkcija je kreirana direktno u Supabase-u (nema je ni u jednoj migraciji) i
-- ponaša se kao SECURITY DEFINER. Provera 2026-07-31: poziv **anonimnim ključem
-- bez ijedne sesije**, sa match_agency_id => null, vratio je sve terenske
-- posete iz baze, zajedno sa napomenama. Anon ključ je javan (šalje se u
-- pretraživač), a agencija se bira iz argumenta koji zadaje pozivalac, pa je to
-- bilo čitanje podataka svih agencija bez prijave.
--
-- Ne diramo telo funkcije — ne postoji u repozitorijumu, pa bi ga rekreiranje
-- napamet lako promenilo. Menjamo samo bezbednosni model:
--   * SECURITY INVOKER → važi RLS pozivaoca (field_visits_agency_access)
--   * EXECUTE se skida sa PUBLIC/anon, ostaje authenticated i service_role
--
-- Petlja preko pg_proc pokriva svaki potpis i eventualne preopterećene verzije,
-- pa migracija ne zavisi od tačnih tipova argumenata.
-- -----------------------------------------------------------------------------

do $$
declare
  r record;
  found_any boolean := false;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_field_visits'
  loop
    found_any := true;
    execute format('alter function %s security invoker', r.sig);
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    raise notice 'match_field_visits osiguran: %', r.sig;
  end loop;

  if not found_any then
    raise warning 'Funkcija public.match_field_visits nije pronađena — proveri da li je pretraga uopšte postavljena.';
  end if;
end $$;
