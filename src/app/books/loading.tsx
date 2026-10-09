export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true" aria-label="Loading recipe books">
      <div className="space-y-2">
        <div className="h-10 w-56 rounded-2xl bg-muted" />
        <div className="h-5 w-72 max-w-full rounded-2xl bg-muted" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="h-10 rounded-2xl bg-muted sm:w-80" />
        <div className="h-11 w-36 rounded-full bg-muted" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-3">
            <div className="aspect-[5/3] rounded-xl bg-muted" />
            <div className="mt-3 h-6 w-24 rounded-2xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
