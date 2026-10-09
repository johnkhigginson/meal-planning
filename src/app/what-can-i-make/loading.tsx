export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="space-y-2">
        <div className="h-11 w-72 max-w-full rounded-2xl bg-muted" />
        <div className="h-5 w-80 max-w-full rounded-2xl bg-muted" />
      </div>
      <div className="h-16 w-full rounded-2xl bg-muted sm:w-[28rem]" />
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
