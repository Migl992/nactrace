#!/usr/bin/env node
/* global document */ // the page.evaluate / waitForFunction callbacks below run inside the browser
// Real-browser check of the widget (Playwright + Chromium). Loads a page that embeds the widget,
// waits for every widget to finish, and fails on any failed request, console error or widget
// error state. Not part of the unit suite (needs a browser download); run with `pnpm e2e:browser`.
//
//   node scripts/e2e-browser.mjs                                   # local demo on http://localhost:5173/demo/
//   node scripts/e2e-browser.mjs https://migl992.github.io/nactrace/?hash=0x…&network=previewnet
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/demo/";
const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console error: ${m.text().slice(0, 200)}`);
});
page.on("requestfailed", (r) =>
  problems.push(
    `request failed: ${r.method()} ${r.url().slice(0, 120)} (${r.failure()?.errorText})`,
  ),
);
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("favicon"))
    problems.push(`HTTP ${r.status()}: ${r.url().slice(0, 120)}`);
});

await page.goto(url, { waitUntil: "load", timeout: 60000 });
// Every widget host ends in one of: .nt-pill (trace rendered) or .nt-error.
await page.waitForFunction(
  () => {
    const hosts = [...document.querySelectorAll(".nactrace-widget, #custom, #out > div")].filter(
      (h) => h.shadowRoot,
    );
    return (
      hosts.length > 0 && hosts.every((h) => h.shadowRoot.querySelector(".nt-pill, .nt-error"))
    );
  },
  { timeout: 45000 },
);
const results = await page.evaluate(() =>
  [...document.querySelectorAll(".nactrace-widget, #custom, #out > div")]
    .filter((h) => h.shadowRoot)
    .map((h) => {
      const r = h.shadowRoot;
      return {
        pill: r.querySelector(".nt-pill")?.textContent ?? null,
        error: r.querySelector(".nt-error")?.textContent ?? null,
        why: r.querySelector(".nt-why")?.textContent?.slice(0, 140) ?? null,
        legs: r.querySelectorAll(".nt-tl li").length,
      };
    }),
);
await browser.close();

for (const r of results) {
  console.log(
    r.error ? `ERROR  ${r.error}` : `ok     ${r.pill.padEnd(18)} ${r.legs} row(s)  ${r.why}`,
  );
  if (r.error) problems.push(`widget error state: ${r.error}`);
}
for (const p of problems) console.log("PROBLEM", p);
console.log(`\n${results.length} widget(s), ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
