import { type Page, expect, test } from '@playwright/test';

/** First visits open the rules card; close it so the board can be used. */
async function dismissHelp(page: Page) {
  const start = page.getByRole('button', { name: 'Start playing' });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('dialog#help')).not.toBeVisible();
}

/** Open the opponent picker, choose, and start. */
async function startGame(page: Page, opts: { opponent?: string; botFirst?: boolean } = {}) {
  await page.getByTestId('new-game').click();
  await expect(page.locator('dialog#setup')).toBeVisible();
  if (opts.opponent) await page.getByTestId(`opp-${opts.opponent}`).click();
  if (opts.botFirst !== undefined)
    await page.getByTestId(opts.botFirst ? 'bot-first' : 'you-first').click();
  await page.getByTestId('start-game').click();
  await expect(page.locator('dialog#setup')).not.toBeVisible();
}

// The smoke test from the spec: load the page, start a game against level 3,
// make three moves, and see the bot answer.
test('play three moves against level 3', async ({ page }) => {
  await page.goto('/?anim=instant');
  await dismissHelp(page);
  await expect(page.getByRole('heading', { name: 'Moves' })).toBeVisible();
  await startGame(page, { opponent: 'level-3' });

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
  await startGame(page, { botFirst: true });
  // The insight panel fills in when the bot's search returns, right before its move animates.
  await expect(page.locator('#insight')).toContainText('Evaluation', { timeout: 15_000 });
  await startGame(page); // mid-animation
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

test('the tutorial walks through all five lessons, then offers an opponent', async ({ page }) => {
  await page.goto('/?anim=instant#/learn');
  const coach = page.locator('#coach');
  await expect(coach).toBeVisible();
  for (const house of [1, 4, 1, 2, 7]) {
    // Only the house the lesson asks for can be played.
    await expect(page.locator('[data-testid^="house-"]:not([disabled])')).toHaveCount(1);
    await page.getByTestId(`house-${house}`).click();
    await expect(page.locator('#coach-next')).toBeVisible({ timeout: 15_000 });
    await page.locator('#coach-next').click();
  }
  await expect(coach).toBeHidden();
  await expect(page.locator('dialog#setup')).toBeVisible();
  await expect(page).toHaveURL(/#\/play$/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the board stands upright and the first tap only aims', async ({ page }) => {
    await page.goto('/?anim=instant');
    await page.getByRole('button', { name: 'Start playing' }).tap();
    await expect(page.locator('.play')).toHaveClass(/portrait/);
    const house = page.getByTestId('house-1');
    await house.tap();
    await expect(page.getByTestId('preview')).toContainText('Tap again to sow');
    await expect(page.locator('[data-testid="move-log"] li')).toHaveCount(0);
    await house.tap();
    await expect(page.locator('[data-testid="move-log"] li')).toHaveCount(1);
  });
});

test('leaderboard page loads', async ({ page }) => {
  await page.goto('/#/leaderboard');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
});
