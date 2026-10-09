export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-11 w-56 rounded-2xl bg-muted" />
          <div className="h-5 w-40 rounded-2xl bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-40 rounded-full bg-muted" />
          <div className="size-10 rounded-full bg-muted" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-24 rounded-full bg-muted" />
        <div className="h-10 w-24 rounded-full bg-muted" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-48 rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
