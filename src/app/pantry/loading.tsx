export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-11 w-40 rounded-2xl bg-muted" />
        <div className="flex gap-2">
          <div className="h-11 w-40 rounded-full bg-muted" />
          <div className="h-11 w-32 rounded-full bg-muted" />
        </div>
      </div>
      <div className="h-9 w-full rounded-2xl bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
