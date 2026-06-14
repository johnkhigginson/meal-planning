// Offline checks for the Blogger import parsers (src/lib/blogger.ts, src/lib/slug.ts).
// No DB or network needed. Run: npx tsx scripts/verify-blogger.ts

import {
  parseBloggerJsonFeed,
  parseBloggerXmlExport,
  extractRecipeSections,
  upgradeBloggerImage,
  htmlToText,
  excerpt,
} from "../src/lib/blogger";
import { slugify, uniqueSlug } from "../src/lib/slug";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (!cond) { failures++; console.log(`  ✗ ${label}`, extra ?? ""); }
  else console.log(`  ✓ ${label}`);
}

// ── JSON feed fixture (Blogger ?alt=json shape) ──
console.log("JSON feed:");
const jsonFeed = {
  feed: {
    title: { $t: "The Recipe Society" },
    "openSearch$totalResults": { $t: "2" },
    entry: [
      {
        published: { $t: "2019-03-04T10:00:00.000-08:00" },
        title: { $t: "Grandma's Apple Pie" },
        content: { $t: `<div><img src="https://1.bp.blogspot.com/-x/AAA/s72-c/pie.jpg"/><p>Best pie ever.</p><b>Ingredients:</b><ul><li>3 apples</li><li>1 cup sugar</li></ul><b>Directions:</b><p>Mix and bake at 350.</p></div>` },
        link: [
          { rel: "self", href: "https://x/feeds/123" },
          { rel: "alternate", href: "https://therecipesociety.blogspot.com/2019/03/apple-pie.html" },
        ],
        category: [{ term: "Dessert" }, { term: "Pie" }],
        "media$thumbnail": { url: "https://1.bp.blogspot.com/-x/AAA/s72-c/pie.jpg" },
      },
      {
        published: { $t: "2020-01-01T10:00:00.000-08:00" },
        title: { $t: "Quick Salsa" },
        content: { $t: `<p>No image here. Just chop tomatoes.</p>` },
        link: [{ rel: "alternate", href: "https://therecipesociety.blogspot.com/2020/01/salsa.html" }],
        category: [{ term: "Appetizer" }],
      },
    ],
  },
};
const j = parseBloggerJsonFeed(jsonFeed);
check("blog title parsed", j.blogTitle === "The Recipe Society", j.blogTitle);
check("total parsed", j.total === 2, j.total);
check("2 posts", j.posts.length === 2, j.posts.length);
check("title", j.posts[0].title === "Grandma's Apple Pie");
check("permalink (alternate link)", j.posts[0].permalink === "https://therecipesociety.blogspot.com/2019/03/apple-pie.html", j.posts[0].permalink);
check("publishedAt is Date", j.posts[0].publishedAt instanceof Date);
check("labels", JSON.stringify(j.posts[0].labels) === JSON.stringify(["Dessert", "Pie"]));
check("thumbnail upgraded to s1600", j.posts[0].imageUrl === "https://1.bp.blogspot.com/-x/AAA/s1600/pie.jpg", j.posts[0].imageUrl);
check("post 2 image from <img> fallback = null (no img)", j.posts[1].imageUrl === null, j.posts[1].imageUrl);

// ── XML export fixture (Atom) ──
console.log("XML export:");
const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Recipe Society</title>
  <entry>
    <category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/blogger/2008/kind#post"/>
    <category scheme="http://www.blogger.com/atom/ns#" term="Dinner"/>
    <title type="text">Roast Chicken</title>
    <content type="html">&lt;p&gt;&lt;img src="https://2.bp.blogspot.com/-y/BBB/s400/chx.jpg"/&gt;Roast it.&lt;/p&gt;</content>
    <published>2018-05-05T09:00:00.000-07:00</published>
    <link rel="alternate" type="text/html" href="https://therecipesociety.blogspot.com/2018/05/roast-chicken.html"/>
  </entry>
  <entry>
    <category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/blogger/2008/kind#post"/>
    <app:control xmlns:app="http://purl.org/atom/app#"><app:draft>yes</app:draft></app:control>
    <title>Unfinished Draft</title>
    <content type="html">draft body</content>
  </entry>
  <entry>
    <category scheme="http://schemas.google.com/g/2005#kind" term="http://schemas.google.com/blogger/2008/kind#page"/>
    <title>About Page</title>
    <content type="html">about</content>
  </entry>
</feed>`;
const x = parseBloggerXmlExport(xml);
check("xml blog title", x.blogTitle === "The Recipe Society", x.blogTitle);
check("only the 1 published post (draft + page skipped)", x.posts.length === 1, x.posts.length);
check("xml title", x.posts[0]?.title === "Roast Chicken", x.posts[0]?.title);
check("xml permalink", x.posts[0]?.permalink === "https://therecipesociety.blogspot.com/2018/05/roast-chicken.html", x.posts[0]?.permalink);
check("xml label", JSON.stringify(x.posts[0]?.labels) === JSON.stringify(["Dinner"]));
check("xml image upgraded", x.posts[0]?.imageUrl === "https://2.bp.blogspot.com/-y/BBB/s1600/chx.jpg", x.posts[0]?.imageUrl);

// ── section extraction + helpers ──
console.log("Helpers:");
const sec = extractRecipeSections(j.posts[0].contentHtml);
check("ingredients pulled from <li>", sec.ingredients.length === 2 && sec.ingredients[0] === "3 apples", sec.ingredients);
check("instructions found after Directions:", sec.instructions.toLowerCase().includes("mix and bake"), sec.instructions);
check("htmlToText strips tags", !htmlToText(j.posts[0].contentHtml).includes("<"));
check("excerpt truncates", excerpt("a".repeat(400)).length <= 281);
check("upgradeBloggerImage null-safe", upgradeBloggerImage(null) === null);
check(
  "non-Blogger URL with =s### token is left untouched",
  upgradeBloggerImage("https://example.com/pic.jpg?x=s320") === "https://example.com/pic.jpg?x=s320",
  upgradeBloggerImage("https://example.com/pic.jpg?x=s320")
);
check(
  "googleusercontent thumbnail upgraded",
  upgradeBloggerImage("https://lh3.googleusercontent.com/abc=s220") === "https://lh3.googleusercontent.com/abc=s1600",
  upgradeBloggerImage("https://lh3.googleusercontent.com/abc=s220")
);

// ── slug ──
console.log("Slugs:");
check("slugify basic", slugify("Grandma's Apple Pie!") === "grandmas-apple-pie", slugify("Grandma's Apple Pie!"));
const taken = new Set<string>();
const s1 = uniqueSlug("Apple Pie", taken);
const s2 = uniqueSlug("Apple Pie", taken);
const s3 = uniqueSlug("Apple Pie", taken);
check("unique slug collision suffixes", s1 === "apple-pie" && s2 === "apple-pie-2" && s3 === "apple-pie-3", [s1, s2, s3]);
check("empty title falls back", uniqueSlug("！！！", new Set(), "recipe-1") === "recipe-1", uniqueSlug("！！！", new Set(), "recipe-1"));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);