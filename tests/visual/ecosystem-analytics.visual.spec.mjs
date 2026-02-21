import { test, expect } from '@playwright/test';

async function disableAnimations(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `
  });
}

async function gotoAnalytics(page) {
  // Stabilize the prototype's very short loading-step timeouts so screenshots don't miss intermediate labels.
  // This runs before app code executes.
  await page.addInitScript(() => {
    // @ts-ignore
    if (window.__pwTimeoutScaleApplied) return;
    // @ts-ignore
    window.__pwTimeoutScaleApplied = true;

    const scale = 4;
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = (handler, timeout, ...args) => {
      const scaled = typeof timeout === 'number' ? timeout * scale : timeout;
      // @ts-ignore
      return originalSetTimeout(handler, scaled, ...args);
    };
  });

  // Works with either an external app (BASE_URL) or the local prototype (USE_PROTOTYPE).
  await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Ecosystem Analytics' }).waitFor();
}

function requireBaseUrl() {
  // If neither BASE_URL nor USE_PROTOTYPE is set, Playwright has no target.
  // Keep the test suite informative rather than failing cryptically.
  const hasBaseUrl = !!process.env.BASE_URL;
  const usePrototype = process.env.USE_PROTOTYPE === '1';
  return hasBaseUrl || usePrototype;
}

test.describe('Ecosystem Analytics (visual regression)', () => {
  test('login - default', async ({ page }) => {
    test.skip(!requireBaseUrl(), 'Set BASE_URL or run with USE_PROTOTYPE=1');

    await gotoAnalytics(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('analytics-login-default.png', { fullPage: true });
  });

  test('login - authenticating', async ({ page }) => {
    test.skip(!requireBaseUrl(), 'Set BASE_URL or run with USE_PROTOTYPE=1');

    await gotoAnalytics(page);
    await disableAnimations(page);

    await page.getByRole('button', { name: /sign in with alkemio/i }).click();
    await page.getByText('Authenticating...').waitFor();

    await expect(page).toHaveScreenshot('analytics-login-authenticating.png', { fullPage: true });
  });

  test('space selection - default + empty search', async ({ page }) => {
    test.skip(!requireBaseUrl(), 'Set BASE_URL or run with USE_PROTOTYPE=1');

    await gotoAnalytics(page);
    await disableAnimations(page);

    // Move through the simulated login.
    await page.getByRole('button', { name: /sign in with alkemio/i }).click();
    await page.getByRole('heading', { name: 'Select Top-Level Spaces' }).waitFor();

    await expect(page).toHaveScreenshot('analytics-space-selector-default.png', { fullPage: true });

    const search = page.getByPlaceholder('Search spaces...');
    await search.fill('zzzz-no-results');
    await page.getByText(/No spaces found matching/i).waitFor();

    await expect(page).toHaveScreenshot('analytics-space-selector-empty-search.png', { fullPage: true });
  });

  test('explorer - base + drawer + map overlay + loading steps', async ({ page }) => {
    test.skip(!requireBaseUrl(), 'Set BASE_URL or run with USE_PROTOTYPE=1');

    test.setTimeout(180_000);

    await gotoAnalytics(page);
    await disableAnimations(page);

    // Login -> selection
    await page.getByRole('button', { name: /sign in with alkemio/i }).click();
    await page.getByRole('heading', { name: 'Select Top-Level Spaces' }).waitFor();

    // Select and generate graph
    await page.getByRole('button', { name: /select all/i }).click();
    await page.getByRole('button', { name: /generate graph/i }).click();

    // Explorer
    await page.getByText('Portfolio Network').waitFor();

    await expect(page).toHaveScreenshot('analytics-explorer-base.png', { fullPage: true });

    // Try to open details drawer by clicking the first node element in the graph.
    // (The exported prototype does not provide stable accessibility hooks for nodes.)
    const firstNode = page
      .locator('div[style*="pointer-events: auto"]')
      .locator('div.absolute.z-10')
      .first();

    await firstNode.click({ timeout: 10_000 });
    await page.getByText('Direct Connections').waitFor({ timeout: 10_000 });

    await expect(page).toHaveScreenshot('analytics-explorer-drawer-open.png', { fullPage: true });

    // Enable map overlay (best-effort) without accidentally clicking the header back button.
    // We anchor on the actual "Map Overlay" heading and target its immediate row.
    const mapHeading = page.locator('h3:has-text("Map Overlay")').first();
    if (await mapHeading.count()) {
      const mapRow = mapHeading.locator('..');
      const mapSwitch = mapRow.locator('[role="switch"], button').last();

      if (await mapSwitch.count()) {
        await mapSwitch.click({ force: true });
        await expect(page).toHaveURL(/\/analytics/);

        const mapNotice = page.getByText(/Map view/i);
        if (await mapNotice.isVisible().catch(() => false)) {
          await expect(page).toHaveScreenshot('analytics-explorer-map-overlay.png', { fullPage: true });
        }
      }
    }

    const captureLoadingStep = async (label, delayMs, screenshotName) => {
      const refresh = page.getByTitle('Refresh Data');
      await refresh.waitFor({ state: 'visible', timeout: 10_000 });
      // The header re-renders during state changes; force-click to avoid flakiness from DOM detaches.
      await refresh.click({ force: true });
      if (delayMs > 0) await page.waitForTimeout(delayMs);
      await page.getByText(label).waitFor({ timeout: 10_000 });
      await expect(page).toHaveScreenshot(screenshotName, { fullPage: true });
      // The prototype clears the overlay after 1500ms (scaled by our init script). Give it time to finish.
      await page.waitForTimeout(7_000);
    };

    await captureLoadingStep('Acquiring Data', 0, 'analytics-loading-1-acquiring.png');
    await captureLoadingStep('Clustering Entities', 2_200, 'analytics-loading-2-clustering.png');
    await captureLoadingStep('Rendering Graph', 4_200, 'analytics-loading-3-rendering.png');
  });
});
