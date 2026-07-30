import { redirect } from "next/navigation";



export const dynamic = "force-dynamic";



export default function DashboardFieldVisitsRedirect() {

  redirect("/agencija/field-visits");

}

