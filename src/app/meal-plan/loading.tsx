export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading meal plan">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-10 w-56 rounded-2xl bg-muted" />
          <div className="h-5 w-64 rounded-2xl bg-muted" />
        </div>
        <div className="h-11 w-40 rounded-full bg-muted" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-10 w-40 rounded-full bg-muted" />
        <div className="h-10 w-80 max-w-full rounded-full bg-muted" />
      </div>
      <div className="hidden rounded-3xl border bg-card p-5 lg:block">
        <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-2">
          <div />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={`h${i}`} className="h-14 rounded-2xl bg-muted" />
          ))}
          {Array.from({ length: 3 }, (_, r) => (
            <div key={`r${r}`} className="contents">
              <div />
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="h-[90px] rounded-2xl bg-muted" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 lg:hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-48 rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
