// Plain-text cleanup shared by every recipe importer and by display code.
// Pure module: no DOM, so it runs on the server and in the browser alike.
// Everything here returns plain text. Callers render it as a React text node
// (or JSON.stringify it), never as HTML, so "<script>" stays inert.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", deg: "°",
  frac12: "½", frac14: "¼", frac34: "¾",
  frac13: "⅓", frac23: "⅔", times: "×",
  eacute: "é", egrave: "è", agrave: "à", acirc: "â",
  ccedil: "ç", ntilde: "ñ", uuml: "ü", ouml: "ö",
  iacute: "í", oacute: "ó", aacute: "á", reg: "®",
  copy: "©", trade: "™", bull: "•",
};

// A code point past U+10FFFF (or a lone surrogate) makes String.fromCodePoint
// throw or produce junk, so an out-of-range entity is left as written.
function fromCodePoint(match: string, code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
  if (code >= 0xd800 && code <= 0xdfff) return match;
  return String.fromCodePoint(code);
}

function decodeOnce(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi, (m, hex, dec, name) => {
    if (hex) return fromCodePoint(m, parseInt(hex, 16));
    if (dec) return fromCodePoint(m, parseInt(dec, 10));
    return NAMED_ENTITIES[(name as string).toLowerCase()] ?? m;
  });
}

// Decodes named and numeric (decimal and hex) HTML entities to plain text.
// Double-encoded text ("don&amp;#39;t") takes a second pass. No more than two,
// so a deliberate "&amp;amp;" is not eaten down to "&".
export function decodeEntities(text: string | null | undefined): string {
  if (!text) return "";
  return decodeOnce(decodeOnce(text));
}

// Stray markdown emphasis that leaked in from an AI or a pasted page: "**" and
// a lone "__" ("Stir **well**", "__Serve__"). Runs of three or more
// underscores are blanks ("Name: ____"), so they stay. A single "*" is left
// alone because it can be a footnote or a multiplication sign.
export function stripMarkdownMarkers(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\*\*/g, "").replace(/(?<!_)__(?!_)/g, "");
}

// Decode entities and drop stray markdown emphasis. For step text.
export function cleanStepText(text: string | null | undefined): string {
  return stripMarkdownMarkers(decodeEntities(text));
}

// The text fields of an imported recipe. Names and descriptions are decoded;
// instructions and notes also lose stray markdown. Other fields pass through.
export function cleanImportedRecipeText<
  T extends { name?: unknown; description?: unknown; instructions?: unknown; notes?: unknown },
>(recipe: T): T {
  const out: Record<string, unknown> = { ...recipe };
  for (const key of ["name", "description"] as const) {
    if (typeof out[key] === "string") out[key] = decodeEntities(out[key] as string);
  }
  for (const key of ["instructions", "notes"] as const) {
    if (typeof out[key] === "string") out[key] = cleanStepText(out[key] as string);
  }
  return out as T;
}
