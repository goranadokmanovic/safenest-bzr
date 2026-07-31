/**
 * Odgovori koje sastavlja kod, a ne model.
 *
 * Koriste se tamo gde formulacija mora da bude doslovno ista svaki put — pre
 * svega kod odbijanja pristupa, gde prepričavanje modela može da omekša poruku
 * ili da oda više nego što sme. Modul namerno nema nijednu zavisnost, da može
 * da se uveze i u serverski alat i u klijentsku komponentu.
 */

/** Klijent postoji u agenciji, ali nije dodeljen ulogovanom saradniku. */
export function clientOutOfScopeReply(clientName: string): string {
  return `Klijent '${clientName}' nije dodeljen vama, pa nemam pristup njegovim podacima. Obratite se vlasniku agencije.`;
}
