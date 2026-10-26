// Splits a free-text instructions blob into numbered steps for Cook mode.
// Instructions arrive in many shapes: typed by hand ("1. Preheat..."),
// scraped as HTML lists, pasted as paragraphs, or one long run-on paragraph.
// Pure module: no DOM, so it runs on the server and in the browser alike.

import { parseInstructionSections } from "@/lib/recipe-sections";
import { cleanStepText, decodeEntities, stripMarkdownMarkers } from "@/lib/text-clean";

export interface CookStep {
  text: string;
  // Group heading the step sits under ("Pot Pie Filling"), or null.
  section: string | null;
}

// A leading step marker: "1." "1)" "(1)" "1:" "Step 1:" "Step 1 -" or a bullet.
// Bare numbers need trailing punctuation so "2 cups flour" is not a marker,
// and whitespace after it so "10.5 oz" is not one either.
const MARKER =
  /^\s*(?:step\s*\d+\s*[.):\-–]?|\(\d+\)|\d+\s*[.):]|[-*•‣◦▪·])(?:\s+|$)/i;

// Common abbreviations that end in a period but do not end a sentence.
const ABBREVIATIONS = /\b(?:approx|tsp|tbsp|tbs|oz|lb|lbs|pt|qt|gal|e\.g|i\.e|vs|no|deg|fl|pkg)\.$/i;

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "));
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripMarker(text: string): string {
  return clean(text.replace(MARKER, ""));
}

// A footnote marker on a word ("green onions*", "garlic**"), before a space,
// punctuation or the end of the text. "5 * 3" and "5*3" have no word right
// before the asterisk, so they stay.
const FOOTNOTE = /(?<=[\p{L}\p{N})\]])\*{1,2}(?=[\s.,;:!?)\]]|$)/gu;
// An asterisk that opens a word ("*very* hot") means the line uses emphasis,
// not footnotes, so it is left alone.
const OPENING_ASTERISK = /(?:^|\s)\*{1,2}[\p{L}\p{N}]/u;

// Recipe sites mark words that have a note further down the page ("Top with
// sliced green onions*"). The note isn't imported, so the marker means
// nothing here. Works line by line on a whole instructions blob.
export function stripFootnoteMarkers(text: string): string {
  return text
    .split("\n")
    .map((line) => (OPENING_ASTERISK.test(line) ? line : line.replace(FOOTNOTE, "")))
    .join("\n");
}

function looksLikeHtml(text: string): boolean {
  return /<\/?(?:p|li|ol|ul|br|div|h[1-6]|span|strong|em|b|i)\b[^>]*>/i.test(text);
}

// List items win when present. Otherwise every block element becomes its own
// paragraph and the plain-text rules take over.
function htmlToSteps(html: string): string[] {
  const withoutScripts = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const items = [...withoutScripts.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => stripMarker(stripTags(m[1])));
  if (items.some(Boolean)) return items.filter(Boolean);

  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|h[1-6]|ol|ul|section|article|blockquote)\b[^>]*>/gi, "\n\n");
  return textToSteps(stripTags(text));
}

function splitSentences(paragraph: string): string[] {
  const pieces = paragraph.split(/(?<=[.!?])\s+(?=["'(\p{Lu}\d])/u);
  const sentences: string[] = [];
  for (const piece of pieces) {
    const last = sentences[sentences.length - 1];
    if (last && ABBREVIATIONS.test(last)) {
      sentences[sentences.length - 1] = `${last} ${piece}`;
    } else {
      sentences.push(piece);
    }
  }
  return sentences.map(clean).filter(Boolean);
}

function textToSteps(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  // Numbered or bulleted lines: each marker starts a step, and unmarked lines
  // right below it are wrapped text of the same step. A blank line ends it.
  if (lines.some((line) => MARKER.test(line) && line.trim().length > 0)) {
    const steps: string[] = [];
    let current: string[] | null = null;
    for (const line of lines) {
      if (!line.trim()) {
        if (current) steps.push(current.join(" "));
        current = null;
      } else if (MARKER.test(line)) {
        if (current) steps.push(current.join(" "));
        current = [stripMarker(line)];
      } else if (current) {
        current.push(line.trim());
      } else {
        current = [line.trim()];
      }
    }
    if (current) steps.push(current.join(" "));
    return steps.map(clean).filter(Boolean);
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map(clean)
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  const nonEmpty = lines.map(clean).filter(Boolean);
  if (nonEmpty.length > 1) return nonEmpty;

  return paragraphs.length === 1 ? splitSentences(paragraphs[0]) : [];
}

// Splits one block of instructions into step texts with numbering removed.
// Entities and stray "**" or "__" are cleaned here too, so recipes stored
// before the importers cleaned them read properly.
export function parseSteps(instructions: string | null | undefined): string[] {
  const text = stripMarkdownMarkers(stripFootnoteMarkers(instructions || "")).trim();
  if (!text) return [];
  const steps = looksLikeHtml(text) ? htmlToSteps(text) : textToSteps(text);
  return steps.map(cleanStepText).map(clean).filter(Boolean);
}

// Section-aware version: `--- Name ---` heading lines become the section of
// the steps beneath them instead of steps of their own.
export function parseCookSteps(instructions: string | null | undefined): CookStep[] {
  return parseInstructionSections(instructions || "").flatMap((section) =>
    parseSteps(section.body).map((text) => ({ text, section: section.name }))
  );
}
