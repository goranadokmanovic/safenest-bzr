export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy aria-label="Učitavanje">
      <div className="h-3 w-28 rounded bg-ink/10" />
      <div className="h-10 w-72 max-w-full rounded-xl bg-ink/10" />
      <div className="h-36 rounded-2xl bg-ink/[0.06]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-24 rounded-2xl bg-ink/[0.06]" />
        <div className="h-24 rounded-2xl bg-ink/[0.06]" />
      </div>
    </div>
  );
}
