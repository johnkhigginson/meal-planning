// Mirrors the settings layout: a title, then stacked section cards. The
// settings page also shows this while it fetches, so the swap is seamless.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-40 rounded-2xl bg-muted" />
      <div className="h-80 w-full rounded-2xl bg-muted" />
      <div className="h-48 w-full rounded-2xl bg-muted" />
      <div className="h-56 w-full rounded-2xl bg-muted" />
      <div className="h-64 w-full rounded-2xl bg-muted" />
    </div>
  );
}
