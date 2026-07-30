-- Phase 5: RLS dopune — agencies UPDATE, profiles peer read, storage, notifications INSERT

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_agency_owner(check_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.agency_id = check_agency
      and p.role = 'agency_owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- agencies: vlasnik može ažurirati podatke agencije
-- -----------------------------------------------------------------------------
create policy agencies_update_owner
  on public.agencies for update to authenticated
  using (public.is_super_admin() or public.is_agency_owner(id))
  with check (public.is_super_admin() or public.is_agency_owner(id));

-- -----------------------------------------------------------------------------
-- profiles: članovi iste agencije vide osnovne podatke kolega (lista članova)
-- -----------------------------------------------------------------------------
create policy profiles_select_agency_peers
  on public.profiles for select to authenticated
  using (
    agency_id is not null
    and public.profile_matching_agency(agency_id)
  );

-- -----------------------------------------------------------------------------
-- notifications: agencijski korisnici mogu kreirati obaveštenja za kolege
-- -----------------------------------------------------------------------------
create policy notifications_insert_agency
  on public.notifications for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      agency_id is not null
      and public.profile_matching_agency(agency_id)
      and exists (
        select 1
        from public.profiles p
        where p.user_id = notifications.user_id
          and p.agency_id = notifications.agency_id
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Storage: bucket documents — upload/read/delete po agency_id u putanji
-- Putanja: {agency_id}/{client_company_id}/{filename}
-- -----------------------------------------------------------------------------
create policy documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );

create policy documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );

create policy documents_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );

create policy documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] in (
        select p.agency_id::text
        from public.profiles p
        where p.user_id = auth.uid()
          and p.agency_id is not null
      )
    )
  );
