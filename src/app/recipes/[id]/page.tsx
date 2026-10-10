import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Heart, BookOpen, Globe, UserRound } from "lucide-react";
import { DeleteRecipeButton } from "@/components/recipes/DeleteRecipeButton";
import { ShareRecipeButton } from "@/components/recipes/ShareRecipeButton";
import { RecipeNotes } from "@/components/recipes/RecipeNotes";
import { ScalableIngredients } from "@/components/recipes/ScalableIngredients";
import { RecipeInstructions } from "@/components/recipes/RecipeInstructions";
import { PrintButton } from "@/components/recipes/PrintButton";
import { sanitizeBlogHtml } from "@/lib/sanitize";
import { convertQuantity } from "@/lib/units";
import { PROSE_CLASS } from "@/components/blog/BlogShell";

interface PageProps {
  params: Promise<{ id: string }>;
}

// 15 -> "15 min", 60 -> "1 hr", 75 -> "1 hr 15 min"
function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const householdId = user.householdId;
  const { id } = await params;
  const recipe = await prisma.recipe.findFirst({
    where: { id: parseInt(id, 10), householdId },
    include: {
      ingredients: {
        include: { ingredient: true, unit: true },
        orderBy: { sortOrder: "asc" },
      },
      tags: { include: { tag: true } },
      notes: { orderBy: { createdAt: "desc" } },
      author: { select: { name: true } },
    },
  });

  if (!recipe) notFound();

  // Authorship is only meaningful in a shared household. Pantry markers only
  // show for households that keep a pantry, so non-users don't see "0 of 9".
  const ingredientIds = recipe.ingredients.map((ri) => ri.ingredientId);
  const [memberCount, pantryCount, stockItems] = await Promise.all([
    prisma.user.count({ where: { householdId } }),
    prisma.inventoryItem.count({ where: { householdId } }),
    ingredientIds.length > 0
      ? prisma.inventoryItem.findMany({
          where: { householdId, ingredientId: { in: ingredientIds } },
          select: { ingredientId: true, quantity: true, unitId: true },
        })
      : Promise.resolve([]),
  ]);
  const conversions = stockItems.length > 0 ? await prisma.unitConversion.findMany() : [];
  const stockById = new Map(stockItems.map((s) => [s.ingredientId, s]));

  // Same conversion rule as lib/matching.ts (What Can I Make?).
  function stockFor(ingredientId: number, unitId: number): number | "present" | null | undefined {
    if (pantryCount === 0) return undefined;
    const inv = stockById.get(ingredientId);
    if (!inv) return null;
    const converted = convertQuantity(inv.quantity, inv.unitId, unitId, conversions);
    if (converted !== null) return converted;
    return inv.quantity > 0 ? "present" : null;
  }

  const meta = [
    recipe.prepTimeMinutes ? { label: "Prep", value: formatMinutes(recipe.prepTimeMinutes) } : null,
    recipe.cookTimeMinutes ? { label: "Cook", value: formatMinutes(recipe.cookTimeMinutes) } : null,
    { label: "Serves", value: String(recipe.servings) },
  ].filter((m): m is { label: string; value: string } => m !== null);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_28rem] space-y-3">
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map(({ tag }) => (
                <Badge key={tag.id} variant="tag" className="h-6 px-2.5 text-[13px]">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-start gap-3">
            <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.04] font-medium tracking-[-0.025em] text-balance">
              {recipe.name}
            </h1>
            {recipe.isFavorite && (
              <Heart className="mt-3 h-6 w-6 shrink-0 fill-red-600 text-red-600" aria-label="Favorite" />
            )}
          </div>
          {recipe.description && (
            <p className="max-w-[40em] text-lg leading-relaxed text-muted-foreground">{recipe.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton />
          <ShareRecipeButton recipeId={recipe.id} />
          <Link href={`/recipes/${recipe.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <DeleteRecipeButton recipeId={recipe.id} />
        </div>
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <dl className="flex overflow-hidden rounded-2xl border bg-card">
          {meta.map((m, i) => (
            <div key={m.label} className={i > 0 ? "border-l px-5 py-3" : "px-5 py-3"}>
              <dt className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{m.label}</dt>
              <dd className="mt-0.5 font-heading text-2xl">{m.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-4 text-sm">
        {((memberCount > 1 && recipe.author?.name) || recipe.authorName) && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <UserRound className="h-4 w-4" />
            {recipe.author?.name ?? recipe.authorName}
          </span>
        )}
        {(recipe.sourceType === "WEBSITE" || recipe.sourceType === "BLOG") && recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <Globe className="h-4 w-4" />
            Source
          </a>
        )}
        {recipe.sourceType === "BOOK" && recipe.sourceBookTitle && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            {recipe.sourceBookTitle}
            {recipe.sourceBookPage && `, p. ${recipe.sourceBookPage}`}
          </span>
        )}
        </div>
      </div>

      {/* Photo */}
      {recipe.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.imageUrl}
          alt={recipe.name}
          className="max-h-[28rem] w-full rounded-[1.75rem] object-cover"
        />
      )}

      {/* Ingredients beside the method on wide screens; stacked below lg. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
        {/* Ingredients (hidden when none have been added yet), scalable by servings */}
        {recipe.ingredients.length > 0 && (
          <ScalableIngredients
            recipeId={recipe.id}
            baseServings={recipe.servings}
            ingredients={recipe.ingredients.map((ri) => ({
              quantity: ri.quantity,
              unit: ri.unit.abbreviation,
              name: ri.ingredient.name,
              notes: ri.notes,
              optional: ri.optional,
              section: ri.section,
              stock: stockFor(ri.ingredientId, ri.unitId),
            }))}
          />
        )}

        {/* For migrated blog posts, render the full preserved post so no content
            is lost. Otherwise show the structured instructions. */}
        <section
          aria-labelledby="method-heading"
          className={recipe.ingredients.length === 0 ? "min-w-0 lg:col-span-2" : "min-w-0"}
        >
          <h2 id="method-heading" className="mb-4 font-heading text-2xl font-semibold">
            {recipe.bodyHtml ? "Recipe" : "Method"}
          </h2>
          {recipe.bodyHtml ? (
            <div className={PROSE_CLASS} dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(recipe.bodyHtml) }} />
          ) : (
            <div className="text-[17px] leading-relaxed">
              <RecipeInstructions text={recipe.instructions} />
            </div>
          )}
        </section>
      </div>

      {/* Notes */}
      {recipe.notes.length > 0 && (
        <RecipeNotes
          recipeId={recipe.id}
          readOnly
          initialNotes={recipe.notes.map((n) => ({
            id: n.id,
            body: n.body,
            createdByName: n.createdByName,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
