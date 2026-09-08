# My Lemon Kitchen

A household meal planning app: keep your recipes, track what is actually in the
pantry, plan the week, and generate a grocery list from the gap between the two.
Cookbooks can be published as a public, login-free recipe blog.

Built with Next.js (App Router) and SQL Server.

## Features

**Recipes.** Full ingredient lists with quantities and units, notes, tags,
photos, print view, and servings scaling. Import from a URL (scraper), a photo,
or a document. Share a single recipe with a tokenized link.

**Pantry.** Track inventory per household with quantities and units. Parse a
receipt photo to add items in bulk.

**Meal plans.** Build a plan across dates, either from a recipe or as a
free-text meal with no recipe attached.

**Grocery lists.** Generate a list from a meal plan, subtracting what the pantry
already covers. Unit conversion is applied when comparing.

**What can I make.** Ranks recipes against current pantry contents so you can
see what is cookable now and what is one or two items short.

**Stores and prices.** Per-store price tracking, with optional Kroger API
lookups for product data and bulk pricing.

**Cookbooks.** Group recipes into books, add collaborators (including people in
other households), credit per-recipe authors, and invite people by email.

**Public blog.** Publish a cookbook to a login-free blog at `/blog/[slug]`, with
per-recipe pages, RSS, comments (bot-protected), and follower email
notifications. Includes an importer for migrating an existing Blogger or
Blogspot blog, from either the live JSON feed or an offline Atom XML export.

**Households.** A household is the ownership and control boundary. Members can
edit the household's recipes, pantry, plans, and books. Invite by email.

**Admin.** User management, impersonation (log in as a user for support), audit
logs, a shared recipe and store library, and the blog importer.

**AI assists.** Google Gemini powers photo recipe parsing, receipt scanning, and
ingredient extraction. Rate limited per user, per minute and per day, with a
per-user toggle.

## Stack

- Next.js 16.2.1, React 19, TypeScript
- Tailwind CSS v4, shadcn components on Base UI, lucide icons, sonner toasts
- Prisma 7 against SQL Server via `@prisma/adapter-mssql`
- NextAuth v5 (credentials provider, bcrypt password hashing)
- Postmark for transactional email
- Google Gemini via `@google/genai`
- Cloudflare Turnstile for signup and comment bot protection
- sharp for image processing, PWA manifest and service worker

## Requirements

- Node.js 20 or newer
- SQL Server (local instance or remote)
- npm

## Getting started

```bash
git clone https://github.com/johnkhigginson/meal-planning.git
cd meal-planning
npm install
cp .env.example .env
```

Fill in `.env` (see below), then set up the database:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Run the dev server:

```bash
npm run dev
```

The app is at http://localhost:3000. Register an account, which creates your
household, then invite anyone else who should share it.

## Environment variables

`DATABASE_URL` is used by the Prisma CLI for `db push` and `db seed`. The running
app connects through the mssql adapter using the individual `DB_*` values
instead, so both need to point at the same database.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | SQL Server connection string, used by the Prisma CLI |
| `DB_HOST` | yes | Database host for the app's mssql adapter |
| `DB_PORT` | yes | Database port (default 1433) |
| `DB_NAME` | yes | Database name |
| `DB_USER` | yes | Database user |
| `DB_PASSWORD` | yes | Database password |
| `AUTH_SECRET` | yes | NextAuth signing secret, also signs impersonation tokens |
| `AUTH_TRUST_HOST` | yes | Set `true` when running behind a reverse proxy |
| `NEXT_PUBLIC_SITE_URL` | no | Absolute base URL for SEO output (sitemap, RSS, Open Graph, JSON-LD) |
| `NEXT_PUBLIC_GA_ID` | no | Google Analytics 4 measurement ID; omit to disable analytics |
| `GEMINI_API_KEY` | no | Enables photo recipe parsing, receipt scanning, ingredient extraction |
| `AI_LIMIT_PER_MIN` | no | Per-user AI calls per minute (default 10) |
| `AI_LIMIT_PER_DAY` | no | Per-user AI calls per day (default 200) |
| `POSTMARK_API_KEY` | no | Enables invite, collaboration, and blog follower email |
| `KROGER_CLIENT_ID` | no | Kroger API client ID for product and price lookups |
| `KROGER_CLIENT_SECRET` | no | Kroger API client secret |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | no | Cloudflare Turnstile secret key |

Optional features degrade rather than crash when their keys are absent, except
the Kroger client, which throws if only one of its two values is set. Leaving
both Turnstile keys unset disables Turnstile; the honeypot field and email
normalization still apply.

Generate an `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Note that `.env.example` currently documents only a subset of these. The AI
limits, Postmark, and Kroger values are read by the code but are not yet listed
there.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate the Prisma client into `src/generated/prisma` |
| `npm run db:push` | Push the schema to the database |
| `npm run db:seed` | Seed units, unit conversions, and reference data |

There is also `prisma/migrate-tags.ts`, a one-off tag cleanup that runs as a dry
run by default. Set `APPLY=1` to commit it, and `JUNK_EXTRA="Label A,Label B"` to
drop additional labels.

## Project structure

```
src/
  app/            App Router routes, pages, and API handlers
    (auth)/       Login and register
    admin/        Admin dashboard, library, logs, blog importer
    api/          REST handlers
    blog/         Public login-free cookbook blog
  components/     UI, recipe, blog, and shared components
  lib/            Domain logic: matching, grocery, units, auth, AI, email
  middleware.ts   Auth gate and public route allowlist
prisma/
  schema.prisma   Data model
  seed.ts         Units and reference data
scripts/          Server setup and offline verification helpers
```

Public routes that bypass auth are allowlisted in `src/middleware.ts`: the
landing page, login, register, `/blog`, `/share/`, `/invite/`, and the API routes
those depend on. Those API routes authorize themselves, with public reads, and
writes that check the session and return 401 on their own.

## Data model

Roughly 30 Prisma models. The core chain is Household owning Users, Recipes,
InventoryItems, MealPlans, GroceryLists, Stores, and RecipeBooks. Recipes join to
Ingredients through RecipeIngredient with a Unit, and Units convert through
UnitConversion, which is what lets the grocery list compare a recipe's needs
against what the pantry holds. RecipeBook plus RecipeBookEntry,
RecipeBookCollaborator, CookbookInvite, BlogSubscriber, and Comment cover
cookbooks and the public blog.

## Deployment

`.github/workflows/deploy.yml` deploys on every push to `main`. It rsyncs the
source to an Ubuntu server over SSH, then runs `npm ci`, `prisma generate`,
`prisma db push`, and `npm run build`, and restarts the app under pm2 on port
3003. A reverse proxy (Caddy) fronts it.

Required repository secrets:

- `SSH_PRIVATE_KEY`
- `SSH_USER`
- `SSH_PORT` (optional, defaults to 22)

`scripts/server-setup.sh` provisions a fresh box: nvm, Node 20, pm2, pm2 startup,
and the app directory. Run it once.

Because `NEXT_PUBLIC_*` values are inlined at build time and the build happens on
the server, changing one in `.env` requires a redeploy to take effect.

## Implementation notes

- Slug uniqueness is enforced in application code rather than a database unique
  index, because SQL Server permits only a single NULL per unique index.
- Recipes imported from Blogger keep their original HTML in `bodyHtml`, so
  nothing from the source post is lost. It is sanitized on render.
- Impersonation uses short-lived HMAC-signed tokens carrying a random `jti` that
  is consumed on redemption, so a captured token cannot be replayed within its
  TTL. Only the admin-gated endpoint mints them.
- Outbound URL fetching (recipe scraping, blog import) goes through
  `src/lib/ssrf.ts`.
- See `AGENTS.md` before contributing. This project tracks a Next.js version
  whose APIs and conventions differ from older releases, so check the bundled
  docs in `node_modules/next/dist/docs/` rather than relying on memory.
