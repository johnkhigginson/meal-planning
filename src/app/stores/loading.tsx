export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true" aria-label="Loading stores">
      <div className="space-y-2">
        <div className="h-10 w-40 rounded-2xl bg-muted" />
        <div className="h-5 w-80 max-w-full rounded-2xl bg-muted" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="h-10 rounded-2xl bg-muted sm:w-64" />
        <div className="h-11 w-36 rounded-full bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[4.5rem] rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
