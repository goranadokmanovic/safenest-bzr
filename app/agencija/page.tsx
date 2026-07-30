import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Agency home is merged into /dashboard (sidebar hub). */
export default function AgencijaHomePage() {
  redirect("/dashboard");
}
