import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.locator('main').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
const data = await page.evaluate(() => {
  const main = document.querySelector('main');
  const cs = getComputedStyle(main);
  const mr = main.getBoundingClientRect();
  const logoWrap = main.firstElementChild; // flex div
  const lw = logoWrap.getBoundingClientRect();
  const img = main.querySelector('img');
  const ir = img ? img.getBoundingClientRect() : null;
  const ics = img ? getComputedStyle(img) : null;
  return {
    mainPadTop: cs.paddingTop, mainPadBottom: cs.paddingBottom, mainPadLeft: cs.paddingLeft,
    mainRect: { top: mr.top, height: mr.height },
    logoWrapRect: { top: lw.top, height: lw.height },
    imgRect: ir ? { top: ir.top, height: ir.height, width: ir.width } : null,
    imgCss: ics ? { height: ics.height, width: ics.width, maxWidth: ics.maxWidth } : null,
    imgNatural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
    gapMainTopToLogo: lw.top - mr.top,
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
