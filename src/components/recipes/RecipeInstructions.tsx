import { stripFootnoteMarkers } from "@/lib/parse-steps";
import { parseInstructionSections } from "@/lib/recipe-sections";
import { cleanStepText } from "@/lib/text-clean";

// Instructions are stored as one text blob, with `--- Section ---` heading lines
// when the source recipe grouped its steps ("Pot Pie Filling", "Bake Pot Pie").
// Render those headings as headings instead of showing the raw markers.
// Recipes imported before footnote markers, entities and stray "**" were
// cleaned on import are cleaned here. All of it renders as text.
export function RecipeInstructions({ text }: { text: string }) {
  const sections = parseInstructionSections(cleanStepText(stripFootnoteMarkers(text)));

  if (sections.length === 1 && sections[0].name === null) {
    return <div className="whitespace-pre-wrap">{sections[0].body}</div>;
  }

  return (
    <div className="space-y-5">
      {sections.map((section, i) => (
        <div key={i}>
          {section.name && (
            <h3 className="mb-2 font-heading text-xl font-semibold">{section.name}</h3>
          )}
          <div className="whitespace-pre-wrap">{section.body}</div>
        </div>
      ))}
    </div>
  );
}
