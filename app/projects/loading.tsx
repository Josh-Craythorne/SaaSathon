export default function Loading() {
  return (
    <main id="main" className="workspace" aria-busy="true">
      <p className="eyebrow">Loading your workspace…</p>
      <div className="mt-8 h-36 animate-pulse rounded-2xl bg-off-white" />
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-off-white" />
        <div className="h-64 animate-pulse rounded-2xl bg-off-white" />
      </div>
    </main>
  );
}
