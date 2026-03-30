-- SafeNest BZR — Phase 3 core schema (Faze 3–6): tabele, RLS, auth trigger, Stripe idempotency.
-- Primeni u Supabase SQL Editor na PRAZNOJ bazi (jednom), ili: supabase link && supabase db push
--
-- Posle pokretanja: u SQL Editoru postavi prvog super_admin-a npr.
--   update public.profiles set role = 'super_admin' where email = 'tvoj@email.com';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  legal_name text,
  tax_id text,
  address text,
  phone text,
  trial_ends_at timestamptz,
  subscription_status text not null default 'none',
  plan_tier text not null default 'agency_basic',
  stripe_customer_id text,
  stripe_subscription_id text
);

create unique index if not exists agencies_stripe_customer_id_key
  on public.agencies (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists agencies_stripe_subscription_id_idx
  on public.agencies (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table public.client_companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  legal_name text,
  tax_id text,
  activity_sector text,
  address text,
  contact_email text,
  contact_phone text,
  semaphore text not null default 'green'
    check (semaphore in ('green', 'yellow', 'red')),
  notes text,
  archived_at timestamptz
);

create index client_companies_agency_id_idx on public.client_companies (agency_id);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  email text not null default '',
  full_name text not null default '',
  role text not null default 'agency_collaborator'
    check (
      role in (
        'super_admin',
        'agency_owner',
        'agency_collaborator',
        'field_worker',
        'client_user'
      )
    ),
  locale text not null default 'sr' check (locale in ('sr', 'en')),
  agency_id uuid references public.agencies (id) on delete set null,
  client_company_id uuid references public.client_companies (id) on delete set null
);

create index profiles_agency_id_idx on public.profiles (agency_id);
create index profiles_role_idx on public.profiles (role);

-- Zavise od tabele profiles (mora posle CREATE TABLE profiles)
create or replace function public.is_super_admin()
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
      and p.role = 'super_admin'
  );
$$;

create or replace function public.profile_matching_agency(check_agency uuid)
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
      and p.agency_id is not null
      and p.agency_id = check_agency
  );
$$;

create table public.agency_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'collaborator'
    check (member_role in ('owner', 'collaborator', 'field_worker')),
  invited_at timestamptz,
  joined_at timestamptz,
  invited_by uuid references auth.users (id),
  unique (agency_id, user_id)
);

create index agency_members_agency_id_idx on public.agency_members (agency_id);
create index agency_members_user_id_idx on public.agency_members (user_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid not null references public.client_companies (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  position text,
  personal_id_masked text,
  employment_start date,
  active boolean not null default true
);

create index employees_agency_id_idx on public.employees (agency_id);
create index employees_client_company_id_idx on public.employees (client_company_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid not null references public.client_companies (id) on delete cascade,
  folder text not null
    check (folder in ('bzr', 'employment', 'agency', 'generated')),
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references auth.users (id),
  metadata jsonb not null default '{}'::jsonb
);

create index documents_agency_id_idx on public.documents (agency_id);
create index documents_client_company_id_idx on public.documents (client_company_id);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_company_id uuid references public.client_companies (id) on delete set null,
  entity_type text not null
    check (entity_type in ('medical', 'training', 'ppe', 'document', 'custom')),
  entity_id uuid,
  due_at timestamptz not null,
  title text,
  reminder_sent_at timestamptz
);

create index deadlines_agency_due_idx on public.deadlines (agency_id, due_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete set null,
  type text not null default 'info',
  title text not null default '',
  body text not null default '',
  severity text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text
);

create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_agency_id_idx on public.notifications (agency_id);

create unique index if not exists notifications_user_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- Admin audit (samo service_role u aplikaciji)
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_actor_idx on public.admin_audit_log (actor_user_id);

-- Stripe webhook idempotency (Faza 6)
create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  process_error text
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute procedure public.set_updated_at();

create trigger client_companies_set_updated_at
  before update on public.client_companies
  for each row execute procedure public.set_updated_at();

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute procedure public.set_updated_at();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute procedure public.set_updated_at();

create trigger deadlines_set_updated_at
  before update on public.deadlines
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- New user → profil (Faza 4)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, role, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'agency_collaborator',
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'sr')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.agencies enable row level security;
alter table public.client_companies enable row level security;
alter table public.profiles enable row level security;
alter table public.agency_members enable row level security;
alter table public.employees enable row level security;
alter table public.documents enable row level security;
alter table public.deadlines enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.stripe_events enable row level security;

-- agencies
create policy agencies_select_visible
  on public.agencies for select to authenticated
  using (
    public.is_super_admin()
    or id in (
      select p.agency_id from public.profiles p
      where p.user_id = auth.uid()
        and p.agency_id is not null
    )
  );

-- client_companies
create policy client_companies_select
  on public.client_companies for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy client_companies_insert
  on public.client_companies for insert to authenticated
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy client_companies_update
  on public.client_companies for update to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy client_companies_delete
  on public.client_companies for delete to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

-- profiles
create policy profiles_select
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- agency_members
create policy agency_members_select
  on public.agency_members for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

-- employees
create policy employees_select
  on public.employees for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy employees_insert
  on public.employees for insert to authenticated
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy employees_update
  on public.employees for update to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy employees_delete
  on public.employees for delete to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

-- documents
create policy documents_select
  on public.documents for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy documents_insert
  on public.documents for insert to authenticated
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy documents_update
  on public.documents for update to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy documents_delete
  on public.documents for delete to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

-- deadlines
create policy deadlines_select
  on public.deadlines for select to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy deadlines_insert
  on public.deadlines for insert to authenticated
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy deadlines_update
  on public.deadlines for update to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  )
  with check (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

create policy deadlines_delete
  on public.deadlines for delete to authenticated
  using (
    public.is_super_admin()
    or public.profile_matching_agency(agency_id)
  );

-- notifications
create policy notifications_select
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Column-level grants: sprečava eskalaciju uloge preko Supabase klijenta (Faza 6)
-- -----------------------------------------------------------------------------
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, locale) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Grants (RLS i dalje primenjuje filter)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.agencies to authenticated;
grant select, insert, update, delete on public.client_companies to authenticated;
grant select, insert, update, delete on public.agency_members to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.deadlines to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket za dokumente (politike po potrebi u Fazi 9)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

comment on table public.stripe_events is 'Idempotent Stripe webhooks (Faza 6–7).';
comment on table public.admin_audit_log is 'Admin audit; upis samo preko service_role API-ja.';
