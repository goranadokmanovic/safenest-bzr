/**
 * Provera da li pretraga terenskih poseta poštuje RLS.
 *
 * Poziva match_field_visits anonimnim ključem, bez ijedne sesije, i sa
 * match_agency_id => null (dakle "sve agencije"). Anon ključ je javan, pa je
 * ovo tačno ono što bi mogao svako sa interneta.
 *
 * Očekivano posle migracije 20260731140000_match_field_visits_security.sql:
 * greška o dozvolama ili 0 redova. Bilo koji vraćen red znači da funkcija i
 * dalje zaobilazi RLS.
 *
 * Pokretanje:  node --env-file=.env.local supabase/scripts/verify-match-field-visits-rls.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Nedostaju NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

// Nasumičan jedinični vektor + prag -1: sličnost nas ne zanima, hoćemo da
// vidimo da li se redovi uopšte vraćaju.
const raw = Array.from({ length: 1536 }, () => Math.random() - 0.5);
const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
const embedding = raw.map((v) => v / norm);

const db = createClient(url, anonKey, { auth: { persistSession: false } });

const { data, error } = await db.rpc("match_field_visits", {
  query_embedding: embedding,
  match_agency_id: null,
  match_count: 50,
  match_threshold: -1,
  match_risk_level: null,
});

if (error) {
  console.log(`OK — anon poziv odbijen: ${error.code ?? "?"} ${error.message}`);
} else if ((data?.length ?? 0) === 0) {
  console.log("OK — anon poziv je prošao, ali RLS nije propustio nijedan red.");
} else {
  console.error(
    `PROBLEM — anon poziv bez prijave vratio je ${data.length} terenskih poseta. ` +
      "Funkcija i dalje zaobilazi RLS.",
  );
  process.exitCode = 1;
}
