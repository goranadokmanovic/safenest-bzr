import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { BackButton } from "@/components/ui/BackButton";

export const dynamic = "force-dynamic";

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <BackButton href="/dashboard" className="mb-6" />
      <h1 className="text-2xl font-bold text-ink">Nemate pristup</h1>
      <p className="mt-3 text-sm text-ink/75">
        Vaš nalog nema dozvolu za ovu stranicu. Ako mislite da je ovo greška,
        kontaktirajte administratora.
      </p>
      <p className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard" className="font-medium underline text-ink">
          Kontrolna tabla
        </Link>
        <LogoutButton />
      </p>
    </main>
  );
}
