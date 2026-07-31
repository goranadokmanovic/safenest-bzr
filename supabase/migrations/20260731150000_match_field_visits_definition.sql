-- -----------------------------------------------------------------------------
-- match_field_visits: verzija u repozitorijumu + čišćenje overload-a
--
-- Do 2026-07-31 funkcija je živela samo u produkciji (kreirana ručno u
-- Supabase Studiju), bez ijedne migracije. Telo je izvučeno iz baze
-- (pg_get_functiondef) za potpis sa 5 argumenata — to je jedina verzija koju
-- aplikacija zove (lib/search/field-visits.ts).
--
-- U produkciji su postojale i dve starije preopterećene verzije (3 i 4
-- argumenta). PostgREST ih nije mogao razrešiti (PGRST203), aplikacija ih ne
-- koristi — brišemo ih ovde.
--
-- Bezbednosni model (SECURITY INVOKER + revoke anon/public) ponavlja se
-- namerno, isti kao u 20260731140000, da sveža baza koja pokrene samo ovu
-- migraciju dobije istu sliku. CREATE OR REPLACE ne garantuje da zadrži
-- INVOKER/GRANT stanje, pa se eksplicitno postavlja ispod.
--
-- Tip parametra je `vector` (bez (1536)): Postgres ne čuva tip-modifikator na
-- argumentima funkcije, pa pg_get_functiondef i prikazuje samo `vector`.
-- Dimenzija 1536 živi na koloni field_visits.embedding i u
-- lib/api/embeddings.ts (text-embedding-3-small).
-- -----------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

-- Kolona je takođe dodata ručno u produkciji; IF NOT EXISTS je no-op tamo,
-- a omogućava podizanje sveže baze iz migracija.
alter table public.field_visits
  add column if not exists embedding extensions.vector(1536);

comment on column public.field_visits.embedding is
  'Embedding vektor za semantičku pretragu. Model: OpenAI text-embedding-3-small, dimenzija 1536 (v. lib/api/embeddings.ts).';

-- Indeks samo ako na koloni još ne postoji nijedan — u produkciji može već
-- biti IVFFlat/HNSW pod drugim imenom; ne pravimo duplikat.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid
                       and a.attnum = any (i.indkey)
                       and not a.attisdropped
    where n.nspname = 'public'
      and t.relname = 'field_visits'
      and a.attname = 'embedding'
  ) then
    create index field_visits_embedding_cosine_idx
      on public.field_visits
      using hnsw (embedding vector_cosine_ops);
  end if;
end $$;

-- Stare preopterećene verzije (PostgREST PGRST203 na pozivu sa 3/4 arg.).
drop function if exists public.match_field_visits(extensions.vector, uuid, integer);
drop function if exists public.match_field_visits(extensions.vector, uuid, integer, double precision);

create or replace function public.match_field_visits(
  query_embedding vector,
  match_agency_id uuid default null::uuid,
  match_count integer default 30,
  match_threshold double precision default 0.3,
  match_risk_level text default null::text
)
returns table (
  id uuid,
  client_company_id uuid,
  client_name text,
  notes text,
  scheduled_at timestamp with time zone,
  status text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path to 'public', 'extensions'
as $function$
  select
    fv.id,
    fv.client_company_id,
    cc.name as client_name,
    fv.notes,
    fv.scheduled_at,
    fv.status,
    fv.metadata,
    1 - (fv.embedding <=> query_embedding) as similarity
  from public.field_visits fv
  left join public.client_companies cc on cc.id = fv.client_company_id
  where fv.embedding is not null
    and (match_agency_id is null or fv.agency_id = match_agency_id)
    and (match_risk_level is not null or (1 - (fv.embedding <=> query_embedding)) >= match_threshold)
    and (match_risk_level is null or fv.metadata ->> 'risk_level' = match_risk_level)
  order by fv.embedding <=> query_embedding
  limit match_count;
$function$;

comment on function public.match_field_visits(vector, uuid, integer, double precision, text) is
  'Semantička pretraga terenskih poseta po embedding-u. SECURITY INVOKER — važi RLS pozivaoca. Agencija i prag su argumenti; opseg po assigned_collaborator_id seče aplikacija (lib/search/field-visits.ts).';

revoke all on function public.match_field_visits(vector, uuid, integer, double precision, text) from public;
revoke all on function public.match_field_visits(vector, uuid, integer, double precision, text) from anon;
grant execute on function public.match_field_visits(vector, uuid, integer, double precision, text) to authenticated, service_role;
