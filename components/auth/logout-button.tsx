"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      /* env missing */
    }
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} className="bzr-btn-ghost bzr-btn-sm">
      Odjava
    </button>
  );
}
