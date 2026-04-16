import { test, expect } from '@playwright/test';

test('seat map loads and can select a seat', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Interactive venue map')).toBeVisible();

  const availableSeat = page.locator('rect[role="button"][aria-disabled="false"]').first();
  await expect(availableSeat).toBeVisible();
  await availableSeat.click();

  await expect(page.locator('text=Selected seats')).toBeVisible();
  await expect(page.locator('.seat-item').first()).toContainText('Row');
});
