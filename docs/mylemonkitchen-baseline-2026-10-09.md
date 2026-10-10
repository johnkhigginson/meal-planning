# mylemonkitchen.com Lighthouse + axe baseline (live site, Oct 9 2026, pre-change)

| Page | Form | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| /blog | desktop | 100 | 93 | 100 | 100 | 0.6 s | 0 | 0 ms |
|  | failing: meta-viewport, unused-javascript, bf-cache, network-dependency-tree-insight, render-blocking-insight |||||||
| /blog/kimball-family-favorites | desktop | 100 | 94 | 73 | 92 | 0.6 s | 0 | 0 ms |
|  | failing: is-on-https, errors-in-console, meta-viewport, unused-javascript, inspector-issues, meta-description, bf-cache, image-delivery-insight, network-dependency-tree-insight, render-blocking-insight |||||||
| /blog/kimball-family-favorites/lemon-herb-chicken | desktop | 100 | 94 | 100 | 91 | 0.6 s | 0 | 0 ms |
|  | failing: meta-viewport, unused-javascript, meta-description, bf-cache, network-dependency-tree-insight, render-blocking-insight |||||||
| /blog/kimball-family-favorites/lemon-herb-chicken | mobile | 78 | 94 | 100 | 91 | 5.3 s | 0 | 150 ms |
|  | failing: largest-contentful-paint, interactive, meta-viewport, unused-javascript, meta-description, bf-cache, network-dependency-tree-insight, render-blocking-insight |||||||
| /blog/kimball-family-favorites | mobile | 65 | 94 | 73 | 92 | 5.9 s | 0 | 240 ms |
|  | failing: is-on-https, first-contentful-paint, largest-contentful-paint, speed-index, total-blocking-time, errors-in-console, interactive, meta-viewport, unused-javascript, inspector-issues, meta-description, bf-cache |||||||
| /blog | mobile | 98 | 93 | 100 | 100 | 2.2 s | 0 | 120 ms |
|  | failing: interactive, meta-viewport, unused-javascript, bf-cache, network-dependency-tree-insight, render-blocking-insight |||||||
| /login | desktop | 100 | 94 | 100 | 100 | 0.6 s | 0.002 | 0 ms |
|  | failing: meta-viewport, unused-javascript, cache-insight, network-dependency-tree-insight, render-blocking-insight |||||||
| /login | mobile | 66 | 94 | 100 | 100 | 8.9 s | 0 | 140 ms |
|  | failing: first-contentful-paint, largest-contentful-paint, speed-index, interactive, meta-viewport, unused-javascript, cache-insight, forced-reflow-insight, network-dependency-tree-insight, render-blocking-insight |||||||
| /register | desktop | 100 | 94 | 100 | 100 | 0.6 s | 0.002 | 10 ms |
|  | failing: meta-viewport, unused-javascript, cache-insight, forced-reflow-insight, network-dependency-tree-insight, render-blocking-insight |||||||
| /register | mobile | 64 | 94 | 100 | 100 | 8.7 s | 0 | 130 ms |
|  | failing: first-contentful-paint, largest-contentful-paint, speed-index, interactive, meta-viewport, unused-javascript, cache-insight, network-dependency-tree-insight, render-blocking-insight |||||||
| / | desktop | 100 | 92 | 100 | 100 | 0.5 s | 0 | 0 ms |
|  | failing: landmark-one-main, meta-viewport, unused-javascript, bf-cache, network-dependency-tree-insight, render-blocking-insight |||||||
| / | mobile | 98 | 92 | 100 | 100 | 2.1 s | 0 | 120 ms |
|  | failing: interactive, landmark-one-main, meta-viewport, unused-javascript, bf-cache, network-dependency-tree-insight, render-blocking-insight |||||||

## axe-core (WCAG 2.1 A/AA + best practice)
- https://mylemonkitchen.com/blog: meta-viewport (moderate, 1)
- https://mylemonkitchen.com/blog/kimball-family-favorites: meta-viewport (moderate, 1)
- https://mylemonkitchen.com/blog/kimball-family-favorites/lemon-herb-chicken: meta-viewport (moderate, 1)
- https://mylemonkitchen.com/login: meta-viewport (moderate, 1)
- https://mylemonkitchen.com/register: meta-viewport (moderate, 1)
- https://mylemonkitchen.com/: landmark-one-main (moderate, 1), meta-viewport (moderate, 1), region (moderate, 5)
