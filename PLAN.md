# SafeNest BZR — plan razvoja



SaaS za agencije BZR (bezbednost i zdravlje na radu): klijenti, zaposleni, rokovi, dokumenta, obaveštenja, terenske posete, naplata po agenciji, admin. Tehnologije: Next.js 16 (App Router), TypeScript, Tailwind, Supabase (Postgres, Auth, Storage), Stripe, kasnije Vercel.



**Redosled iz originalnog prompta (ne preskakanje dizajna pre backend-a):**



| # | Faza | Sadržaj |

|---|------|---------|

| 1 | Plan i arhitektura | Arhitektura, šema, API lista, RLS princip, redosled |

| 2 | Setup projekta | Next.js, TS, Tailwind, struktura, Supabase klijenti, env |

| 3 | Baza podataka | Migracije: tabele, indeksi, RLS, Storage bucketi, triggeri |

| 4 | Autentifikacija | Registracija, login, logout, zaštita ruta, uloge, `locale` |

| 5 | Glavne funkcije — backend | API rute, feature gating po planu |

| 6 | Error handling | Validacija, rate limit, edge case-ovi, idempotentnost gdje treba |

| 7 | Plaćanje (Stripe) | Checkout, webhook, portal, sinhronizacija pretplate |

| 8 | Admin panel — funkcionalnost | Super admin, agencije, korisnici, audit |

| 9 | Frontend dizajn | Landing, stranice, i18n (sr/en), žuto–crna tema |

| 10 | Testiranje | E2E / manuelni tokovi, DEV/PROD |

| 11 | Deploy | Vercel, preview, produkcija |



---



## Status po fazama (stanje: jul 2026, ažurirano 2026-07-30 — klijenti detalj, radnici, rokovi/JMBG/uvoz)



### Faza 1 — Plan i arhitektura

- **Gotovo.** Monolit Next, BFF rute, multi-tenant po `agency_id`. Role-based routing: `/admin` (super_admin), `/agencija` (agency_owner / agency_collaborator / field_worker), `/nemate-pristup`.



### Faza 2 — Setup projekta

- **Gotovo.** Next 16.2, Tailwind, ESLint, `lib/supabase/*`, `middleware.ts`, `/api/health`, `.env.example` (ukl. offline env varijable).



### Faza 3 — Baza podataka

- **Gotovo (jezgro).** Migracija `20250329120000_phase3_core_schema.sql`: agencies, client_companies, profiles, employees, documents, deadlines, notifications, admin_audit_log, stripe_events, RLS, bucket `documents`.

- **Dodatak:** `20250329130000_agency_plan_tier_defaults.sql` — default `agency_basic`.

- **Dodatak (Faza 5):** `20250626120000_phase5_rls_storage_notifications.sql` — agencies UPDATE, peer profiles, notifications INSERT, storage RLS za `documents`.

- **Phase 1 teren (jun 2026):** `20260627_phase1_core_schema.sql` — field_visits, field_photos (starija pretpostavljena šema u migraciji; **stvarna šema u Supabase je drugačija**, vidi ispod), voice_recordings, risk_assessments, itd.

- **Storage field photos:** `20260629_field_photos_storage.sql` — bucket `field-photos` (privatni), RLS po `agency_id` u putanji `{agency_id}/{field_visit_id}/{uuid}-{filename}`.

- **Field visits v2:** `20260630_field_visits_v2_schema.sql` — `scheduled_at`, `sync_status`, `assigned_user_id`, `offline_client_id`; status enum: `draft | in_progress | completed | cancelled`.

- **Client operation addresses:** `20260630_client_operation_addresses.sql`.

- **Field photos real schema (jul 2026):** `20260708_field_photos_real_schema.sql` — **`ocr_text` kolona** + RLS preko `field_visits.agency_id` → **`has_agency_access(agency_id)`** (ne `user_belongs_to_agency`, ne direktna `agency_id` kolona u `field_photos`). **Mora se primeniti u Supabase SQL Editoru.**



#### Stvarna šema `field_photos` u Supabase (potvrđeno jul 2026)



| Kolona | Tip | Napomena |

|--------|-----|----------|

| `id` | uuid | PK |

| `field_visit_id` | uuid | FK → field_visits |

| `photo_url` | text | Signed URL iz Storage-a (7 dana TTL pri upload-u) |

| `extracted_dates` | jsonb | Strukturirani datumi iz OCR-a `{ dates: [...] }` |

| `ocr_confidence` | numeric | Tesseract pouzdanost 0–100 |

| `ocr_text` | text | **Dodata migracijom 20260708** — slobodan OCR tekst |

| `created_at`, `updated_at` | timestamptz | |



**NE postoje u stvarnoj bazi:** `agency_id`, `storage_path`, `filename`, `mime_type`, `size_bytes`, `metadata`, `uploaded_by`.



#### Stvarna šema `field_visits` (v2 + Phase A/B/C, aplikacija)



Ključne kolone: `scheduled_at`, `status`, `sync_status`, `offline_client_id`, `notes`, `metadata` (JSONB: `duration_hours`, `risk_level`, `extracted_text`). `duration_hours` i `risk_level` **samo u metadata**, ne kao top-level kolone.



**Phase A — glas / transkript** (`20260715153000_field_visit_audio_transcription.sql`):

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `audio_url` | text | Storage path u bucketu `field-audio` |
| `transcript` | text | Transkript glasovne beleške |
| `transcript_status` | text | `pending \| processing \| done \| failed` |
| `noise_mode` | text | `quiet \| noisy` |

**Phase B — šablon + zapisnik** (`20260716140000_report_templates.sql`):

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `report_template_id` | uuid | FK → `report_templates` |
| `report` | text | Tekstualni prikaz zapisnika (sinhronizovan iz polja) |
| `report_status` | text | `pending \| processing \| done \| failed \| skipped` |

**Phase C — strukturirana polja** (`20260719140000_report_fields_jsonb.sql`):

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `report_fields` | jsonb | `{ "Naziv polja": "vrednost", ... }` — izvor istine za UI |

**Zaključavanje zapisnika** (`20260719150000_report_lock_status.sql`):

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `report_lock_status` | text | `in_progress` (default) \| `closed` |
| `report_closed_at` / `report_closed_by` | timestamptz / uuid | Ko/kad je zatvorio (**= signed_at / signed_by**) |
| `reopen_requested_at` / `reopen_requested_by` | timestamptz / uuid | Zahtev za otvaranje |
| `reopen_justification` | text | Obavezno obrazloženje |
| `reopen_approved_by` / `reopen_approved_at` | uuid / timestamptz | Odobrenje (owner/super_admin) |

Trigger `enforce_field_visit_report_lock`: dok je `closed`, zabrana `UPDATE` na `report` / `report_fields` (osim tranzicije na `in_progress`). **Transkript ostaje editable.**

**Digitalni potpis** (`20260720160000_report_signature.sql`) — bez dupliranja signed_by/at:

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `signature_statement` | text | npr. „Zapisnik potpisan od strane … dana … u …” (sr/en) |
| `report_content_hash` | text | SHA-256 kanonskog sadržaja (`report_fields` ili `report`) u trenutku potpisa |

Pri ponovnom zatvaranju potpis/hash se **prepisuju** (nema istorijske tabele — opcija za kasnije).

**Broj naloga + hitno** (`20260720120000_field_visit_broj_naloga_hitno.sql`):

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `broj_naloga` | text | Format `N/YY` (kalendarska godina Europe/Belgrade); dodeljuje DB trigger |
| `hitno_otklanjanje` | boolean | Checkbox na formi |

**Kontrolne posete + delegacije** (`20260720140000_control_visits_and_delegations.sql`):

| Kolona / tabela | Napomena |
|-----------------|----------|
| `field_visits.parent_visit_id` | FK na originalnu posetu; kontrolni broj `N-k/YY` |
| `visit_delegations` | Owner dodeljuje: od radnika A → radnik B (aktivna/opozvana) |



#### Tabela `report_templates`

Agency-scoped šabloni zapisnika (`name`, `template_content`, `is_default`). RLS: SELECT preko `profile_matching_agency` / `can_manage_agency`; INSERT/UPDATE/DELETE preko `can_manage_agency` (vlasnik).



#### Tabela `agency_invites` (pozivnice radnika)

Migracija `20260719170000_agency_invites.sql` — **mora se primeniti u Supabase SQL Editoru.**

| Kolona | Tip | Napomena |
|--------|-----|----------|
| `id` | uuid | PK |
| `agency_id` | uuid | FK → agencies |
| `email` | text | Opcioni hint (forma može unapred popuniti) |
| `invite_code` | text | Unique kod u URL-u `?code=` |
| `role` | text | Default `agency_collaborator` |
| `created_by` | uuid | Owner koji je kreirao |
| `expires_at` | timestamptz | Istek |
| `used_at` / `used_by` | timestamptz / uuid | Null dok nije iskorišćena |

RLS: SELECT/INSERT/UPDATE/DELETE preko `can_manage_agency` (ili super_admin). Accept/validate idu preko API-ja (service / authenticated accept).

**RPC lookup** (`20260720150000_invite_lookup_rpc.sql`): `get_agency_invite_by_code(code)` — SECURITY DEFINER, za validate bez RLS rupa.

**API putanje (Windows/Turbopack):** nested rute pod `/api/agency/invites/*` na Windows-u nisu pouzdano registrovane → validate/accept su na **`/api/agency/invite/validate`** i **`/api/agency/invite/accept`**; DELETE preko `DELETE /api/agency/invites?id=`.



- **Dev reset:** `supabase/scripts/reset-phase3-dev-only.sql` — ne brisati bucket iz SQL-a.



### Faza 4 — Autentifikacija

- **Gotovo (za postojeći scope).** `/login`, `/register` (vlasnik), `/register/worker?code=` (radnik preko pozivnice), `/dashboard`, middleware, bootstrap agencije, uloge.

- **Role helpers:** `lib/auth/roles.ts`, `lib/agency/gate.ts`, `lib/admin/gate.ts`.

- **Pozivnice (jul 2026):** pun UI + API tok — vidi sekciju „Pozivnice agency_collaborator” ispod. Middleware **ne** preusmerava ulogovane sa `/register/worker` na dashboard.

- **Nije:** OAuth.



### Faza 5 — Glavne funkcije (backend)



| Resurs | Rute | Status |

|--------|------|--------|

| Sesija | `GET/PATCH /api/me` (+ `locale`) | Gotovo |

| Agencija | `GET/PATCH /api/agency`, `GET /api/agency/members` | Gotovo |

| **Pozivnice** | `GET/POST /api/agency/invites`, `DELETE /api/agency/invites?id=`, `GET /api/agency/invite/validate`, `POST /api/agency/invite/accept` | Gotovo |

| **Delegacije** | `GET/POST /api/agency/delegations`, `PATCH .../delegations/[id]` | Gotovo (owner) |

| Klijenti | `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/[id]` | Gotovo |

| Zaposleni | `GET/POST .../employees`, `GET/PATCH/DELETE /api/employees/[id]` | Gotovo |

| Dokumenti | upload-url + lifecycle | Gotovo |

| **Terenske posete** | `GET/POST /api/field-visits`, `GET/PATCH/DELETE /api/field-visits/[id]`, `GET .../parent-candidates` | Gotovo |

| **Offline sync** | `POST /api/sync` (JSON red: field_visits, risk_assessments, …) | Gotovo |

| **Field photos** | `GET/POST /api/field-photos` (multipart upload) | Gotovo — usklađeno sa stvarnom šemom |

| **Voice / audio** | `POST /api/field-audio`, `POST .../transcribe` | Gotovo (Phase A) + BZR `prompt` |

| **Zapisnik AI** | `POST .../generate-report`, `POST .../fill-report-fields` | Gotovo (Phase B/C) |

| **Zaključavanje + potpis** | `POST .../close-report` (hash + statement), `.../request-reopen`, `.../approve-reopen` | Gotovo |

| **Šabloni zapisnika** | `GET/POST /api/report-templates`, `PATCH/DELETE /api/report-templates/[id]` | Gotovo (agency_owner) |

| **Voice recordings** | `POST /api/voice-recordings` | Gotovo (backend, legacy) |

| Rokovi | `GET /api/deadlines` | Delimično — nema POST/PATCH/DELETE |

| Obaveštenja | GET + mark read | Delimično — nema POST |

| Stripe / Admin | vidi Faze 7–8 | Gotovo |



- **Feature gating:** `lib/plans/feature-gate.ts` + `requireSubscriptionForMutation`. Env **`REQUIRE_ACTIVE_SUBSCRIPTION=false`** (dev) / `"true"` (prod SaaS) — vidi `.env.example`.

- **Terenski guard:** `getFieldMutationContext()` u `lib/api/mutation-guards.ts` — uključuje `field_worker`.

- **Storage putanje:** `lib/api/documents-storage.ts`, `lib/api/photo-storage.ts`, `lib/api/voice-storage.ts`.



### Faza 6 — Error handling

- **Delimično gotovo.** Zod, `withApiCatch`, rate limit, Stripe idempotencija, mutacioni guardi.

- **Offline sync:** retry sa exponential backoff (`MAX_SYNC_RETRIES`), `SyncFailedNotice` za mrtve stavke u redu, privremeni `[syncNow]` debug logovi u `syncManager.ts`.



### Faza 7 — Stripe

- **Gotovo** za trenutni model (3 plana, webhook, portal, cene iz Stripe API-ja).



### Faza 8 — Admin panel

- **Delimično gotovo.** `/admin` — agencije, korisnici, audit (super_admin only). Terenske posete i klijenti **prebačeni na `/agencija`**.



### Faza 9 — Frontend dizajn

- **U toku (luxury UI, jul 2026).** Vizuelni rebrand na **Bez Zrna Rizika** — dark/light tema (`data-theme` + `localStorage` `bzr-theme`, default dark), fontovi **Manrope** (UI) + **Cormorant Garamond** (display), tokeni zlato `#D4AF35` / bg `#0A0A0B`. Bez izmene business logike / API / RLS (osim pečene migracije peers ispod).

- **Landing (`app/page.tsx`):** header (logo mark ~92px + Bez**Zrna**Rizika + tagline), circular theme/menu, kicker sa 3 tačke + glow, 2-linijski headline sa metalnim gold italicom, CTA, stats strip; dekor `BrandDecor` `dots-ring` (rotiran, poluprovidan).

- **Brand asseti:** `public/brand/` — `logo-web.png`, `logo-mark.png`, `logo-mobile.png`, `deco-*.png` (halftone, dots-ring/spiral, steps, megaphone).

- **i18n (sr/en):** `lib/i18n/`, `LocaleSwitcher`, cookie + `PATCH /api/me` za ulogovane. Terenske posete prevedene; admin/dashboard/login/register delimično hardkodovani na SR.

- **UI komponente:** `BackButton`, `OfflineIndicator`, `SyncProgress`, `FieldVisitPhotosGallery`, badge-ovi; brend: `BrandDecor`, `BrandLogo`, `PageCornerDecor`, `SoftOrbs`, `ThemeToggle` / `ThemeProvider`. `next.config.mjs`: `devIndicators: false`.



### Faza 10 — Testiranje

- **Manuelno.** `npm run build` prolazi (jul 2026). Nema E2E suite.



### Faza 11 — Deploy

- **Nije.**



---



## Phase 2: Offline-First Architecture (jul 2026)



### MVP — urađeno



| Komponenta | Fajl / putanja | Status |

|------------|----------------|--------|

| IndexedDB (localforage) | `lib/offline/indexedDB.ts` | Gotovo |

| Sync red + retry | `lib/offline/syncQueue.ts` | Gotovo |

| Sync koordinator | `lib/offline/syncManager.ts` | Gotovo |

| Lokalne fotografije (Blob) | `lib/offline/photos.ts` | Gotovo |

| OCR (tesseract.js) | `lib/offline/ocr.ts` | Gotovo (+ confidence) |

| Referentni podaci replikacija | `lib/offline/replication.ts` | Gotovo |

| Service Worker | `public/sw.js` | Gotovo |

| React hook | `hooks/useOfflineSync.ts` | Gotovo |

| Offline UI | `components/offline/*` | Gotovo |

| Bulk JSON sync API | `app/api/sync/route.ts` | Gotovo |

| Photo multipart upload | `app/api/field-photos/route.ts` | Gotovo |



### Offline photo upload flow



```

FieldVisitForm → IndexedDB (visit + photo blobs + OCR)

              → POST /api/sync (poseta dobija server UUID)

              → POST /api/field-photos (multipart: photo, field_visit_id, ocr_text, ocr_confidence)

              → Storage bucket field-photos + red u field_photos (photo_url, extracted_dates, …)

              → Prikaz u listi/modalu preko photo_url

```



- Fotografije se **ne šalju** kroz `/api/sync` JSON (uklonjeno iz `TABLE_CONFIG`).

- Upload fotografije **tek kad** parent poseta ima `serverId` (`syncPhotos()` u `syncManager.ts`).

- Race fix: `await syncData()` u formi + automatski ponovni sync krug ako su slike dodate tokom sync-a posete.



### Env varijable (offline)



```env

NEXT_PUBLIC_ENABLE_OFFLINE=true

# "sr" → tesseract srp_latn+srp (latinica + ćirilica); ne samo srp
NEXT_PUBLIC_OCR_LANGUAGE=sr

NEXT_PUBLIC_SYNC_INTERVAL=5000

REQUIRE_ACTIVE_SUBSCRIPTION=false

```



---



## Routing po ulogama



| Putanja | Uloge | Sadržaj |

|---------|-------|---------|

| `/admin` | `super_admin` | Agencije, korisnici, audit |

| `/agencija` | `agency_owner`, `agency_collaborator`, `field_worker` | Početna agencije |

| `/agencija/klijenti` | ↑ | Lista klijenata (klik na red → detalj) |

| `/agencija/klijenti/[id]` | ↑ | Detalj klijenta — tabovi Osnovni podaci / Radnici / Rokovi (`?tab=`, `?worker_id=`) |

| `/agencija/klijenti/[id]/compliance` | ↑ | Redirect → `?tab=rokovi` |

| `/agencija/field-visits` | ↑ | Lista + detalji (tabovi Moje/Sve, filteri) |

| `/agencija/field-visits/new` | ↑ | Nova poseta (offline-first forma) |

| `/agencija/report-templates` | `agency_owner` | CRUD šablona zapisnika |

| `/agencija/pozivnice` | `agency_owner` | Pozivnice radnika |

| `/agencija/delegacije` | `agency_owner` | Delegacije terenskih poseta |

| `/agencija/pretraga` | ↑ | Pametna pretraga poseta |

| `/dashboard/field-visits` | — | Redirect → agencijske terenske posete |

| `/nemate-pristup` | — | Forbidden stranica |



---



## Sažetak: urađeno / u toku / sledeće



| Oblast | Status |

|--------|--------|

| Jezgro baza + RLS + auth | Urađeno |

| RLS Faza 5 (storage documents, agencies UPDATE) | U kodu — primeniti u Supabase |

| API: klijenti, zaposleni, dokumenti | Urađeno + feature gating |

| **Terenske posete + offline sync** | **Urađeno** |

| **Field photos upload (Storage + DB)** | **Urađeno** — migracija 20260708 obavezna |

| **Phase A: glasovna beleška + transkripcija** | **Urađeno** |

| **Phase B: šabloni + AI zapisnik** | **Urađeno** |

| **Phase C: strukturirana polja + glasovno popunjavanje** | **Urađeno** |

| **Zaključavanje zapisnika (U radu / Zatvoren)** | **Urađeno** |

| **Digitalni potpis pri zatvaranju** | **Urađeno** (prepisuje poslednji; bez istorije) |

| **Broj naloga + hitno otklanjanje** | **Urađeno** |

| **Kontrolne posete + delegacije** | **Urađeno** |

| **OCR jezik (srp_latn+srp)** | **Urađeno** |

| **ASR prompt (BZR termini) + UI hint quiet/noisy** | **Urađeno** |

| **Luxury UI / brend BZR (landing + tema + dekor)** | **Urađeno** (jul 2026-07-23) — vizuelno; logika netaknuta |

| **profiles SELECT peers (`has_agency_access`)** | **U kodu** — migracija `20260723120000_*` primeniti u Supabase |

| Feature gating (`REQUIRE_ACTIVE_SUBSCRIPTION`) | Urađeno (flag za dev/prod) |

| i18n sr/en (terenske posete, šabloni, zapisnik) | **Delimično** — login/register/dashboard još SR |

| API: rokovi CRUD, obaveštenja POST | Sledeće |

| Sanity check / validacija `duration_hours` (npr. 6526h anomalija) | Kasnije |

| E2E, CI, PROD deploy | Kasnije |

| Ukloniti `[syncNow]` debug logove | Opciono (dev) |



---



## Reference u repou



### Migracije (`supabase/migrations/`)

- `20250329120000_phase3_core_schema.sql` — jezgro

- `20250626120000_phase5_rls_storage_notifications.sql` — RLS dopuna

- `20260627_phase1_core_schema.sql` — teren tabele (legacy u repou)

- `20260629_field_photos_storage.sql` — bucket `field-photos`

- `20260630_field_visits_v2_schema.sql` — field_visits v2

- `20260630_client_operation_addresses.sql`

- **`20260708_field_photos_real_schema.sql`** — `ocr_text` + RLS sa `has_agency_access`

- **`20260715_fix_has_agency_access.sql`** — fix `text = member_role` u `has_agency_access`

- **`20260715153000_field_visit_audio_transcription.sql`** — Phase A: audio/transcript + bucket `field-audio`

- **`20260716140000_report_templates.sql`** — Phase B: `report_templates` + report kolone

- **`20260719120000_fix_can_manage_agency.sql`** — fix `can_manage_agency` (`role::text`)

- **`20260719123000_fix_report_templates_select.sql`** — SELECT RLS šablona

- **`20260719140000_report_fields_jsonb.sql`** — Phase C: `report_fields jsonb`

- **`20260719150000_report_lock_status.sql`** — zaključavanje zapisnika + reopen + trigger

- **`20260719170000_agency_invites.sql`** — tabela `agency_invites` + RLS

- **`20260720120000_field_visit_broj_naloga_hitno.sql`** — `broj_naloga`, `hitno_otklanjanje` + sequence trigger

- **`20260720140000_control_visits_and_delegations.sql`** — `parent_visit_id`, kontrolni broj, `visit_delegations`

- **`20260720150000_invite_lookup_rpc.sql`** — `get_agency_invite_by_code`

- **`20260720160000_report_signature.sql`** — `signature_statement`, `report_content_hash`

- **`20260722120000_field_visit_collaborators_signatures.sql`** — saradnici + multi-potpis

- **`20260723120000_profiles_select_agency_peers.sql`** — SELECT peers iste agencije (`has_agency_access`)



### Backend

- Planovi / gating: `lib/plans/catalog.ts`, `lib/plans/feature-gate.ts`

- Guardi: `lib/api/mutation-guards.ts`, `lib/api/session.ts`, `lib/auth/roles.ts`

- Terenske posete: `lib/field-visits/`, `app/api/field-visits/`, `app/api/sync/`

- Fotografije: `app/api/field-photos/`, `lib/api/photo-storage.ts`

- Audio / transkript: `app/api/field-audio/`, `lib/api/transcription.ts`, `lib/api/audio-storage.ts`

- Zapisnik: `lib/api/report-generation.ts`, `lib/api/report-fields.ts`, `lib/api/report-lock.ts`, `lib/api/report-signature.ts`

- Šabloni: `app/api/report-templates/`

- Pozivnice: `app/api/agency/invites/` (lista/kreiranje/DELETE?id), `app/api/agency/invite/validate`, `.../invite/accept`

- Delegacije: `app/api/agency/delegations/`

- Offline: `lib/offline/`

- Middleware: `lib/supabase/middleware.ts` — ulogovan: `/login` i `/register` → `/dashboard`; **`/register/worker` izuzet**



### Frontend

- Agencija: `app/agencija/`, `components/agencija/` (`ReportTemplatesManager`, `AgencyInvitesManager`, `VisitDelegationsManager`)

- Pozivnice UI: `/agencija/pozivnice`, registracija radnika: `app/register/worker/page.tsx`

- Delegacije UI: `/agencija/delegacije`

- Terenske posete: `components/field-visits/` (Form, List, Modal, PhotosGallery, `ReportFieldsEditor`, `ReportLockBadge`)

- i18n: `lib/i18n/`, `components/i18n/LocaleSwitcher.tsx`

- Offline UI: `components/offline/`, `hooks/useOfflineSync.ts`, `hooks/useMounted.ts`

- UI: `components/ui/BackButton.tsx`

- **Brend / tema:** `components/brand/` (`BrandDecor`, `BrandLogo`, `PageCornerDecor`, `SoftOrbs`), `components/theme/` (`ThemeProvider`, `ThemeToggle`), tokeni + landing CSS u `app/globals.css`, asseti u `public/brand/`



### Env

- `.env.example` — offline, OCR, sync interval, `REQUIRE_ACTIVE_SUBSCRIPTION`



---



## Operativno — šta uraditi ručno (dev)



1. **Supabase migracije (redosled — novije za zapisnik / audio):**

   - `20260708_field_photos_real_schema.sql`

   - `20260715_fix_has_agency_access.sql`

   - `20260715153000_field_visit_audio_transcription.sql`

   - `20260716140000_report_templates.sql`

   - `20260719120000_fix_can_manage_agency.sql`

   - `20260719123000_fix_report_templates_select.sql`

   - `20260719140000_report_fields_jsonb.sql`

   - **`20260719150000_report_lock_status.sql`** — zaključavanje + trigger

   - **`20260719170000_agency_invites.sql`** — pozivnice radnika

   - **`20260720120000_field_visit_broj_naloga_hitno.sql`** — broj naloga + hitno

   - **`20260720140000_control_visits_and_delegations.sql`** — kontrolne posete + delegacije

   - **`20260720150000_invite_lookup_rpc.sql`** — RPC lookup pozivnice

   - **`20260720160000_report_signature.sql`** — digitalni potpis (statement + hash)

   - **`20260722120000_field_visit_collaborators_signatures.sql`** — saradnici + multi-potpis

   - **`20260723120000_profiles_select_agency_peers.sql`** — dropdown kolega / delegacije (SELECT peers)



2. **Provera `field_photos` RLS:** pristup preko `field_visit_id → field_visits.agency_id → has_agency_access(agency_id)`.



3. **Provera `report_templates` SELECT:** posle fix migracije lista šablona i dropdown na novoj poseti moraju prikazati postojeće šablone.



4. **Dev server:** `npm run dev` ili `npm run dev:fresh` (briše `.next`). Ako port 3000 zauzet — samo jedna Next instanca.



5. **Pretplata u dev-u:** `REQUIRE_ACTIVE_SUBSCRIPTION=false` u `.env.local` ili aktivna pretplata u `agencies`.



6. **Upload fotografije — test:** `/agencija/field-visits/new` → slika → sync → prikaz u detaljima.



7. **Zapisnik — test:** šablon → poseta sa audio → transkript → strukturirana polja → zatvori **i potpiši** (dijalog) → proveri `signature_statement` / `report_content_hash` → zahtev za otvaranje → owner odobri → izmena → ponovo zatvori (novi hash).



8. **Pozivnica — test:** owner `/agencija/pozivnice` → generiši → link `/register/worker?code=XXXX` → inkognito → forma → nalog `agency_collaborator` + `agency_id` → isti link ulogovan → poruka o odjavi (ne dashboard).



9. **Delegacije — test:** owner `/agencija/delegacije` → A → B; imena radnika (ne UUID); lista Moje/Sve poštuje delegaciju.



10. **Stripe:** Price ID usklađeni sa test/live ključem.



---



## Održavanje ovog fajla



**Dogovor:** korisnik na kraju rada napiše da se `PLAN.md` ažurira; agent upiše kratki žurnal (datum, urađeno, sledeći koraci 1–3).



### Žurnal (2026-03-29)

- Jezgro baza, auth, Stripe, admin.



### Žurnal (2026-03-31)

- Agencijski API: `GET/PATCH /api/agency`, članovi.



### Žurnal (2026-06-26)

- Feature gating, dokumenti upload-url + lifecycle, migracija phase5 RLS.



### Žurnal (2026-06-30)

- **Field visits v2:** `scheduled_at`, `sync_status`, `assigned_user_id`, status `draft` (ne `scheduled`).

- **Role-based routing:** `/admin` (super_admin), `/agencija/*` (agency staff), `/nemate-pristup`.

- **Offline-first Phase 2:** IndexedDB, sync queue, `syncManager`, `/api/sync`, service worker, OCR (tesseract).

- **UI:** `BackButton`, `OfflineIndicator`, `SyncProgress`, hydration fix (`useMounted`).

- **Sync fixes:** pending counter vs dead queue; `SyncFailedNotice`; failed queue discard.

- **Subscription flag:** `REQUIRE_ACTIVE_SUBSCRIPTION` env var.

- **i18n:** `LocaleSwitcher` SR|EN, terenske posete forma prevedena na EN.



### Žurnal (2026-07-08 — 2026-07-10)

- **Field photos — kompletan upload flow:**

  - Lokalno: `addFieldPhoto()` (Blob + OCR u IndexedDB).

  - Sync: poseta prvo (`/api/sync`), zatim slike (`POST /api/field-photos` multipart).

  - Storage: bucket `field-photos`, putanja `{agency_id}/{field_visit_id}/{uuid}-{filename}`.

  - Prikaz: `FieldVisitPhotosGallery`, kolona broja fotografija u listi, signed URL u `photo_url`.

- **Usklađivanje sa stvarnom DB šemom `field_photos`:**

  - Uklonjen upis nepostojećih kolona (`agency_id`, `storage_path`, `filename`, …).

  - Upis: `photo_url`, `extracted_dates`, `ocr_confidence`, `ocr_text`.

  - `buildExtractedDatesFromOcr()` — datumi iz OCR teksta u JSONB.

  - OCR confidence iz tesseract-a u offline flow-u.

- **Migracija `20260708_field_photos_real_schema.sql`:**

  - `ADD COLUMN IF NOT EXISTS ocr_text text`.

  - RLS preko JOIN sa `field_visits` + **`has_agency_access(fv.agency_id)`** (ispravka od `user_belongs_to_agency`).

- **Build fix:** uklonjen zastareli import `signFieldPhotoUrls`; GET vraća `photo_url` direktno.

- **`/api/sync`:** `field_photos` uklonjen iz JSON `TABLE_CONFIG` (slike idu samo multipart putem).



### Žurnal (2026-07-15 — 2026-07-19)



#### Phase A — Glasovna beleška + transkripcija

- Snimanje u `FieldVisitForm` (MediaRecorder, quiet/noisy), offline IndexedDB (`voice_recordings`).

- Upload u privatni bucket `field-audio`; auto-transcribe posle sync-a.

- API: `POST /api/field-audio`, `POST /api/field-visits/[id]/transcribe`, GET/PATCH posete.

- Modeli: quiet → `gpt-4o-mini-transcribe`; noisy → `gpt-4o-transcribe` / `whisper-1` fallback.

- Modal: audio player (signed URL), edit transkripta, retry.



#### Phase B — Šabloni zapisnika + AI generisanje

- Tabela `report_templates`; kolone `report_template_id`, `report`, `report_status` na `field_visits`.

- Admin UI `/agencija/report-templates` (`ReportTemplatesManager`) — CRUD + default.

- Dropdown šablona na novoj poseti; posle uspešne transkripcije `generateAndSaveVisitReport` (`gpt-4o-mini`).

- **RLS fixovi:**

  - `can_manage_agency` — `role::text` cast (`20260719120000_fix_can_manage_agency.sql`) — INSERT šablona radi.

  - SELECT politika šablona — `profile_matching_agency` / `can_manage_agency` (`20260719123000_fix_report_templates_select.sql`) — lista i dropdown vide šablone.



#### Phase C — Strukturirana polja + glasovno popunjavanje

- Kolona `report_fields jsonb` pored `report` (text ostaje kao sinhronizovan prikaz / legacy).

- Parsiranje šablona (`Naziv polja:`); AI JSON mode vraća objekat polja.

- UI: `ReportFieldsEditor` — zasebna editable polja, placeholder „Nije navedeno”.

- `POST .../fill-report-fields` — ephemeral audio → transkript → AI merge (menja samo pomenuta polja).

- PATCH prima `report_fields`; generisanje/fill blokirani kad je zapisnik zatvoren.



#### Zaključavanje zapisnika (U radu / Zatvoren)

- Migracija `20260719150000_report_lock_status.sql` + DB trigger zaštite sadržaja.

- API: `close-report`, `request-reopen` (obavezno obrazloženje), `approve-reopen` (owner / super_admin).

- Modal: zatvori → read-only polja → zahtev → odobrenje; lista: kolona „Status zapisnika” + `ReportLockBadge`.

- Transkript **nije** zaključan — samo `report` / `report_fields`.



#### Digitalni potpis (2026-07-20)

- Migracija `20260720160000_report_signature.sql`: `signature_statement`, `report_content_hash`.
- `signed_by` / `signed_at` = postojeći `report_closed_by` / `report_closed_at` (bez novih kolona).
- UI: potvrdni dijalog „Da li zatvarate i potpisujete…” pre `POST .../close-report`.
- Backend (`lib/api/report-signature.ts`): SHA-256 nad `report_fields` (inače `report`) + statement na jeziku korisnika.
- Prikaz potpisa u modalu (izdvojen, read-only). Ponovno zatvaranje **prepisuje** poslednji potpis.



#### Broj naloga, filteri, kontrolne posete, delegacije (2026-07-20)

- Broj naloga `N/YY` (auto) + `hitno_otklanjanje`; kontrolne: `parent_visit_id`, broj `N-k/YY`.
- Lista: tabovi „Moje posete” / „Sve posete”; filteri (klijent, delatnost, rizik, datum, radnik, broj naloga, hitno, status zapisnika).
- Delegacije: `/agencija/delegacije`; collaboratori preko admin/service role (RLS inače krije imena).
- Modal detalja — redosled polja: Broj naloga → Klijent → Delatnost → … → Napomene poslednje → Zapisnik/Foto.
- Forma „Nova poseta”: ispod forme samo **poslednje sačuvano** (indikacija sync-a), ne lista svih lokalnih.



#### OCR + ASR tačnost (2026-07-20)

- OCR: `getOcrLanguage()` — `sr` → **`srp_latn+srp`** (ranije samo `srp`/ćirilica → haos na latinici). Vidi `lib/offline/config.ts`.
- Transkripcija: `language` i dalje `sr`/`en` za quiet (`gpt-4o-mini-transcribe`) i noisy (`gpt-4o-transcribe` / whisper-1); dodat OpenAI **`prompt`** sa BZR terminima.
- UI napomena: birati quiet/noisy prema **stvarnom** okruženju.



#### UI fix — tabela Terenske posete

- Nakon dodavanja kolone statusa, `table-fixed` + % širine (~110%) izazvali preklapanje „Fotografije”/„Akcije” i neklikabilna dugmad.

- Ispravka: `overflow-x-auto`, uklonjen `table-fixed`, `w-max min-w-full`, `whitespace-nowrap`, dugmad `relative z-10`.



#### Pozivnice agency_collaborator (2026-07-19)

- Migracija `agency_invites`; owner UI `/agencija/pozivnice` („Pozovi radnika”); generisani link: `{origin}/register/worker?code={invite_code}`.

- Ruta **postoji**: `app/register/worker/page.tsx` — nije `/registracija/radnik`. Forma email/lozinka/ime; bez biranja role; posle signUp → `POST /api/agency/invites/accept` → `role = agency_collaborator`, `agency_id` iz pozivnice, `used_at` setovan.

- `AgencyBootstrap`: ako `user_metadata.invite_code` postoji, **ne** kreira novu agenciju — accept tok vezuje profil.

- **Bug (test sa Damjanom ulogovanim):** link je vodio na owner dashboard. **Uzrok:** middleware je sve `pathname.startsWith("/register/")` za ulogovane slao na `/dashboard` *pre* provere invite koda. **Ispravka:** izuzet `/register/worker`; ulogovan posetilac vidi poruku „Već ste ulogovani kao {email}… odjavite se” + dugme Odjavi se. Inkognito / bez sesije → forma kad je `?code=` validan.



#### Poznato za kasnije

- Anomalija trajanja **6526h**: lista čita samo `metadata.duration_hours` (ručni unos bez max limita) — nije bug u `started_at`/`completed_at`. Predlog: validacija u formi + sanity filter u prikazu.



**Sledeći koraci (predlog):**

1. Potvrditi migracije do uključujući `20260720160000_report_signature.sql` (i sve od `20260715*`).

2. Manuelni E2E: šablon → audio → zapisnik → **zatvori+potpiši** → reopen → izmena → ponovo zatvori (novi hash).

3. Manuelni E2E pozivnice + delegacije.

4. OCR: latinična fotografija; ASR: ista rečenica u quiet i noisy.

5. Validacija `duration_hours`; i18n za login/register/dashboard; opciono istorija potpisa (`report_signatures`).



---



## Pozivnice agency_collaborator (jul 2026)



### Tok (happy path)



```

Owner: /agencija/pozivnice → POST /api/agency/invites → kopira link

  /register/worker?code=XXXX

  → (nije ulogovan) GET .../validate → forma (ime, email, lozinka)

  → signUp (+ user_metadata.invite_code)

  → POST .../accept → profiles.role=agency_collaborator, agency_id, invite used_at

  → /agencija

Ulogovan (npr. owner) otvori isti link:

  → NE redirect na /dashboard

  → poruka + Odjavi se → zatim forma
```



### Ključni fajlovi



| Oblast | Putanje |
|--------|---------|
| Migracija | `20260719170000_agency_invites.sql`, `20260720150000_invite_lookup_rpc.sql` |
| API | `app/api/agency/invites/` (GET/POST/DELETE?id), `app/api/agency/invite/validate`, `.../invite/accept` |
| Owner UI | `components/agencija/AgencyInvitesManager.tsx`, `app/agencija/pozivnice/` |
| Registracija | `app/register/worker/page.tsx` |
| Middleware | `lib/supabase/middleware.ts` |
| Bootstrap | `AgencyBootstrap` (invite_code → bez nove agencije) |
| i18n | `auth.workerRegister` u `sr.ts` / `en.ts` |



---



## Phase A / B / C — glas, šabloni, strukturirani zapisnik (jul 2026)



### Tok (happy path)



```

Nova poseta (+ report_template_id) + glasovna beleška (+ slike)

  → offline IndexedDB → sync posete → upload audio (field-audio)

  → POST /transcribe → transcript_status=done

  → generateAndSaveVisitReport → report_fields (jsonb) + report (text) + report_status=done

  → Modal: edit polja / glasovni fill / Sačuvaj

  → Zatvori i potpiši (dijalog) → report_lock_status=closed
     + signature_statement + report_content_hash
     → polja read-only; prikaz potpisa u modalu

  → Zatraži ponovno otvaranje (obrazloženje) → owner Odobri → in_progress
  → (opciono) izmena → ponovo zatvori → novi potpis/hash
```



### Ključni fajlovi



| Oblast | Putanje |
|--------|---------|
| Generisanje | `lib/api/report-generation.ts` |
| Polja / parse | `lib/api/report-fields.ts` (`sortReportFieldEntries` za UI redosled) |
| Lock helpers | `lib/api/report-lock.ts` |
| Potpis / hash | `lib/api/report-signature.ts`, `app/api/field-visits/[id]/close-report` |
| Transkripcija | `lib/api/transcription.ts` (`language` + BZR `prompt`) |
| OCR jezik | `lib/offline/config.ts` → `srp_latn+srp` |
| UI polja | `components/field-visits/ReportFieldsEditor.tsx` |
| Modal / lista | `FieldVisitsModal.tsx`, `FieldVisitsList.tsx`, `VisitStatusBadges.tsx` |
| Šabloni UI | `components/agencija/ReportTemplatesManager.tsx` |
| Delegacije | `VisitDelegationsManager.tsx`, `/agencija/delegacije` |



---



## Changelog 2026-07-20 (sažetak sesije)



| Stavka | Detalj |
|--------|--------|
| Broj naloga / hitno | Migracija + forma + filteri + prikaz |
| Kontrolne posete | `parent_visit_id`, broj `N-k/YY`, UI veza |
| Delegacije | Tabela + owner UI; imena preko service role |
| Pozivnice API | `invite/validate` + `invite/accept` + RPC lookup |
| Redosled polja u modalu | Broj naloga → klijent → delatnost → … → napomene |
| Digitalni potpis | Dijalog + statement + SHA-256; prikaz u modalu |
| Forma — lokalne posete | Samo poslednje sačuvano (ne svih 25) |
| OCR | Default latinica+ćirilica (`srp_latn+srp`) |
| ASR | Domain `prompt`; UI hint za quiet vs noisy |



## Changelog 2026-07-22 — saradnici, multi-potpis, štampa

| Stavka | Detalj |
|--------|--------|
| Format potpisa | `Zatvoren i potpisao {ime} dana {datum} u {vreme}` (+ EN); prikaz pored badge-a |
| `field_visit_collaborators` | Dodatni radnici na poseti; „Moje posete” uključuje saradnike |
| `field_visit_signatures` | Više potpisa; `closed` tek kad svi potpišu |
| Delimični potpis | Potpisnik više ne edituje zapisnik dok svi ne potpišu |
| Reopen | Briše potpise + čisti statement/hash |
| Štampa | „Odštampaj zapisnik” + `@media print` |
| Migracija | `20260722120000_field_visit_collaborators_signatures.sql` |



### Žurnal (2026-07-23)

- **Luxury UI / brend BZR** — vizuelni redesign prema luxury-design-hub referenci; bez izmene API/RLS logike (osim peers migracije).
- Tokeni dark/light, Manrope + Cormorant, pill dugmad, kartice, soft orbs, corner dekor na agencija/admin tabovima.
- Landing hero iteracije: kicker dots, 2-linijski headline + metallic gold italic, `dots-ring` dekor (veličina, rotacija ~48°, opacity, pozicija, centriranje stage-a).
- Logo u headeru uvećan (do ~5.75rem / 92px).
- `devIndicators: false`; online indikator sakriven na landing-u.
- Migracija `20260723120000_profiles_select_agency_peers.sql` — član vidi profile kolega iste agencije.

**Sledeći koraci (1–3):**
1. Primena `20260723120000_profiles_select_agency_peers.sql` u Supabase SQL Editoru.
2. Provera light/dark na login/register + `/agencija` tabovima (corner dekor, kontrast).
3. Eventualno usklađivanje preostalih hardkodovanih SR stringova / starih amber stilova.



## Changelog 2026-07-23 — luxury UI / brend BZR

| Stavka | Detalj |
|--------|--------|
| Scope | Samo vizuelno (tema, tipografija, landing, dekor); business logika netaknuta |
| Tipografija | Manrope (`--font-bzr`) + Cormorant Garamond (`--font-display`) u `app/layout.tsx` |
| Tokeni | `app/globals.css`: dark `#0A0A0B` / card `#161618` / gold `#D4AF35`; light warm cream; `data-theme` + `bzr-theme` LS, default dark |
| Tema | `ThemeProvider` + kružni `ThemeToggle`; FOUC init script u layoutu |
| Asseti | `public/brand/logo-{web,mark,mobile}.png`, `deco-{halftone,dots-ring,dots-spiral,steps-a,steps-b,megaphone}.png` |
| Komponente | `BrandDecor`, `BrandLogo`, `PageCornerDecor` (samo soft motivi; steps/megaphone → remap), `SoftOrbs` |
| Landing | Header logo+ime+tagline; kicker 3-dots+glow; headline 2 linije + metallic `<em>`; CTA; stats; footer |
| Ring dekor | `dots-ring` uvećan, rotiran (~48° gap ka tekstu), niža opacity (~0.28–0.32), stage centriran |
| Logo header | `.bzr-landing-logo` ~5.75rem desktop / ~4.75rem mobile (Image 92×92) |
| Shell | Agencija/admin: jedan soft corner motiv po stranici; uklonjeni dupli `→` iz i18n gde nav već ima strelicu |
| Dev UX | `next.config.mjs` `devIndicators: false`; OfflineIndicator ne na landing |
| Migracija | `20260723120000_profiles_select_agency_peers.sql` — SELECT peers via `has_agency_access` |



### Žurnal (2026-07-30)

- **Klijenti — detalj sa tabovima:** lista bez dugmadi Rokovi/Izmeni; klik na red → `/agencija/klijenti/[id]` (Osnovni podaci / Radnici / Rokovi). Stari `/compliance` → redirect `?tab=rokovi`.
- **Radnici:** tabela (ime, mesto, JMBG, datum, status rokova, Rokovi); klik na red → detalj forme; soft JMBG validacija (11–14 cifara); bulk uvoz Excel/CSV (vendored SheetJS + offline precache).
- **Status rokova po radniku:** frontend agregacija `compliance_records` (`expired > missing > expiring > valid`); `?worker_id=` filter na tabu Rokovi.
- **Compliance Izmeni:** radnik + kategorija zaključani; samo datumi + sken dokument.
- **Rokovi bedževi:** upečatljiviji stil; `days <= 0` = istekao (ne „ističe 0d”).
- **UI shell:** sidebar za radnike, indikator ulogovanog korisnika, page canvas dekor (halftone), luxury tema nastavak.

**Sledeći koraci (1–3):**
1. Smoke test: klijent → Radnici tabela → detalj → Rokovi sa `worker_id` → Izmeni zapis (zaključana kategorija).
2. Potvrda da je `20260728120000_compliance_records.sql` primenjena u Supabase.
3. Provera JMBG upozorenja u pojedinačnom unosu i Excel uvozu na light/dark temi.



## Changelog 2026-07-30 — klijenti detalj, radnici, rokovi, JMBG, uvoz

| Stavka | Detalj |
|--------|--------|
| Detalj klijenta | `ClientDetailView` + `/agencija/klijenti/[id]`; tabovi `osnovni` / `radnici` / `rokovi` |
| Lista klijenata | `ClientsList` — klikabilan red, bez Akcije kolone |
| Radnici UI | `ClientEmployeesEditor` — tabela + detalj radnika; dugme Rokovi; bulk import |
| JMBG | `lib/shared/jmbg-validate.ts` — soft warn 11–14 cifara; `bzr-input-warn` |
| Uvoz | `lib/import/*`, `SpreadsheetImportDialog`, vendored `vendor/xlsx-0.20.3.tgz`, SW precache |
| Bulk API | `POST /api/clients/[id]/employees` prima niz; `lib/employees/drafts.ts` |
| Compliance status | `lib/compliance/worker-status.ts`; `getComplianceStatus`: `days <= 0` → expired |
| Compliance forma | Izmena: zaključan subject + category; PATCH samo datumi (+ upload dokumenta) |
| Deep-link | `?tab=rokovi&worker_id=` — filter + predizbor radnika |
| Migracija | `20260728120000_compliance_records.sql` |
| i18n / CSS | Tab labele, status sažeci, fit tabele (`.bzr-employees-table`), bedževi |

### Žurnal (2026-07-30) — compliance notifikacije (cron)

- **Vercel Cron** `0 5 * * *` UTC → `GET/POST /api/cron/compliance-deadlines` (`CRON_SECRET`).
- Pragovi: 30/15/7/3/1 dana + `days <= 0` (`compliance_expired`); dedupe `compliance-{id}-{threshold}`.
- Primaoci: svi `agency_owner` + `assigned_collaborator_id` klijenta.
- UI: `NotificationsBell` u topbaru (postojeći `/api/notifications`).

**Sledeći koraci (1–3):**
1. Postavi `CRON_SECRET` u Vercel env (+ lokalno za smoke test).
2. Ručni smoke: `GET /api/cron/compliance-deadlines?secret=…` sa service role.
3. Provera zvona: unread badge + klik na compliance notif → tab Rokovi.



## Changelog 2026-07-30 — compliance deadline notifikacije

| Stavka | Detalj |
|--------|--------|
| Cron | `vercel.json` + `/api/cron/compliance-deadlines` |
| Logika | `lib/compliance/notify-deadlines.ts` |
| Env | `CRON_SECRET` u `.env.example` |
| UI | `components/layout/NotificationsBell.tsx` u `AppShell` |



## Changelog 2026-07-30 — assigned_collaborator_id kao RLS opseg

Priprema za AI asistenta (Faza A/B tool-ovi): opseg saradnika mora biti stvarna
granica u bazi, a ne samo filter u UI-ju. Do sada je `agency_collaborator` preko
RLS video **sve** klijente agencije.

| Stavka | Detalj |
|--------|--------|
| Migracija | `20260730210000_client_collaborator_scope.sql` — **primenjena u Supabase 2026-07-31**, opseg je aktivan u bazi |
| DB helperi | `is_scoped_collaborator()`, `works_on_client_company(uuid)`, `client_company_in_scope(uuid, uuid, uuid)`, `client_company_in_scope_by_id(uuid)` |
| Tabele pod novim opsegom | `client_companies`, `employees`, `compliance_records`, `documents`, `deadlines` (SELECT/INSERT/UPDATE/DELETE) |
| App sloj | `lib/api/client-scope.ts` — `clientIdsInScope`, `applyClientScope`, `checkClientInScope`, `evaluateClientScope`, `requireClientInScope` |
| Rute | `/api/clients` (GET+POST), `/api/clients/[id]`, `/api/clients/[id]/employees`, `/api/compliance-records`, `/api/field-visits` (POST) |
| Stranice | `/agencija/klijenti`, `/agencija/klijenti/[id]`, `/agencija/field-visits`, `/dashboard` (brojač klijenata) |

**Pravila opsega:** `super_admin` sve; `agency_owner` i `field_worker` cela
agencija (bez promene); `agency_collaborator` samo klijenti gde je
`assigned_collaborator_id = on` **plus** klijenti na čijoj poseti učestvuje
(`assigned_user_id` ili `field_visit_collaborators`). Izuzetak za učešće postoji
da saradnik ne izgubi naziv klijenta na već dodeljenim posetama.

**Posledične promene ponašanja:**
- Saradnik može da kreira klijenta samo zaduženog za sebe (API + RLS WITH CHECK).
- Zaduženog saradnika menja samo vlasnik agencije.
- `deadlines` sa `client_company_id IS NULL` ostaju vidljivi celoj agenciji.



## Changelog 2026-07-30 — AI asistent, Faza A (read alati)

Chat asistent na `/agencija/asistent` koji odgovara na pitanja o podacima preko
OpenAI function calling-a. Faza A ima samo alate za čitanje; write akcije sa
potvrdom dolaze u Fazi B.

| Stavka | Detalj |
|--------|--------|
| Provider | OpenAI Chat Completions, `tools` + `strict: true`, raw `fetch` (bez SDK-a) — isti obrazac kao embeddings/transkripcija |
| Model | `OPENAI_AGENT_MODEL`, podrazumevano `gpt-4o` |
| Ruta | `POST /api/assistant/chat`, `maxDuration = 120`, bez streaminga |
| Petlja | `lib/agent/run.ts` — najviše 4 kruga alata, u poslednjem se alati sklanjaju da model mora da odgovori tekstom |
| Alati | `getVisitCountByAgencyUser`, `getUpcomingDeadlines`, `getEmployeesWithoutComplianceRecords`, `getClientSummary`, `searchFieldVisits` |
| Deljeni upiti | `lib/queries/{clients,compliance,field-visits}.ts` — koriste ih i alati i rute |
| RAG | `/api/search` izvučen u `lib/search/field-visits.ts`; ruta je sada tanak omotač |
| Istorija | Bez tabele — klijent šalje poslednjih 20 poruka |
| Limit | `lib/agent/rate-limit.ts` — 15 zahteva / 5 min po korisniku (opšti limiter je 120/min po IP-u, prelabav za LLM rutu) |
| UI | `/agencija/asistent`, `AssistantChat` + `ToolTraceCard`; nav link za sve članove agencije |

**Bezbednost:** alati nikad ne grade SQL i nikad ne primaju `agency_id` ni UUID
kroz argumente. Svaki alat radi kroz `ToolContext.supabase` — klijent sesije
korisnika, dakle RLS. Opseg klijenata se računa jednom po zahtevu preko
`clientIdsInScope`. ESLint pravilo u `.eslintrc.json` zabranjuje uvoz
`@/lib/supabase/admin` unutar `lib/agent/**`.

**Razrešavanje imena:** model šalje `client_name` / `worker_name` kao tekst, a
`lib/agent/tools/shared.ts` ih razrešava u ID unutar opsega korisnika. Kod
višeznačnog ili nepostojećeg imena alat vraća `needs_clarification` i model
pita korisnika umesto da pogađa.

*Poslednje ažuriranje: 2026-07-30 (AI asistent Faza A).*


