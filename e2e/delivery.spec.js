// @ts-check
import { expect, test } from './fixtures/app.js';

test('the program overview renders from the build under test', async ({ app, page }) => {
  await app.open();
  await expect(page.locator('.portfolio-table')).toBeVisible();
});
