import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { BrandDecor } from "@/components/brand/BrandDecor";

export default function HomePage() {
  return (
    <main className="bzr-auth-shell bzr-landing">
      <header className="bzr-landing-header">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <span className="bzr-landing-logo">
            <Image
              src="/brand/logo-mark.png"
              alt="Bez Zrna Rizika"
              width={92}
              height={92}
              priority
              className="h-full w-full object-contain"
            />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[1.55rem] font-normal leading-none tracking-tight text-ink sm:text-[2rem]">
              Bez<span className="text-accent">Zrna</span>Rizika
            </span>
            <span className="mt-2 block text-[0.55rem] font-semibold uppercase tracking-[0.25em] text-ink/45 sm:text-[0.63rem]">
              Bezbednost i zdravlje na radu
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle className="bzr-landing-control" />
          <Link
            href="/login"
            className="bzr-landing-control"
            aria-label="Otvori meni i prijavu"
          >
            <span aria-hidden className="flex flex-col gap-[5px]">
              <span className="h-px w-4 bg-current" />
              <span className="h-px w-4 bg-current" />
              <span className="h-px w-4 bg-current" />
            </span>
          </Link>
        </div>
      </header>

      <section className="bzr-landing-hero">
        <div className="bzr-landing-stage">
          <BrandDecor
            kind="dots-ring"
            layer="background"
            sizeClassName="h-[34rem] w-[34rem] sm:h-[44rem] sm:w-[44rem] lg:h-[56rem] lg:w-[56rem] xl:h-[64rem] xl:w-[64rem]"
            className="bzr-landing-ring"
          />
          <div className="bzr-landing-copyblock">
            <p className="bzr-kicker">
              <span className="bzr-kicker-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              Bezbednost bez kompromisa
              <span className="bzr-kicker-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </p>

            <h1 className="bzr-landing-title">
              Bezbednost i zdravlje
              <br />
              <span className="bzr-landing-title-line">
                na radu, <em>bez zrna rizika.</em>
              </span>
            </h1>

            <p className="bzr-landing-copy">
              Jedinstvena platforma za firme, savetnike i zaposlene. Vodite
              dokumentaciju, obuke, preglede i incidente — elegantno, precizno i
              uvek u skladu sa zakonom.
            </p>

            <div className="bzr-landing-actions">
              <Link href="/register" className="bzr-btn-primary">
                <span>Započni odmah</span>
                <span aria-hidden>→</span>
              </Link>
              <Link href="/login" className="bzr-btn-ghost">
                <span>Pogledaj mogućnosti</span>
                <span aria-hidden>↗</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-border/10 bg-surface-2/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "100%", l: "Usklađenost sa Zakonom o BZR" },
            { n: "0", l: "Propuštenih rokova uz podsetnike" },
            { n: "5×", l: "Brže vođenje evidencije" },
            { n: "24/7", l: "Dostupnost dokumentacije" },
          ].map((s) => (
            <div key={s.l}>
              <p className="font-sans text-4xl font-semibold tabular-nums tracking-tight text-accent">{s.n}</p>
              <p className="mt-2 text-sm leading-snug text-ink/55">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-ink/45">
        <p>© 2026 BezZrnaRizika. Sva prava zadržana.</p>
        <Link href="/dashboard" className="underline-offset-4 hover:text-accent hover:underline">
          Kontrolna tabla
        </Link>
      </footer>
    </main>
  );
}
