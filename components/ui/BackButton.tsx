"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type BackButtonProps = {
  href?: string;
  className?: string;
};

export function BackButton({ href, className }: BackButtonProps) {
  const router = useRouter();
  const cls = ["bzr-back", className].filter(Boolean).join(" ");

  if (href) {
    return (
      <Link href={href} className={cls}>
        ← Nazad
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} className={cls}>
      ← Nazad
    </button>
  );
}
