import { redirect } from "next/navigation";

/**
 * Pozivnice su spojene u tab "Radnici agencije" — lista članova i pozivnice
 * koje čekaju stoje na istom ekranu. Ruta ostaje zbog starih linkova.
 */
export default function AgencijaPozivnicePage() {
  redirect("/agencija/radnici");
}
