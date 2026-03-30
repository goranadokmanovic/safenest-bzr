const MAX_SLUG_LEN = 80;

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN);
  return s || "agencija";
}

export function uniqueSlugCandidate(base: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const trimmed = base.slice(0, MAX_SLUG_LEN - 9);
  return `${trimmed}-${suffix}`;
}
