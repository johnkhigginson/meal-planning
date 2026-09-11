// Recipes are often split into sections: an ingredient list broken into "Pot
// Pie Filling" / "Cheddar Bay Biscuits", and steps grouped under their own
// headings. This module is the single place that knows how we represent that.
//
// Ingredients are structured rows, so each row carries its group in the
// `section` column (null = ungrouped). Instructions are one text blob, so their
// sections live in the text as heading lines. We write headings as
// `--- Name ---` and also read back a markdown-style `## Name`, which is what a
// person is most likely to type into the instructions box by hand.

export const SECTION_NAME_MAX = 100;

const DASH_HEADING = /^\s*-{3,}\s*(.+?)\s*-{3,}\s*$/;
const HASH_HEADING = /^\s*#{2,6}\s+(.+?)\s*$/;

// Tidy a scraped or hand-typed group name into what we store: no wrapping
// punctuation, no runaway length.
export function cleanSectionName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:：]$/, "")
    .trim();
  if (!name) return null;
  return name.slice(0, SECTION_NAME_MAX);
}

export function formatSectionHeading(name: string): string {
  return `--- ${name} ---`;
}

// Returns the section name when the line is a heading, else null.
export function parseSectionHeading(line: string): string | null {
  const match = line.match(DASH_HEADING) || line.match(HASH_HEADING);
  return match ? cleanSectionName(match[1]) : null;
}

export interface InstructionSection {
  name: string | null;
  // Section text exactly as stored, minus the heading line. Renderers keep
  // using `whitespace-pre-wrap`, so any numbering the source wrote is left
  // alone rather than being regenerated.
  body: string;
}

// Splits an instructions blob on its heading lines. A recipe with no headings
// comes back as a single unnamed section, so callers can render one way.
export function parseInstructionSections(instructions: string): InstructionSection[] {
  const sections: InstructionSection[] = [];
  let current: { name: string | null; lines: string[] } = { name: null, lines: [] };

  for (const line of (instructions || "").split(/\r?\n/)) {
    const heading = parseSectionHeading(line);
    if (heading) {
      if (current.name !== null || current.lines.some((l) => l.trim())) {
        sections.push({ name: current.name, body: current.lines.join("\n").trim() });
      }
      current = { name: heading, lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.name !== null || current.lines.some((l) => l.trim())) {
    sections.push({ name: current.name, body: current.lines.join("\n").trim() });
  }

  return sections.length > 0 ? sections : [{ name: null, body: "" }];
}

export function hasInstructionSections(instructions: string): boolean {
  return parseInstructionSections(instructions).some((s) => s.name !== null);
}

export interface SectionGroup<T> {
  name: string | null;
  items: T[];
}

// Folds rows into their display groups. Rows are normally already adjacent by
// sortOrder, but a group is keyed by name so a stray row that drifted away from
// its siblings still lands under the right heading instead of repeating it.
export function groupBySection<T extends { section?: string | null }>(rows: T[]): SectionGroup<T>[] {
  const groups: SectionGroup<T>[] = [];
  const byName = new Map<string, SectionGroup<T>>();

  for (const row of rows) {
    const name = cleanSectionName(row.section);
    if (name === null) {
      // Ungrouped rows keep their position: they open the list when they come
      // first, and otherwise sit in their own unnamed block.
      const last = groups[groups.length - 1];
      if (last && last.name === null) {
        last.items.push(row);
      } else {
        groups.push({ name: null, items: [row] });
      }
      continue;
    }

    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.items.push(row);
    } else {
      const group: SectionGroup<T> = { name, items: [row] };
      byName.set(key, group);
      groups.push(group);
    }
  }

  return groups;
}

export interface ImportedIngredient {
  text: string;
  section: string | null;
}

// Would this free-text line read as a group heading rather than an ingredient?
// Used only on imported lists (AI output, photo parsing), where a section is
// often returned as just another line: "For the topping:".
function headingFromLooseLine(line: string): string | null {
  const marker = parseSectionHeading(line);
  if (marker) return marker;

  const trimmed = line.trim();
  if (!trimmed.endsWith(":") || trimmed.length > 60) return null;
  // A real ingredient nearly always carries a number ("1 cup flour:"), so a
  // digit means this is a mangled ingredient, not a heading.
  if (/\d/.test(trimmed)) return null;
  return cleanSectionName(trimmed);
}

// Accepts what any of our importers produce: plain strings, `{ text, section }`
// objects, or a mix, with headings possibly inlined as their own line. Returns
// one flat list where every line carries the section it belongs to.
export function normalizeImportedIngredients(input: unknown): ImportedIngredient[] {
  if (!Array.isArray(input)) return [];

  const out: ImportedIngredient[] = [];
  let carried: string | null = null;

  for (const item of input) {
    if (typeof item === "string") {
      const heading = headingFromLooseLine(item);
      if (heading) {
        carried = heading;
        continue;
      }
      if (!item.trim()) continue;
      out.push({ text: item.trim(), section: carried });
      continue;
    }

    if (item && typeof item === "object") {
      const row = item as { text?: unknown; name?: unknown; section?: unknown; group?: unknown };
      const text = typeof row.text === "string" ? row.text : typeof row.name === "string" ? row.name : "";
      if (!text.trim()) continue;
      const section =
        cleanSectionName(typeof row.section === "string" ? row.section : typeof row.group === "string" ? row.group : null);
      // An explicit section on one row becomes the default for bare strings
      // that follow it, which is how a partially-structured AI reply reads.
      if (section !== null) carried = section;
      out.push({ text: text.trim(), section: section ?? carried });
    }
  }

  return out;
}
