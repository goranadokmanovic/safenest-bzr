"use client";

import { useEffect, useState } from "react";

/** Sprečava hydration mismatch za vrednosti dostupne samo u browseru. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
