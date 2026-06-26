import { chromium } from '@playwright/test';
const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.locator('main').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
const d = await page.evaluate(() => {
  const m = document.querySelector('main');
  const cs = getComputedStyle(m);
  // find any stylesheet rule defining .pt-10 / .px-10
  let found = [];
  for (const ss of document.styleSheets) {
    try { for (const r of ss.cssRules) {
      if (r.selectorText && /\.(px-10|pt-10|pb-3|p-10)\b/.test(r.selectorText)) found.push(r.selectorText + ' { ' + r.style.cssText + ' }');
    }} catch {}
  }
  return { padTop: cs.paddingTop, padBottom: cs.paddingBottom, padLeft: cs.paddingLeft, className: m.className, rulesFound: found.slice(0,8) };
});
console.log(url); console.log(JSON.stringify(d, null, 2));
await browser.close();
