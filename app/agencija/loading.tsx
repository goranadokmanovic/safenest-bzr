export default function AgencijaLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy aria-label="Učitavanje">
      <div className="h-3 w-24 rounded bg-ink/10" />
      <div className="h-10 w-64 max-w-full rounded-xl bg-ink/10" />
      <div className="h-4 w-full max-w-md rounded bg-ink/10" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-2xl bg-ink/[0.06]" />
        <div className="h-28 rounded-2xl bg-ink/[0.06]" />
      </div>
      <div className="h-48 rounded-2xl bg-ink/[0.06]" />
    </div>
  );
}
