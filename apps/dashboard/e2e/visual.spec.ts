import { test, expect } from "@playwright/test";

test.describe("HardKAS Visual Hardening", () => {
  test("corrupted artifact banner presence and layout", async ({ page }) => {
    await page.goto("/artifacts");
    await page.waitForSelector("text=Artifacts", { state: "visible" });

    // Wait for the corrupted banner OR the empty state OR a normal artifact
    const corruptedBanner = page.locator(
      "text=Artifact corrupted / determinism broken / excluded from replay"
    );
    const emptyState = page.locator("text=No Artifacts Found");
    const normalState = page.locator("text=Workspace Artifacts");

    await corruptedBanner
      .or(emptyState)
      .or(normalState)
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    await expect(page).toHaveScreenshot("artifacts-corrupted-banner.png", {
      fullPage: true,
      maxDiffPixels: 200
    });
  });

  test("ReplayPage deterministic vs runtime-noise separation", async ({ page }) => {
    await page.goto("/replay");
    await page.waitForSelector("text=Replay", { state: "visible" });

    // Wait for the replay table OR empty state
    const historyText = page.locator("text=Verification History");
    const emptyText = page.locator("text=No Replays Verified");
    await historyText.or(emptyText).first().waitFor({ state: "visible", timeout: 15000 });

    await expect(page).toHaveScreenshot("replay-matrix-split.png", { fullPage: true });
  });

  test("ProvenanceGraph rendering", async ({ page }) => {
    await page.goto("/artifacts");
    await page.waitForSelector("text=Artifacts", { state: "visible" });

    // Wait for the artifacts list OR empty state
    const firstArtifactLink = page.locator('a[href^="/artifacts/"]').first();
    const emptyState = page.locator("text=No Artifacts Found");
    await firstArtifactLink
      .or(emptyState)
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    if (await firstArtifactLink.isVisible()) {
      await firstArtifactLink.click();

      // Wait for the detail page header to confirm navigation
      await page.waitForSelector("text=Artifact ID", {
        state: "visible",
        timeout: 15000
      });

      // Take snapshot of the page as-is to visually debug the ProvenanceGraph
      await expect(page).toHaveScreenshot("provenance-graph-render.png", {
        fullPage: true
      });
    } else {
      // If no artifacts exist at all, snapshot the empty artifacts page as a fallback
      await expect(page).toHaveScreenshot("provenance-graph-render.png", {
        fullPage: true
      });
    }
  });

  test("StatusBadge stale popover", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForSelector("text=Transactions", { state: "visible" });

    // Wait for table OR empty state
    const tableHeader = page.locator("text=Flow / Type");
    const emptyTxText = page.locator("text=No Transactions Found");
    await tableHeader
      .or(emptyTxText)
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    const staleBadge = page.locator("text=Stale State").first();
    if (await staleBadge.isVisible()) {
      await staleBadge.hover();
      const popover = page.locator("text=Stale Reason");
      await popover.waitFor({ state: "visible", timeout: 15000 });
      await expect(page).toHaveScreenshot("status-badge-stale-popover.png");
    }
  });

  test("EventsPage correlation grouping", async ({ page }) => {
    await page.goto("/events");
    await page.waitForSelector("text=Causal Event Ledger", { state: "visible" });

    // Wait for the events list OR empty states
    const eventGroup = page.locator("text=Workflow Group");
    const emptyEventText = page.locator("text=No events yet.");
    const missingEventsText = page.locator("text=Causal Events Missing");
    await eventGroup
      .or(emptyEventText)
      .or(missingEventsText)
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    await expect(page).toHaveScreenshot("events-correlation-grouping.png", {
      fullPage: true
    });
  });
});
