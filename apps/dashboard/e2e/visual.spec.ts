import { test, expect } from '@playwright/test';

test.describe('HardKAS Visual Hardening', () => {

  test('corrupted artifact banner presence and layout', async ({ page }) => {
    // Navigate to artifacts list
    await page.goto('/artifacts');
    // We expect the dev-server and dashboard to be running with a pre-populated deterministic fixture
    // containing at least one corrupted artifact.
    await page.waitForSelector('text=Artifacts', { state: 'visible' });

    // Ensure the page has loaded its table/list
    await page.waitForTimeout(1000); 

    // Take snapshot of the artifacts page
    await expect(page).toHaveScreenshot('artifacts-corrupted-banner.png', { fullPage: true });
  });

  test('ReplayPage deterministic vs runtime-noise separation', async ({ page }) => {
    // Navigate to replay page
    await page.goto('/replay');
    await page.waitForSelector('text=Replay', { state: 'visible' });

    await page.waitForTimeout(1000);

    // Take snapshot of the replay page demonstrating the visual matrix
    await expect(page).toHaveScreenshot('replay-matrix-split.png', { fullPage: true });
  });

  test('ProvenanceGraph rendering', async ({ page }) => {
    // Navigate to transactions page, then to a detail page
    await page.goto('/transactions');
    await page.waitForSelector('text=Transactions', { state: 'visible' });
    
    // Attempt to click the first transaction link
    const firstTxLink = page.locator('a[href^="/transactions/"]').first();
    if (await firstTxLink.isVisible()) {
      await firstTxLink.click();
      
      // Wait for the Provenance Graph section
      await page.waitForSelector('text=Provenance', { state: 'visible' });
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot('provenance-graph-render.png', { fullPage: true });
    } else {
      // Fallback if no transactions exist in the fixture, try artifacts
      await page.goto('/artifacts');
      const firstArtifactLink = page.locator('a[href^="/artifacts/"]').first();
      if (await firstArtifactLink.isVisible()) {
        await firstArtifactLink.click();
        await page.waitForSelector('text=Provenance', { state: 'visible' });
        await page.waitForTimeout(1000);
        await expect(page).toHaveScreenshot('provenance-graph-render.png', { fullPage: true });
      }
    }
  });

  test('StatusBadge stale popover', async ({ page }) => {
    // Navigate to transactions where StatusBadges are displayed
    await page.goto('/transactions');
    await page.waitForSelector('text=Transactions', { state: 'visible' });

    await page.waitForTimeout(1000);

    const staleBadge = page.locator('text=Stale State').first();
    if (await staleBadge.isVisible()) {
      await staleBadge.hover();
      // Wait for the popover to animate in
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot('status-badge-stale-popover.png');
    }
  });

  test('EventsPage correlation grouping', async ({ page }) => {
    // Navigate to events page
    await page.goto('/events');
    await page.waitForSelector('text=Correlation', { state: 'visible' });

    await page.waitForTimeout(1000);

    // Take snapshot
    await expect(page).toHaveScreenshot('events-correlation-grouping.png', { fullPage: true });
  });

});
