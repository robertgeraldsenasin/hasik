import { type Page, expect, test } from '@playwright/test';

/** First visits open the how-to-play dialog; close it so the board can be used. */
async function dismissHelp(page: Page) {
  const start = page.getByRole('button', { name: 'Start playing' });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('dialog#help')).not.toBeVisible();
}

// The smoke test from the spec: load the page, start a game against level 3,
// make three moves, and see the bot answer.
test('play three moves against level 3', async ({ page }) => {
  await page.goto('/?anim=instant');
  await dismissHelp(page);
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

test('preview, hint, undo and resume after a reload', async ({ page }) => {
  await page.goto('/?anim=instant&level=2');
  await dismissHelp(page);

  // Preview: hovering house 1 explains the move before it is played.
  await page.getByTestId('house-1').hover();
  await expect(page.getByTestId('preview')).toContainText('last shell lands in your store');

  // Hint: the engine scores every move and names the best house.
  await page.getByTestId('hint').click();
  await expect(page.getByTestId('status')).toContainText(/^Hint: house \d looks best/, {
    timeout: 20_000,
  });

  // Play house 2 (ends the turn), let the bot answer, then take it all back.
  await page.getByTestId('house-2').click();
  const log = page.locator('[data-testid="move-log"] li');
  await expect(page.locator('[data-testid="move-log"] li.bot').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('status')).toContainText(/Your move|Extra turn/, {
    timeout: 20_000,
  });
  const played = await log.count();
  expect(played).toBeGreaterThanOrEqual(2);

  // Reload: the game in progress is restored move for move, and help stays closed.
  await page.reload();
  await expect(log).toHaveCount(played);
  await expect(page.locator('dialog#help')).not.toBeVisible();

  await page.getByTestId('undo').click();
  await expect(log).toHaveCount(0);
  await expect(page.getByTestId('status')).toContainText('Your move');
});

test('keyboard shortcuts ignore modifier keys', async ({ page }) => {
  await page.goto('/?anim=instant');
  await dismissHelp(page);
  await page.keyboard.press('Control+1');
  await expect(page.locator('[data-testid="move-log"] li')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(page.locator('[data-testid="move-log"] li')).toHaveCount(1);
});

test('a new game during the bot animation never lets the old bot move again', async ({ page }) => {
  // Regression test for the 2026-11-16 race in docs/debug-log.md.
  await page.goto('/?anim=slow&level=2');
  await dismissHelp(page);
  await page.locator('#side').selectOption('1'); // the bot moves first
  // The insight panel fills in when the bot's search returns, right before its move animates.
  await expect(page.locator('#insight')).toContainText('Evaluation', { timeout: 15_000 });
  await page.getByTestId('new-game').click(); // mid-animation
  await expect(page.getByTestId('status')).toContainText(/Your move|Extra turn/, {
    timeout: 30_000,
  });
  await expect(page.locator('#retry')).toBeHidden();
  await expect(page.locator('[data-testid="move-log"] li.you')).toHaveCount(0);
  const log = page.locator('[data-testid="move-log"] li');
  const played = await log.count();
  expect(played).toBeGreaterThan(0);
  // A stale bot turn would add a duplicate move that can't be replayed: the saved game must restore.
  await page.reload();
  await expect(page.locator('.toast', { hasText: 'Welcome back' })).toBeAttached();
  await expect(log).toHaveCount(played);
});

test('leaderboard page loads', async ({ page }) => {
  await page.goto('/#/leaderboard');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
});
