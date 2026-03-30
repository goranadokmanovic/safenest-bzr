# SafeNest BZR — plan razvoja

SaaS za agencije BZR (bezbednost i zdravlje na radu): klijenti, zaposleni, rokovi, dokumenta, obaveštenja, naplata po agenciji, admin. Tehnologije iz početnog briefa: Next.js 14 (App Router), TypeScript, Tailwind, Supabase (Postgres, Auth, Storage), Stripe, kasnije Vercel.

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

## Status po fazama (stanje: mart 2026, ažurirano 2026-03-31)

### Faza 1 — Plan i arhitektura
- **Gotovo.** Plan je bio u originalnom četu; arhitektura je usklađena sa implementacijom (monolit Next, BFF rute, multi-tenant po `agency_id`).

### Faza 2 — Setup projekta
- **Gotovo.** `safenest-bzr`, Next 14.2, Tailwind, ESLint, `lib/supabase/*`, `middleware.ts`, `/api/health`, `.env.example`.

### Faza 3 — Baza podataka
- **Gotovo (jezgro).** Migracija `20250329120000_phase3_core_schema.sql`: `agencies`, `client_companies`, `profiles`, `agency_members`, `employees`, `documents`, `deadlines`, `notifications`, `admin_audit_log`, `stripe_events`, RLS, `handle_new_user`, bucket `documents`. Funkcije `is_super_admin` / `profile_matching_agency` **posle** `CREATE TABLE profiles` (PostgreSQL provera pri `CREATE FUNCTION`).
- **Dodatak:** `20250329130000_agency_plan_tier_defaults.sql` — default `agency_basic`, migracija sa `starter`.
- **Dev:** `supabase/scripts/reset-phase3-dev-only.sql` — **ne** koristiti `DELETE` na `storage.buckets` iz SQL-a (Supabase blokira); bucket ručno u Dashboard ako treba. Na praznoj bazi: samo migracija; ako već postoje tabele: prvo reset skripta, pa ceo SQL migracije.
- **Nije u punom obimu originalnog „mega“ plana:** nisu sve tabele iz prvog prompta (teren, AI, inspekcija, pravna baza, import jobs, itd.) — one dolaze kad budu potrebne API-jima.

### Faza 4 — Autentifikacija
- **Gotovo (za postojeći scope).** `/login`, `/register`, `/dashboard`, middleware zaštita, `profiles` + trigger, bootstrap agencije `/api/auth/bootstrap-agency`, uloge u kodu.
- **Korisnici u `auth.users` bez reda u `profiles`** (npr. kreirani pre aktivnog triggera): u SQL Editoru backfill `insert into public.profiles (...) select ... from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id);` zatim `update ... set role = 'super_admin' where email = '...'`.
- **Nije:** OAuth, pozivnice kao pun UI tok, pojedinačne zaštite po ulogama za sve buduće stranice.

### Faza 5 — Glavne funkcije (backend)
- **Delimično gotovo.** Implementirane rute (pregled): `me`, **`GET/PATCH /api/agency`** (podaci agencije; **PATCH** samo **`agency_owner`**, šema `agencyPatchSchema`), **`GET /api/agency/members`** (lista `agency_members` sa ugnježđenim `profiles`), `clients`, `clients/[id]`, `clients/[id]/employees`, `clients/[id]/documents`, `employees/[id]`, `deadlines`, `notifications`, `notifications/[id]/read`, `auth/bootstrap-agency`, Stripe, admin `agencies/[id]`, `profiles/[userId]`.
- **Zaštita uloga:** u `lib/api/session.ts` — među ostalim **`isClientPortalUser`** (`client_user`) nema pristup agencijskim rutama koje vraćaju 403; čitanje agencijskih zapisa za članove sa `agency_id` preko **`canReadAgencyRecords`**.
- **Nije / sledeće iz master plana:** teren (`field-visits`, sync), glas/AI, inspekcija, readiness PDF, pravna baza, Excel/API import, generisanje PDF obrazaca, enterprise API, pozivnice kao pun tok, itd.

### Faza 6 — Error handling i edge case-ovi
- **Delimično gotovo.** Zod šeme u `lib/api/schemas.ts`, `withApiCatch`, `readJsonBody` sa limitom, JSON greške sa `code`, rate limit po IP na `/api/*` (`lib/rate-limit/middleware`), Stripe webhook idempotencija preko tabele `stripe_events` (idempotentna obrada eventa), kolone privilegije na `profiles` (samo `full_name`, `locale` za `authenticated`), provera **`SEAT_LIMIT`** pri admin `PATCH` profila (dodela u agenciju).
- **Uvek može bolje:** Redis/Edge rate limit, centralni logger, sve rute pod jednim error formatom, svi edge case-ovi iz Faze 1 dokumenta.

### Faza 7 — Stripe
- **Gotovo za trenutni model.** Naplatu vodi **agencija**; jedna pretplata po agenciji; agenti pod istom pretplatnom.
- **Planovi i limiti mesta:** **Osnovni** — vlasnik + do 2 agenta (**ukupno 3** plaćena mesta); **L** — vlasnik + do 8 agenata (**ukupno 9**); **XL** — **neograničeno**. Definicija u `lib/plans/catalog.ts` (bez numeričkih cena u kodu).
- **Cene isključivo iz Stripe-a:** šest env promenljivih sa **Price ID** (`STRIPE_PRICE_AGENCY_BASIC_MONTHLY/YEARLY`, `*_L_*`, `*_XL_*` — vidi `.env.example`). Iznosi za UI: `GET /api/stripe/plan-prices` (zahtev prijavu); server za svaki ID poziva `stripe.prices.retrieve` u `lib/stripe/plan-price-quotes.ts`. Komponenta `components/dashboard/stripe-billing.tsx` prikazuje period (mesečno/godišnje) i iznose iz odgovora. Checkout (`app/api/stripe/checkout-session/route.ts`) prima izbor plana i intervala; metadata **`plan_tier`** na pretplati + preporučeno ista vrednost u **metadata** svake **Price** u Dashboardu. U `lib/stripe/prices.ts` mapiranje plan ↔ env (uklj. pomoć **`stripePriceEnvName`** za jasne greške).
- **Greška „No such price“:** nastaje kada `price_...` u `.env.local` ne postoji za **isti** Stripe nalog i **isti** režim (test `sk_test_` vs live `sk_live_`) kao `STRIPE_SECRET_KEY`, ili je cena obrisana. Pri `retrieve` je u kodu bolja poruka (koja env promenljiva / plan / interval).
- **Ostalo:** Customer portal (`/api/stripe/portal`), webhook (`/api/stripe/webhook`) sa idempotentnošću. Ukinut jedan generiški `STRIPE_PRICE_ID` u korist ovih šest ID-jeva.

### Faza 8 — Admin panel
- **Delimično gotovo.** `/admin`, agencije, korisnici, audit; API sa service role; brisanje agencije (cascade); izmena pretplate/plana iz admin UI.
- **Nije:** statistike prihoda, napredno upravljanje pretplatama kao u punom briefu.

### Faza 9 — Frontend dizajn
- **U toku / minimalno.** Funkcionalne stranice (početna, login, register, dashboard, admin) bez punog i18n (next-intl), bez kompletnog seta ekrana iz prompta (onboarding wizard, import, kalendar UI, teren mobilni UI, klijentski portal, itd.). Dizajn: delimično žuto–crna tema.

### Faza 10 — Testiranje
- **Nije sistematski.** Manuelni tokovi rade tokom razvoja; nema E2E suite u repou.

### Faza 11 — Deploy
- **Nije.** Produkcija na Vercel, odvojeni Supabase/Stripe PROD ključevi.

---

## Sažetak: urađeno / u toku / sledeće

| Oblast | Status |
|--------|--------|
| Jezgro baza + RLS + auth trigger | Urađeno |
| API: klijenti, zaposleni, dokumenti, rokovi, notifikacije | Urađeno |
| API: agencija (`/api/agency`), članovi (`/api/agency/members`) | Urađeno |
| Stripe: 3 plana, mesečno/godišnje, cene iz API-ja, webhook, portal | Urađeno (šest Price ID u env + isti test/live kao secret) |
| Limit mesta po planu (admin dodela) | Urađeno |
| Admin: liste, audit, brisanje agencije | Urađeno |
| i18n sr/en, pun landing, sve stranice iz briefa | **Sledeće** |
| Teren, AI, inspekcija, import, PDF obrasci, portal | **Sledeće** (po prioritetu) |
| E2E testovi, CI | **Kasnije** |
| PROD deploy | **Kasnije** |

---

## Reference u repou

- Migracije: `supabase/migrations/`
- Reset (dev): `supabase/scripts/reset-phase3-dev-only.sql`
- Planovi i limiti: `lib/plans/catalog.ts`, `lib/plans/seats.ts`
- Stripe: `lib/stripe/prices.ts`, `lib/stripe/plan-price-quotes.ts`, `lib/stripe/env.ts`, sinhronizacija pretplate npr. `lib/stripe/sync-agency.ts`
- API: `app/api/agency/route.ts`, `app/api/agency/members/route.ts`; Stripe: `app/api/stripe/plan-prices/route.ts`, `checkout-session`, `portal`, `webhook`
- Validacija: `lib/api/schemas.ts` (uklj. `agencyPatchSchema`, admin šeme)
- Sesija / uloge: `lib/api/session.ts`
- UI naplate: `components/dashboard/stripe-billing.tsx`
- Env šablon: `.env.example`

---

## Održavanje ovog fajla

**Dogovor:** korisnik na kraju rada napiše da se `PLAN.md` još jednom ažurira; agent tada upiše kratki žurnal (datum, urađeno u toj sesiji, sledeći koraci 1–3).

Redovno održavati: datum poslednjeg ažuriranja, realan status faza, operativne napomene (env, Stripe, Supabase) koje utiču na sledeći rad.

### Žurnal (2026-03-29)

- **Baza (Faza 3):** `20250329120000_phase3_core_schema.sql` — jezgro tabele, RLS, `handle_new_user`, bucket `documents`, `stripe_events`; funkcije `is_super_admin` / `profile_matching_agency` **posle** `profiles`. Dodatak `20250329130000_agency_plan_tier_defaults.sql` (default `agency_basic`, migracija sa `starter`). Dev: `reset-phase3-dev-only.sql` (bez brisanja `storage.buckets` iz SQL-a).
- **Auth / API (Faze 4–5):** login, register, dashboard, middleware, bootstrap agencije; rute za klijente, zaposlene, dokumente, rokove, notifikacije; napomena za backfill `profiles` za stare `auth.users`.
- **Hardening (Faza 6):** Zod, `withApiCatch`, rate limit, JSON `code`, idempotentan Stripe webhook, `SEAT_LIMIT` na admin dodeli sedišta.
- **Stripe (Faza 7):** tri plana (Basic **3**, L **9** — vlasnik + 8 agenata, XL neograničeno); mesečno/godišnje; **bez kalkulacije cena u kodu** — iznosi iz Stripe Price preko `/api/stripe/plan-prices` i `plan-price-quotes.ts`; UI u `stripe-billing.tsx`. Checkout + metadata `plan_tier`. Dokumentovana operativna greška „No such price“ (usklađenost test/live i naloga) — potvrđeno u radu nakon usklađenih Price ID u `.env.local` sa istim Stripe nalogom i test/live režimom.
- **Admin (Faza 8):** `/admin`, agencije, korisnici, audit, cascade brisanje, izmena plana gde je predviđeno.
- **Dokumentacija:** ovaj `PLAN.md` kao izvor istine za faze i reference fajlova.
- **Sledeće (predlog):** Faza 9 — i18n sr/en, landing i ostale stranice iz briefa; po prioritetu proširenje Faze 5 (teren, import, portal klijenta, itd.); E2E i deploy kada bude vreme.

### Žurnal (2026-03-31)

- **Faza 5 — agencijski API:** `GET /api/agency` i `PATCH /api/agency` (vlasnik menja `name`, `legal_name`, `tax_id`, `address`, `phone`); `GET /api/agency/members` (članovi + profili). Pomoćne funkcije u `lib/api/session.ts` (`isClientPortalUser`, `canManageAgencyBilling`, itd.); validacija `agencyPatchSchema` u `lib/api/schemas.ts`.
- **GitHub:** repozitorijum `goranadokmanovic/safenest-bzr` (privatan), `.env*.local` i osetljivi scratch fajlovi izvan repoa.

*Poslednje ažuriranje: 2026-03-31.*
