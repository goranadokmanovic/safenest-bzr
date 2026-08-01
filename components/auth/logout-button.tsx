"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  clearZrnaPanelChat,
  setZrnaPanelOpen,
} from "@/lib/agent/zrna-panel-chat-store";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    clearZrnaPanelChat();
    setZrnaPanelOpen(false);
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
