import { expect, test } from '@playwright/test';

// The one end-to-end smoke test from the spec: load the page, start a game against
// level 3, make three moves, and see the bot answer.
test('play three moves against level 3', async ({ page }) => {
  await page.goto('/?anim=instant');
  await expect(page.getByRole('heading', { name: 'Moves' })).toBeVisible();
  await page.getByTestId('opponent').selectOption('level-3');
  await page.getByTestId('new-game').click();

  for (let i = 0; i < 3; i++) {
    await expect(page.getByTestId('status')).toContainText(/Your move|Extra turn|wins|Draw/, {
      timeout: 20_000,
    });
    const status = (await page.getByTestId('status').textContent()) ?? '';
    if (/wins|Draw/.test(status)) break;
    const playable = page.locator('[data-testid^="house-"]:not([disabled])').first();
    await playable.click();
  }

  const botMoves = page.locator('[data-testid="move-log"] li.bot');
  await expect(botMoves.first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid="move-log"] li.you')).not.toHaveCount(0);
});

test('leaderboard page loads', async ({ page }) => {
  await page.goto('/#/leaderboard');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
});
