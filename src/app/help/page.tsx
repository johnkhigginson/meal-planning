import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  UtensilsCrossed,
  Globe,
  Camera,
  FileText,
  BookOpen,
  Share2,
  MessageCircle,
  LayoutDashboard,
  Users,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Help & getting started" };

interface Step {
  title: string;
  done: boolean;
  href: string;
  cta: string;
  detail: string;
}

export default async function HelpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const householdId = user.householdId;

  const [recipeCount, importedCount, bookCount, publishedCount, memberCount] = await Promise.all([
    prisma.recipe.count({ where: { householdId } }),
    prisma.recipe.count({ where: { householdId, sourceType: { in: ["WEBSITE", "BLOG"] } } }),
    prisma.recipeBook.count({ where: { householdId } }),
    prisma.recipeBook.count({ where: { householdId, isPublished: true } }),
    prisma.user.count({ where: { householdId } }),
  ]);

  const steps: Step[] = [
    {
      title: "Add your first recipe",
      done: recipeCount > 0,
      href: "/recipes/new",
      cta: "Add a recipe",
      detail: "Type it in, paste a website link to auto-fill it, or snap a photo of a cookbook page.",
    },
    {
      title: "Import a recipe from the web",
      done: importedCount > 0,
      href: "/recipes/new",
      cta: "Try importing",
      detail: "On the new-recipe page choose “Website”, paste a URL, and click Import.",
    },
    {
      title: "Create a cookbook",
      done: bookCount > 0,
      href: "/books",
      cta: "Create a cookbook",
      detail: "Group recipes into a cookbook you can share or publish.",
    },
    {
      title: "Publish your cookbook as a blog",
      done: publishedCount > 0,
      href: "/books",
      cta: "Publish a cookbook",
      detail: "Open a cookbook and hit Publish to put it online at /blog — no login needed for visitors.",
    },
    {
      title: "Invite family",
      done: memberCount > 1,
      href: "/settings",
      cta: "Invite someone",
      detail: "Add people to your household so they can contribute recipes.",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl leading-tight font-medium">Help &amp; getting started</h1>
        <p className="text-muted-foreground">
          A quick tour of how to add recipes, build cookbooks, and publish your blog.
        </p>
      </div>

      {/* Live checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-xl">
            <span>Your setup checklist</span>
            <span className="font-sans text-sm font-bold text-muted-foreground">
              <span className="font-heading text-base text-foreground tabular-nums">
                {doneCount} / {steps.length}
              </span>{" "}
              done
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step) => (
            <div
              key={step.title}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${step.done ? "bg-leaf-soft/60" : "bg-card"}`}
            >
              <div className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-ink" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-input" aria-label="Not done yet" />
                )}
                <div>
                  <p className={`text-sm font-bold ${step.done ? "text-muted-foreground line-through" : ""}`}>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
                </div>
              </div>
              {!step.done && (
                <Link
                  href={step.href}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-border bg-card px-4 text-sm font-bold transition-[transform,background-color] duration-200 ease-out hover:-translate-y-px hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring sm:self-auto"
                >
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <UtensilsCrossed className="h-4 w-4 text-primary" /> Adding a recipe
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>On the <Link href="/recipes/new" className="text-primary underline">New Recipe</Link> page you can add a recipe four ways — pick a Source at the top:</p>
          <ul className="space-y-2">
            <li className="flex gap-2"><UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="text-foreground">Personal</strong> — type the name, ingredients, and steps yourself.</span></li>
            <li className="flex gap-2"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="text-foreground">Website</strong> — paste a recipe URL and click <em>Import</em> to auto-fill the name, photo, ingredients, and steps.</span></li>
            <li className="flex gap-2"><Camera className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="text-foreground">Cookbook / photo</strong> — snap or upload a photo of a recipe and it&apos;s read automatically.</span></li>
            <li className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="text-foreground">Document import</strong> — from the Recipes page, upload a document with one or more recipes.</span></li>
          </ul>
          <p>Add a <strong className="text-foreground">photo</strong> by pasting an image link in the Photo field — it shows on the recipe and your blog. You can also set the recipe&apos;s <strong className="text-foreground">author</strong> (any household member).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-4 w-4 text-primary" /> Cookbooks &amp; publishing your blog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Create a <Link href="/books" className="text-primary underline">cookbook</Link>, add recipes to it, then open it and press <strong className="text-foreground">Publish</strong>.</p>
          <p>Published cookbooks appear at a public address like <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground">/blog/your-cookbook</code> that anyone can read without logging in. Visitors can leave <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> comments</span>, and you can delete any comment while signed in.</p>
          <p>Prefer to share privately? Use <span className="inline-flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Share</span> on a recipe or cookbook for a private link.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LayoutDashboard className="h-4 w-4 text-primary" /> Make the app your own
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Not using meal planning, the pantry, or stores? Hide them: go to <Link href="/settings" className="text-primary underline">Settings → Menu</Link> and turn off any sections you don&apos;t need. Recipes and Cookbooks always stay.</p>
          <p className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Invite family from Settings so everyone can add recipes to your shared collection.</p>
        </CardContent>
      </Card>
    </div>
  );
}
