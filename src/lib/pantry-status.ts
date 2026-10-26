// How the pantry banner on a recipe reads: green only when everything the
// recipe needs is on hand, so "0 of 8 in your pantry" never looks like a win.
export type PantryStatus = "all" | "some" | "none";

export function pantryStatus(met: number, total: number): PantryStatus {
  if (total > 0 && met >= total) return "all";
  return met > 0 ? "some" : "none";
}
