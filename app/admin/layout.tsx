import Link from "next/link";
import { assertSuperAdminUser } from "@/lib/admin/gate";
import { LogoutButton } from "@/components/auth/logout-button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertSuperAdminUser();

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="border-b border-ink px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/admin"
              className="text-lg font-bold tracking-tight text-ink"
            >
              SafeNest — admin
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm font-medium">
              <Link href="/admin/agencies" className="underline-offset-4 hover:underline">
                Agencije
              </Link>
              <Link href="/admin/users" className="underline-offset-4 hover:underline">
                Korisnici
              </Link>
              <Link href="/admin/audit" className="underline-offset-4 hover:underline">
                Audit
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="underline">
              Kontrolna tabla
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
