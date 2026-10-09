export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true" aria-label="Loading cookbook">
      <div className="space-y-4">
        <div className="h-5 w-32 rounded-2xl bg-muted" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="h-10 w-64 rounded-2xl bg-muted" />
            <div className="h-5 w-80 max-w-full rounded-2xl bg-muted" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-10 w-28 rounded-full bg-muted" />
            ))}
          </div>
        </div>
      </div>
      <div className="h-40 rounded-2xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border bg-card">
            <div className="aspect-[4/3] bg-muted" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-3/4 rounded-2xl bg-muted" />
              <div className="h-4 w-1/2 rounded-2xl bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
