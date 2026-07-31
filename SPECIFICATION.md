# SafeNest BZR — tehnička specifikacija

**Verzija dokumenta:** 1.0  
**Datum:** 2026-06-26  
**Repozitorijum:** `goranadokmanovic/safenest-bzr` (privatan)

Status implementacije po fazama vidi u [`PLAN.md`](PLAN.md).

---

## **7. SECURITY & COMPLIANCE**

**Transport Security:**
- TLS 1.3 — sve komunikacije šifrovane
- HSTS headers (Strict-Transport-Security)
- CSP (Content-Security-Policy)

**Data at Rest:**
- AES-256 encryption u Supabase
- Encrypted columns za JMBG, health data

**Authentication:**
- 2FA — two-factor authentication (TOTP)
- Session timeout — 30 minuta inaktivnosti
- Password requirements — min 12 karaktera, kompleksnost

**GDPR:**
- Brisanje podataka nakon 7 godina (po Zakonu Srbije)
- Arhiviranje nakon 3 godine (kompresovano)
- Right to be forgotten (GDPR Articl 17)
- Data portability (GDPR Article 20)

**Audit Logs:**
- Sve akcije zabeležene (ko, šta, kada)
- Immutable storage (append-only)
- Retention: 10 godina

**Row Level Security:**
- Svi resursi filtriranih po `agency_id`
- Samo vlasnik vidiš agente
- Samo agenci vidiš svoje klijente

---

## **8. PRICING MODEL — OBE OPCIJE**

### **OPTION A: SaaS (Monthly Subscription)**

**Starter** — $30/mesec
- 1 terenski agent
- Do 50 klijenta
- Osnovne feature-e
- Email support

**Professional** — $99/mesec
- Do 5 terenskih agenata
- Do 500 klijenta
- Sve feature-e
- Priority support
- API access

**Enterprise** — $299/mesec
- Unlimited terenski agenti
- Unlimited klijenta
- White-label opcija
- Dedicated support
- Custom integrations

### **OPTION B: Perpetual License (Self-Hosted)**

**One-time purchase:**
- **Basic License:** $5,000
- **Professional:** $10,000
- **Enterprise:** $15,000

**Annual support:**
- $500-1,000/godinu
- Self-hosted (na njihovom serveru)
- Full source code access
- Customization dozvoljeno

---

## **9. DEVELOPMENT ROADMAP & TIMELINE**

**Phase 1 (2-3 weeks): Core Audio & OCR**
- Voice recording + AI transcript (Google Speech-to-Text)
- Foto + OCR ekstrakcija datuma (Google Vision API)
- Risk scoring (Claude API)
- Field visits CRUD
- Database schema
- RLS policies

**Phase 2 (2-3 weeks): Communication & Integration**
- Team chat (real-time)
- Calendar sync (Google Calendar)
- Inspector export (PDF + XLSX + JSON)
- Mobile receipt + QR kod
- Push notifications (Firebase)
- SMS (Twilio)

**Phase 3 (2-3 weeks): Analytics & Intelligence**
- Predictive analytics dashboard
- Law database integration
- Audit logs (detailed)
- Document versioning
- White-label system
- Data migration tools

**Phase 4 (1-2 weeks): Mobile & Offline**
- React Native/Expo setup
- WatermelonDB offline sync
- Voice/video recording (mobile)
- Signature pad (digital signature)
- Testing on real devices

**Phase 5 (1 week): Polish & Deploy**
- Performance optimization
- Security hardening
- Responsive design testing (all devices)
- i18n SR/EN complete
- Deploy Vercel + Google Cloud
- Production setup

---

## **10. NEXT STEPS**

1. ✅ **Local dev environment** — GOTOVO!
2. ⏳ **Kreiraj database migrations** (Faza 1)
3. ⏳ **Backend API routes** (Faza 1)
4. ⏳ **Mobile app setup** (Faza 4)
5. ⏳ **Frontend web pages** (Faze 1-5)
6. ⏳ **Integration testing** (sve faze)
7. ⏳ **Deploy PROD** (Vercel + Google Cloud)

---

**SADA — KRENI U CURSOR COMPOSER!** 🚀
---

## 1. Pregled proizvoda

SafeNest BZR je **multi-tenant SaaS** za agencije bezbednosti i zdravlja na radu (BZR). Agencija vodi klijente (firme), njihove zaposlene, rokove (lekarski, obuke, OZO, dokumenti), dokumentaciju i obaveštenja. Naplata je **po agenciji** — jedna Stripe pretplata pokriva vlasnika i agente.

### 1.1 Ciljni korisnici

| Uloga | Opis |
|-------|------|
| **Super admin** | Operater platforme; vidi sve agencije, menja pretplate, dodeljuje uloge, audit log. |
| **Vlasnik agencije** (`agency_owner`) | Kreira agenciju, upravlja pretplatom, menja podatke agencije, pun CRUD nad klijentima. |
| **Saradnik** (`agency_collaborator`) | CRUD nad klijentima, zaposlenima, dokumentima, rokovima (uz aktivnu pretplatu). |
| **Terenski radnik** (`field_worker`) | Čitanje agencijskih podataka; može biti zadužen za terensku posetu. Terenski modul je implementiran (v. 13.1). |
| **Klijentski korisnik** (`client_user`) | Budući klijentski portal; trenutno **nema** pristup agencijskim API rutama. |

### 1.2 Van opsega (trenutna verzija)

Inspekcije, pravna baza, Excel/API import, generisanje PDF obrazaca, enterprise API, pun tok pozivnica, klijentski portal UI, produkcijski deploy.

Terenske posete (sa offline-first sync-om), glasovni unos i AI asistent bili su
prvobitno van opsega, ali su u međuvremenu implementirani — v. sekciju 13.
i18n (sr/en) je delimično implementiran.

---

## 2. Tehnološki stack

| Sloj | Tehnologija |
|------|-------------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Backend (BFF) | Next.js Route Handlers (`app/api/*`) |
| Baza | Supabase Postgres + Row Level Security (RLS) |
| Auth | Supabase Auth (email/lozinka) |
| Fajlovi | Supabase Storage, bucket `documents` |
| Plaćanje | Stripe (Checkout, Customer Portal, Webhooks) |
| Validacija | Zod |
| Deploy (planirano) | Vercel |

### 2.1 Arhitektura

```
Browser → Next.js (middleware: auth + rate limit)
              ├── Server Components / stranice (app/*)
              └── API rute (app/api/*) — BFF
                      ├── Supabase klijent (anon + sesija korisnika, RLS)
                      └── Supabase admin (service_role) — Stripe, admin, bootstrap
```

- **Multi-tenant izolacija:** primarno po `agency_id`; RLS na Postgres nivou.
- **Monolit:** nema odvojenog API servera; sve kroz Next.js.
- **Cene planova:** isključivo iz Stripe Price ID (env), ne hardkodirane u aplikaciji.

---

## 3. Model podataka (jezgro)

Migracije: `supabase/migrations/`.

### 3.1 Tabele

| Tabela | Svrha |
|--------|-------|
| `agencies` | Tenant; pretplata, Stripe ID-jevi, `plan_tier`, `subscription_status`, `trial_ends_at` |
| `profiles` | Korisnik ↔ uloga, `agency_id`, `client_company_id`, `locale` (sr/en) |
| `agency_members` | Članstvo u agenciji (`owner`, `collaborator`, `field_worker`) |
| `client_companies` | Klijent agencije; `semaphore` (green/yellow/red); soft arhiva (`archived_at`) |
| `employees` | Zaposleni kod klijenta |
| `documents` | Metadata fajlova; `storage_path`, `folder`, `uploaded_by` |
| `deadlines` | Rokovi: `entity_type` (medical, training, ppe, document, custom), `due_at` |
| `notifications` | Obaveštenja po korisniku; `dedupe_key`, `read_at` |
| `admin_audit_log` | Admin akcije (samo service_role upis) |
| `stripe_events` | Idempotentna obrada Stripe webhook-a |

### 3.2 Storage

- **Bucket:** `documents` (privatan).
- **Putanja:** `{agency_id}/{client_company_id}/{uuid}-{sanitized_filename}`
- **Helper:** `lib/api/documents-storage.ts`

### 3.3 RLS princip

- Korisnik vidi/menja samo zapise svoje agencije (`profile_matching_agency`).
- Super admin ima pun pristup (`is_super_admin()`).
- **Opseg saradnika** — migracija `20260730210000_client_collaborator_scope.sql`,
  primenjena 2026-07-31 i **aktivna u bazi**:
  `agency_collaborator` ne vidi sve klijente agencije, već samo one gde je
  `assigned_collaborator_id = on`, plus klijente na čijoj poseti učestvuje.
  Važi za `client_companies`, `employees`, `compliance_records`, `documents` i
  `deadlines`; app sloj preslikava istu logiku u `lib/api/client-scope.ts`.
- `profiles`: korisnik menja samo `full_name` i `locale` (column-level grant).
- Dopuna Faze 5 (`20250626120000_phase5_rls_storage_notifications.sql`):
  - `agencies` UPDATE — vlasnik agencije
  - `profiles` SELECT — peer članovi iste agencije
  - `notifications` INSERT — agencijski korisnici za kolege
  - Storage politike po `agency_id` u putanji

---

## 4. Autentifikacija i autorizacija

### 4.1 Tok

1. Registracija / login → Supabase Auth.
2. Trigger `handle_new_user` → red u `profiles` (default: `agency_collaborator`).
3. Prvi login vlasnika → `POST /api/auth/bootstrap-agency` (service role) kreira agenciju i `agency_members`.
4. Middleware štiti `/dashboard`, `/admin`, `/api/*` (osim health, stripe webhook).

### 4.2 Helperi (`lib/api/session.ts`)

| Funkcija | Pravilo |
|----------|---------|
| `canMutateAgencyRecords` | super_admin, agency_owner, agency_collaborator |
| `canReadAgencyRecords` | super_admin + svi sa `agency_id` osim client_user |
| `canManageAgencyBilling` | agency_owner sa `agency_id` |
| `isClientPortalUser` | role === client_user → 403 na agencijskim rutama |

### 4.3 Feature gating (`lib/plans/feature-gate.ts`)

Mutacije (POST/PATCH/DELETE) zahtevaju aktivnu pretplatu agencije:

- Dozvoljeno: `subscription_status` ∈ `active`, `trialing` (sa važećim `trial_ends_at`), ili `none` sa budućim `trial_ends_at`.
- Odbijeno: HTTP **402**, `code: SUBSCRIPTION_REQUIRED`.
- Super admin preskače proveru.
- Implementirano kroz `getMutationContext()` u `lib/api/mutation-guards.ts`.

---

## 5. Planovi i naplata

Definicija: `lib/plans/catalog.ts`.

| Plan ID | Naziv | Mesta (vlasnik + agenti) |
|---------|-------|--------------------------|
| `agency_basic` | Osnovni | 3 |
| `agency_l` | L | 9 |
| `agency_xl` | XL | neograničeno |

- **Jedna pretplata po agenciji**; svi agenti pod istom pretplatom.
- **Limit sedišta** pri admin dodeli korisnika u agenciju (`lib/plans/seats.ts`, `SEAT_LIMIT`).
- **Stripe Price ID** (6 komada u env): mesečno/godišnje × 3 plana. Metadata na ceni: `plan_tier`.
- Sinhronizacija: webhook → `lib/stripe/sync-agency.ts` → polja na `agencies`.

---

## 6. API specifikacija

Sve rute zahtevaju sesiju osim `/api/health` i `/api/stripe/webhook`.

### 6.1 Format odgovora

**Uspeh:** `{ ...payload }` sa odgovarajućim HTTP statusom (200, 201).

**Greška:**

```json
{
  "error": "Poruka na srpskom",
  "code": "VALIDATION_ERROR",
  "details": {}
}
```

Uobičajeni kodovi: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `DATABASE_ERROR`, `SUBSCRIPTION_REQUIRED`, `RATE_LIMITED`, `CONFIG_ERROR`.

### 6.2 Pregled ruta

#### Sesija i agencija

| Metoda | Ruta | Opis | Mutacija guard |
|--------|------|------|----------------|
| GET | `/api/me` | Profil ulogovanog | — |
| PATCH | `/api/me` | `full_name`, `locale` | — |
| GET | `/api/agency` | Podaci agencije | — |
| PATCH | `/api/agency` | Vlasnik menja name, legal_name, tax_id, address, phone | — |
| GET | `/api/agency/members` | Članovi + ugnježdeni profiles | — |
| POST | `/api/auth/bootstrap-agency` | Kreiranje agencije (idempotentno) | service role |

#### Klijenti

| Metoda | Ruta | Opis |
|--------|------|------|
| GET | `/api/clients` | Lista; `?q=`, `?archived=1`, `?agency_id=` (super admin) |
| POST | `/api/clients` | Kreiranje |
| GET | `/api/clients/[id]` | Jedan klijent |
| PATCH | `/api/clients/[id]` | Ažuriranje; `archived_at: null` = unarchive |
| DELETE | `/api/clients/[id]` | Soft delete (`archived_at` = now) |

#### Zaposleni

| Metoda | Ruta | Opis |
|--------|------|------|
| GET | `/api/clients/[id]/employees` | Lista po klijentu |
| POST | `/api/clients/[id]/employees` | Kreiranje |
| GET | `/api/employees/[id]` | Jedan zaposleni |
| PATCH | `/api/employees/[id]` | Ažuriranje |
| DELETE | `/api/employees/[id]` | Hard delete |

#### Dokumenti

| Metoda | Ruta | Opis |
|--------|------|------|
| GET | `/api/clients/[id]/documents` | Lista metadata |
| POST | `/api/clients/[id]/documents` | Registracija metadata posle uploada |
| POST | `/api/clients/[id]/documents/upload-url` | Signed upload URL |
| GET | `/api/documents/[id]` | Jedan dokument |
| PATCH | `/api/documents/[id]` | Izmena metadata |
| DELETE | `/api/documents/[id]` | Brisanje DB + Storage fajla |

**Upload tok:**

1. `POST .../upload-url` `{ "filename": "ugovor.pdf" }` → `{ storage_path, signed_url, token }`
2. Klijent uploaduje fajl na `signed_url` (PUT)
3. `POST .../documents` `{ storage_path, filename, folder, mime_type?, size_bytes? }`

`folder`: `bzr` | `employment` | `agency` | `generated`

#### Rokovi

| Metoda | Ruta | Status |
|--------|------|--------|
| GET | `/api/deadlines` | Implementirano; filteri: `from`, `to`, `client_id`, `type`, `agency_id` |
| POST | `/api/deadlines` | **Planirano** |
| GET/PATCH/DELETE | `/api/deadlines/[id]` | **Planirano** |

#### Obaveštenja

| Metoda | Ruta | Status |
|--------|------|--------|
| GET | `/api/notifications` | Implementirano; `limit`, `offset` |
| PATCH | `/api/notifications/[id]/read` | Označavanje pročitanim |
| POST | `/api/notifications` | **Planirano** |
| PATCH | `/api/notifications/read-all` | **Planirano** |

#### Stripe

| Metoda | Ruta | Opis |
|--------|------|------|
| GET | `/api/stripe/plan-prices` | Cene iz Stripe-a (za UI) |
| POST | `/api/stripe/checkout-session` | `{ planId, billingInterval }` |
| POST | `/api/stripe/portal` | Customer Portal URL |
| POST | `/api/stripe/webhook` | Stripe events (idempotentno) |

#### Admin (super_admin + service role)

| Metoda | Ruta | Opis |
|--------|------|------|
| PATCH | `/api/admin/agencies/[id]` | Pretplata, plan, trial |
| DELETE | `/api/admin/agencies/[id]` | Cascade brisanje (confirm phrase) |
| PATCH | `/api/admin/profiles/[userId]` | Uloga, agency_id (seat limit) |
| DELETE | `/api/admin/profiles/[userId]` | Brisanje korisnika |

Liste agencija/korisnika/audit-a: SSR stranice u `app/admin/*` (direktan upit sa service role).

#### Health

| Metoda | Ruta | Opis |
|--------|------|------|
| GET | `/api/health` | Liveness (bez auth) |

---

## 7. Validacija (Zod)

Centralno: `lib/api/schemas.ts`.

| Šema | Upotreba |
|------|----------|
| `clientCreateSchema` / `clientPatchSchema` | Klijenti |
| `employeeCreateSchema` / `employeePatchSchema` | Zaposleni |
| `documentCreateSchema` / `documentPatchSchema` / `documentUploadUrlSchema` | Dokumenti |
| `deadlineCreateSchema` / `deadlinePatchSchema` / `deadlinesQuerySchema` | Rokovi |
| `notificationCreateSchema` | Obaveštenja |
| `agencyPatchSchema` | Agencija |
| `stripeCheckoutBodySchema` | Checkout |
| `adminAgencyPatchSchema` / `adminProfilePatchSchema` | Admin |
| `patchMeSchema` | `/api/me` |

Telo zahteva: max **512 KB** (`readJsonBody`), JSON sa `code` pri grešci.

---

## 8. Error handling i bezbednost

| Mehanizam | Lokacija |
|-----------|----------|
| Globalni catch | `withApiCatch` — 500 `INTERNAL_ERROR` |
| Rate limit | 120 req/min po IP na `/api/*` (osim health, webhook) |
| Stripe idempotencija | Unique `stripe_event_id` u `stripe_events` |
| Column grants | `profiles` — samo `full_name`, `locale` za authenticated |
| Admin audit | `lib/admin/audit.ts` |

---

## 9. Frontend (trenutno stanje)

| Ruta | Svrha |
|------|-------|
| `/` | Početna |
| `/login`, `/register` | Auth |
| `/dashboard` | Dashboard agencije (+ Stripe billing komponenta) |
| `/admin`, `/admin/agencies`, `/admin/users`, `/admin/audit` | Super admin |

Dizajn: delimično žuto–crna tema. Pun i18n i kompletan UI set — planirano (Faza 9).

---

## 10. Konfiguracija (env)

Šablon: `.env.example`.

| Promenljiva | Obavezno | Opis |
|-------------|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Da | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Da | Anon key (browser + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Da | Server only — admin, webhook, bootstrap |
| `STRIPE_SECRET_KEY` | Da | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Da | Verifikacija webhook-a |
| `STRIPE_PRICE_*` (×6) | Da | Price ID po planu i intervalu |
| `NEXT_PUBLIC_APP_URL` | Ne | Produkcijski URL (redirect nakon checkout) |

**Nikad** commitovati `.env.local`.

---

## 11. Operativne napomene

1. **Migracije:** primeniti sve fajlove iz `supabase/migrations/` redom na Supabase projektu.
2. **Prvi super admin:** nakon registracije, u SQL Editoru: `update public.profiles set role = 'super_admin' where email = '...'`.
3. **Dev bez Stripe-a:** postaviti `subscription_status = 'active'` na agenciji ili koristiti super_admin za mutacije.
4. **Stripe test/live:** Price ID i `STRIPE_SECRET_KEY` moraju biti iz istog Stripe naloga i režima.
5. **Reset dev baze:** `supabase/scripts/reset-phase3-dev-only.sql` — ne brisati `storage.buckets` iz SQL-a.

---

## 12. Struktura repozitorijuma

```
app/
  api/          # BFF rute
  admin/        # Admin SSR stranice
  dashboard/    # Dashboard
  login/ register/
components/
  admin/ auth/ dashboard/
lib/
  api/          # session, schemas, guards, responses
  plans/        # catalog, seats, feature-gate
  stripe/       # Stripe integracija
  supabase/     # klijenti (browser, server, admin)
  admin/ rate-limit/
supabase/
  migrations/
  scripts/
PLAN.md         # Plan razvoja i status faza
safenest-bzr/
  SPECIFICATION.md  # Ovaj dokument
```

---

## 13. Referenca na status implementacije

| Oblast | Spec status |
|--------|-------------|
| Auth, multi-tenant, RLS jezgro | Specifikovano i implementirano |
| Klijenti, zaposleni, dokumenti | Specifikovano i implementirano |
| Feature gating, Stripe, admin | Specifikovano i implementirano |
| Rokovi CRUD, obaveštenja create/read-all | Specifikovano, **delimično** implementirano |
| Terenske posete + offline-first sync | Specifikovano i implementirano |
| AI asistent — Faza A (alati za čitanje) | Specifikovano i implementirano |
| AI asistent — Faza B (write akcije uz potvrdu) | Sledeći planirani korak |
| i18n (sr/en) | **Delimično** implementirano |
| Deploy | Pripremljeno za Vercel (cron + env), bez potvrde produkcije |
| Klijentski portal (UI za `client_user`) | Van opsega / kasnije |

### 13.1 Terenske posete

Modul je završen odavno i pokriva ceo tok posete: kreiranje i vođenje
(`/agencija/field-visits`), transkripciju audija, popunjavanje i generisanje
izveštaja, zatvaranje izveštaja, saradnike na poseti i zahtev za ponovno
otvaranje. Rute su pod `app/api/field-visits/*`.

Offline-first rad je izveden preko IndexedDB-a (localforage) i outbox reda u
`lib/offline/*`; red se prazni na `POST /api/sync`, a Service Worker
(`public/sw.js`) koristi Background Sync. Uključuje se zastavicom
`NEXT_PUBLIC_ENABLE_OFFLINE`.

### 13.2 AI asistent

Chat na `/agencija/asistent` odgovara na pitanja o podacima preko OpenAI
function calling-a (`POST /api/assistant/chat`, jezgro u `lib/agent/*`).
Registrovano je pet alata, svi **samo za čitanje**:

| Alat | Šta vraća |
|------|-----------|
| `getVisitCountByAgencyUser` | Broj poseta po članu agencije u periodu |
| `getUpcomingDeadlines` | Rokovi koji ističu u narednih N dana |
| `getEmployeesWithoutComplianceRecords` | Zaposleni bez compliance zapisa |
| `getClientSummary` | Pregled klijenta (zaposleni, posete, rokovi) |
| `searchFieldVisits` | Postojeća RAG pretraga terenskih poseta |

Alati nikad ne grade SQL niti primaju `agency_id` kroz argumente — svaki radi
kroz Supabase klijent sesije korisnika, pa nasleđuje RLS i opseg saradnika.

**Faza B** je sledeći planirani korak: write akcije (kreiranje posete, pomeranje
roka, dodela saradnika klijentu) koje agent samo *predlaže*, a korisnik mora
eksplicitno da potvrdi pre izvršenja.

Za ažuran žurnal razvoja: [`PLAN.md`](PLAN.md).
