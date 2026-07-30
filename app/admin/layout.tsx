import { assertSuperAdminUser } from "@/lib/admin/gate";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertSuperAdminUser();

  return <AdminShell>{children}</AdminShell>;
}
