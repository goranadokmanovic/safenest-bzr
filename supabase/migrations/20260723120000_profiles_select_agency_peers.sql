-- -----------------------------------------------------------------------------
-- profiles: članovi iste agencije moraju da vide profile kolega
-- (dropdown „Izaberi kolegu…”, filter radnika, delegacije)
-- Ako profiles_select_agency_peers nije primenjen ili koristi zastareli helper,
-- SELECT vraća samo sopstveni red → prazan dropdown bez JS greške.
-- -----------------------------------------------------------------------------

drop policy if exists profiles_select_agency_peers on public.profiles;

create policy profiles_select_agency_peers
  on public.profiles for select to authenticated
  using (
    agency_id is not null
    and public.has_agency_access(agency_id)
  );

comment on policy profiles_select_agency_peers on public.profiles is
  'Član agencije vidi profile ostalih članova iste agencije (ne cele platforme).';
