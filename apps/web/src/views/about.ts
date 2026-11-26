const REPO = 'https://github.com/robertgeraldsenasin/hasik';

export function mountAbout(root: HTMLElement): void {
  root.innerHTML = `
  <section class="prose">
    <h1>How Hasik works</h1>
    <p><strong>Hasik</strong> is Tagalog for "to sow", the one move in Sungka, the Filipino mancala. The board
    (<i lang="tl">sungkaan</i>) is a carved plank, often boat-shaped, with seven small houses (<i lang="tl">bahay</i>)
    for each player and a big store (<i lang="tl">ulo</i>, "head") at each end. Every house starts with seven
    cowrie shells (<i lang="tl">sigay</i>).</p>

    <h2>The rules in one minute</h2>
    <ol>
      <li>Pick one of your non-empty houses, scoop up its shells and drop one in each slot going
      counter-clockwise, including your own store but never your opponent's.</li>
      <li>Last shell in <em>your store</em>: move again.</li>
      <li>Last shell in a house that already had shells: scoop them all up and keep sowing.</li>
      <li>Last shell in an <em>empty house on your side</em>: capture it plus everything in the house opposite.</li>
      <li>When the player to move has no shells left, the game ends; shells still in a row go to that row's owner.
      Most shells wins.</li>
    </ol>
    <p class="muted">Regional variants differ. Every rule above is a flag in the engine (see ADR-0001).</p>

    <h2>The engine</h2>
    <ul>
      <li><strong>Alpha-beta search</strong> with iterative deepening, a Zobrist-hashed transposition table and
      move ordering. The Sungka twist: after an extra turn the same player moves again, so the search must not flip
      the score's sign.</li>
      <li><strong>Monte Carlo Tree Search</strong> as a second, completely different AI.</li>
      <li><strong>Glicko-2</strong> ratings from round-robin tournaments.</li>
      <li><strong>A CI strength gate</strong>: every change to the engine plays the main branch under a Sequential
      Probability Ratio Test and cannot merge unless it is proven not to be weaker.</li>
    </ul>
    <p>Code, design records and the build guide: <a href="${REPO}">${REPO.replace('https://', '')}</a>.</p>

    <h2>Playing it on a screen</h2>
    <p>Sungka is easy to learn and hard to count. A single move can relay around the board three or four times,
    so the play page is built to show you what a move will do before you commit and what it did afterwards.</p>
    <ul>
      <li><strong>Learn in five moves.</strong> The tutorial (<a href="#/learn">Learn</a>) puts you on five real
      positions, one idea each: sowing, the extra turn, relays, captures and the end of the game.</li>
      <li><strong>Look before you sow.</strong> Point at a house, or tap it once on a phone, and the board marks
      every pit the move will touch, where it relays, where the last shell lands and what you bank. The preview
      runs the real engine on a copy of the position, so it is never wrong.</li>
      <li><strong>Moves you can follow.</strong> Shells are scooped into a hand and dropped one at a time.
      Long relays speed up so no move drags, and a tap on the board or the Space bar fast-forwards.</li>
      <li><strong>Hints, undo and saved games.</strong> The engine can score every move for you (gold marks the
      best). Games that use a hint or undo still play out but don't count in your record.</li>
      <li><strong>Phones.</strong> Held upright, the board turns a quarter turn so the houses are big enough to
      tap with a thumb.</li>
    </ul>

    <h2>Keyboard</h2>
    <p><kbd>1</kbd>–<kbd>7</kbd> play your houses in sowing order, <kbd>H</kbd> hint, <kbd>U</kbd> undo,
    <kbd>N</kbd> new game, <kbd>M</kbd> sound on or off, <kbd>Space</kbd> skip ahead, <kbd>?</kbd> rules.</p>
  </section>`;
}
