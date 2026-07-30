import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  /** web = full wordmark for desktop headers; mark = compact for tight spaces */
  variant?: "web" | "mark" | "mobile";
  className?: string;
  priority?: boolean;
};

const SRC = {
  web: "/brand/logo-web.png",
  mark: "/brand/logo-mark.png",
  mobile: "/brand/logo-mobile.png",
} as const;

export function BrandLogo({
  href = "/",
  variant = "web",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const plate =
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#141211] shadow-sm ring-1 ring-accent/20";

  const images =
    variant === "web" ? (
      <>
        <span className={`${plate} hidden p-1 sm:inline-flex`}>
          <Image
            src={SRC.web}
            alt=""
            width={148}
            height={148}
            priority={priority}
            className="h-12 w-12 object-contain sm:h-14 sm:w-14"
            aria-hidden
          />
        </span>
        <span className={`${plate} p-0.5 sm:hidden`}>
          <Image
            src={SRC.mobile}
            alt="Bez Zrna Rizika"
            width={36}
            height={36}
            priority={priority}
            className="h-9 w-9 object-contain"
          />
        </span>
      </>
    ) : (
      <span className={`${plate} p-0.5 ${className}`.trim()}>
        <Image
          src={SRC[variant]}
          alt="Bez Zrna Rizika"
          width={variant === "mark" ? 40 : 36}
          height={variant === "mark" ? 40 : 36}
          priority={priority}
          className={
            variant === "mark" ? "h-9 w-9 object-contain" : "h-8 w-8 object-contain"
          }
        />
      </span>
    );

  if (!href) return images;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/50"
      aria-label="Bez Zrna Rizika — početna"
    >
      {images}
    </Link>
  );
}
