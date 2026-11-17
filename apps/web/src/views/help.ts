/**
 * The how-to-play dialog. It opens by itself on a player's first visit and any
 * time from the "How to play" button or the ? key.
 */
export function helpDialogHtml(): string {
  return `
  <dialog id="help" class="dialog help" aria-labelledby="help-title">
    <h2 id="help-title">How to play Sungka</h2>
    <p class="muted">You and the bot each own a row of seven houses (yours is the bottom row) and the store
    to your right. Everyone starts with 7 shells in every house.</p>
    <ol class="howto">
      <li><b>Sow.</b> Pick one of your houses. Its shells are dropped one at a time into the next slots,
      going right along your row and around the board, into your store but never the bot's.</li>
      <li><b>Last shell in your store:</b> you move again.</li>
      <li><b>Last shell in a house that already had shells:</b> scoop them all up and keep sowing.</li>
      <li><b>Last shell in an empty house on your side:</b> capture it and everything in the house across.</li>
      <li><b>Game over</b> when the player to move has no shells left. Shells still in a row go to that row's
      owner, and the most shells wins.</li>
    </ol>
    <h3>Helpers</h3>
    <ul class="howto-help">
      <li><b>Preview:</b> hover over or focus a house to see where its last shell will land.</li>
      <li><b>Hint:</b> the engine scores every move you can make; the best one is marked in gold.</li>
      <li><b>Undo:</b> take back your last move.</li>
    </ul>
    <p class="muted small">Hints and undo are always allowed; a game that uses them just isn't counted in your
    win record. Your game is saved as you play, so you can close the tab and come back.</p>
    <p class="keys small"><kbd>1</kbd>–<kbd>7</kbd> play a house · <kbd>H</kbd> hint · <kbd>U</kbd> undo ·
    <kbd>N</kbd> new game · <kbd>M</kbd> sound · <kbd>?</kbd> this help</p>
    <form method="dialog"><button class="btn primary" value="ok">Start playing</button></form>
  </dialog>`;
}
