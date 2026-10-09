// Shared by every /recipes route, so the shapes stay generic: a title block,
// a meta strip, and one large panel. The server-rendered recipe page is the
// route that shows this most.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="h-11 w-2/3 max-w-md rounded-2xl bg-muted" />
        <div className="h-5 w-full max-w-lg rounded-2xl bg-muted" />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="h-16 w-64 rounded-2xl bg-muted" />
        <div className="h-9 w-24 self-center rounded-full bg-muted" />
        <div className="h-9 w-24 self-center rounded-full bg-muted" />
      </div>
      <div className="h-72 w-full rounded-3xl bg-muted" />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="h-40 rounded-2xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
