import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://localhost:5175/';
const out = process.argv[3] || 'login.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.locator('main').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
const main = page.locator('main').first();
await main.screenshot({ path: out.replace('.png', '-card.png') }).catch(() => {});
await page.screenshot({ path: out, fullPage: false });
console.log('shot done');
await browser.close();
