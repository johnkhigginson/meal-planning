import { parseInstructionSections } from "@/lib/recipe-sections";

// Instructions are stored as one text blob, with `--- Section ---` heading lines
// when the source recipe grouped its steps ("Pot Pie Filling", "Bake Pot Pie").
// Render those headings as headings instead of showing the raw markers.
export function RecipeInstructions({ text }: { text: string }) {
  const sections = parseInstructionSections(text);

  if (sections.length === 1 && sections[0].name === null) {
    return <div className="whitespace-pre-wrap">{sections[0].body}</div>;
  }

  return (
    <div className="space-y-5">
      {sections.map((section, i) => (
        <div key={i}>
          {section.name && (
            <h3 className="mb-1.5 font-semibold tracking-tight">{section.name}</h3>
          )}
          <div className="whitespace-pre-wrap">{section.body}</div>
        </div>
      ))}
    </div>
  );
}
