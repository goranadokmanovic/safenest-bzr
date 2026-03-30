-- SAMO ZA DEVELOPMENT: briše objekte koje kreira Phase 3 migracija.
-- Pokreni OVO prvo u SQL Editoru, zatim ponovo ceo fajl:
--   supabase/migrations/20250329120000_phase3_core_schema.sql
-- NE POKRETATI na produkciji sa podacima kojima treba da ostanu!

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.stripe_events cascade;
drop table if exists public.admin_audit_log cascade;
drop table if exists public.notifications cascade;
drop table if exists public.deadlines cascade;
drop table if exists public.documents cascade;
drop table if exists public.employees cascade;
drop table if exists public.agency_members cascade;
drop table if exists public.profiles cascade;
drop table if exists public.client_companies cascade;
drop table if exists public.agencies cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_super_admin() cascade;
drop function if exists public.profile_matching_agency(uuid) cascade;

-- Bucket se NE briše ovde: Supabase zabranjuje DELETE nad storage.* iz SQL.
-- Ako ti smeta stari "documents" bucket: Dashboard → Storage → obrisi bucket ručno.
-- Migracija ga ponovo dodaje sa INSERT ... ON CONFLICT DO NOTHING.
