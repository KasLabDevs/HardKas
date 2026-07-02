import { test, expect } from '@playwright/test';

test('SuperApp frontend renders Dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Vite \+ React/);
});
