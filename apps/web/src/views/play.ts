/**
 * Play view: a human against one of the bots. The game loop is a small state
 * machine: human turn -> (animate) -> bot turn in the worker -> (animate) -> ...
 * The engine is the referee on this side too: a bot move is checked for
 * legality before it is applied.
 *
 * Every piece of async work (an animation, a bot search, a hint) captures the
 * game `token` when it starts and stops if the token has changed by the time it
 * resumes. New game, undo and leaving the page all bump the token, so stale work
 * can never apply a move to the wrong game.
 */
import { LEVELS, MCTS_OPPONENT } from '@hasik/bots';
import {
  type GameState,
  type Player,
  type SowEvent,
  applyMove,
  applyMoveTraced,
  deriveSeed,
  encodePosition,
  finalScore,
  initialState,
  isLegalMove,
  legalMoves,
  storeOf,
} from '@hasik/engine';
import { createSound } from '../audio/sound';
import { hitTest } from '../board/layout';
import { BoardRenderer, type Frame } from '../board/renderer';
import {
  type LogEntry,
  describeMove,
  formatScore,
  houseNumber,
  shareText,
  shortScore,
  sideLetter,
  statsFor,
} from '../game/notation';
import { previewMove } from '../game/preview';
import {
  KEYS,
  type Outcome,
  type SavedGame,
  type Settings,
  addResult,
  parseRecord,
  parseSavedGame,
  parseSettings,
  replay,
  store,
  undoTarget,
} from '../game/save';
import { BotWorkerClient, CancelledError } from '../worker/client';
import { helpDialogHtml } from './help';

const SPEEDS = { slow: 260, normal: 130, fast: 55, instant: 0 } as const;
type Speed = keyof typeof SPEEDS;

/** Hint mode searches each legal move with a fixed node budget: deterministic and quick. */
const HINT_SPEC = 'minimax:nodes=30000';
const PLAY_URL = 'https://robertgeraldsenasin.github.io/hasik/';
const TIP = 'Tip: hover over or focus a house to see where its last shell lands.';

interface Opponent {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly spec: string;
  readonly blurb: string;
}

const OPPONENTS: readonly Opponent[] = [
  ...LEVELS.map((l) => ({
    id: `level-${l.level}`,
    name: `Level ${l.level} · ${l.name}`,
    short: l.name,
    spec: l.spec,
    blurb: l.blurb,
  })),
  {
    id: 'mcts',
    name: `Bonus · ${MCTS_OPPONENT.name}`,
    short: MCTS_OPPONENT.name,
    spec: MCTS_OPPONENT.spec,
    blurb: MCTS_OPPONENT.blurb,
  },
];
const OPPONENT_IDS = OPPONENTS.map((o) => o.id);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function mountPlay(root: HTMLElement): () => void {
  // ---- Settings: saved values, then URL overrides (?level=4&anim=instant).
  const defaults: Settings = {
    opponentId: 'level-3',
    human: 0,
    speed: reducedMotion() ? 'fast' : 'normal',
    sound: true,
    seenHelp: false,
  };
  let settings = parseSettings(
    store.get(KEYS.settings),
    defaults,
    OPPONENT_IDS,
    Object.keys(SPEEDS),
  );
  const params = new URLSearchParams(location.search);
  const urlLevel = params.get('level');
  if (urlLevel && OPPONENT_IDS.includes(`level-${urlLevel}`))
    settings = { ...settings, opponentId: `level-${urlLevel}` };
  const urlAnim = params.get('anim');
  if (urlAnim && urlAnim in SPEEDS) settings = { ...settings, speed: urlAnim };

  root.innerHTML = `
  <section class="play">
    <h1 class="sr-only">Play Sungka against Hasik's bots</h1>
    <div class="board-col">
      <div class="side-label" id="top-label"></div>
      <div class="board-wrap">
        <canvas id="board" aria-hidden="true"></canvas>
        <div class="toasts" id="toasts" aria-hidden="true"></div>
      </div>
      <div class="side-label" id="bottom-label"></div>
      <div class="house-buttons" role="group" aria-label="Your houses, sowing left to right" id="house-buttons"></div>
      <p id="preview" class="preview" data-testid="preview"></p>
      <p id="status" class="status" role="status" aria-live="polite" data-testid="status"></p>
      <div class="actions">
        <button id="hint" class="btn" data-testid="hint" aria-keyshortcuts="h"><span class="key" aria-hidden="true">H</span>Hint</button>
        <button id="undo" class="btn" data-testid="undo" aria-keyshortcuts="u"><span class="key" aria-hidden="true">U</span>Undo</button>
        <button id="retry" class="btn" hidden>Retry bot move</button>
      </div>
    </div>
    <aside class="panel" aria-label="Game controls and information">
      <div class="controls">
        <label>Opponent
          <select id="opponent" data-testid="opponent">
            ${OPPONENTS.map((o) => `<option value="${o.id}">${o.name}</option>`).join('')}
          </select>
        </label>
        <p class="blurb" id="blurb"></p>
        <label>You play
          <select id="side"><option value="0">First (A)</option><option value="1">Second (B)</option></select>
        </label>
        <label>Animation
          <select id="speed">
            ${(Object.keys(SPEEDS) as Speed[]).map((s) => `<option value="${s}">${s[0]!.toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </label>
        <div class="control-row">
          <button id="new-game" class="btn primary" data-testid="new-game" aria-keyshortcuts="n">New game</button>
          <button id="help-btn" class="btn" data-testid="help" aria-keyshortcuts="?">How to play</button>
        </div>
        <label class="switch"><input type="checkbox" id="sound" data-testid="sound" /> <span>Sound effects</span></label>
      </div>
      <div class="scoreboard" aria-label="Stores">
        <div id="score-you-box"><span class="who">You</span><strong id="score-you">0</strong></div>
        <div id="score-bot-box"><span class="who" id="score-bot-name">Bot</span><strong id="score-bot">0</strong></div>
      </div>
      <details class="insight" open>
        <summary>Engine insight</summary>
        <dl id="insight"><dt>Bot</dt><dd>Waiting for its first move.</dd></dl>
      </details>
      <h2 class="log-title">Moves</h2>
      <ol class="log" id="log" data-testid="move-log"></ol>
      <p class="record" id="record" data-testid="record"></p>
      <p class="seed" id="seed"></p>
    </aside>
    ${helpDialogHtml()}
    <dialog id="result" class="dialog result" data-testid="result" aria-labelledby="r-title">
      <div class="burst" id="r-burst" aria-hidden="true"></div>
      <p class="kicker" id="r-kicker"></p>
      <h2 id="r-title"></h2>
      <p class="final" id="r-score"></p>
      <table class="result-stats" id="r-stats"></table>
      <p class="muted small" id="r-note"></p>
      <div class="result-actions">
        <button id="r-again" class="btn primary">Play again</button>
        <button id="r-next" class="btn" hidden></button>
        <button id="r-copy" class="btn">Copy result</button>
        <button id="r-close" class="btn">Close</button>
      </div>
    </dialog>
  </section>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const canvas = $<HTMLCanvasElement>('board');
  const renderer = new BoardRenderer(canvas);
  const worker = new BotWorkerClient();
  const sound = createSound(settings.sound);
  const wrap = root.querySelector<HTMLElement>('.board-wrap')!;
  const help = $<HTMLDialogElement>('help');
  const result = $<HTMLDialogElement>('result');
  const opponentSel = $<HTMLSelectElement>('opponent');
  const sideSel = $<HTMLSelectElement>('side');
  const speedSel = $<HTMLSelectElement>('speed');
  const soundBox = $<HTMLInputElement>('sound');
  opponentSel.value = settings.opponentId;
  sideSel.value = String(settings.human);
  speedSel.value = settings.speed;
  soundBox.checked = settings.sound;

  let state: GameState = initialState();
  let positions: GameState[] = [state]; // positions[i] is the one before moves[i]
  let moves: number[] = [];
  let human: Player = settings.human;
  let opponent: Opponent = OPPONENTS.find((o) => o.id === settings.opponentId) ?? OPPONENTS[2]!;
  let speed: Speed = settings.speed as Speed;
  let seed = randomSeed();
  let busy = false;
  let thinking = false;
  let hinting = false;
  let assisted = false; // hints or undo used: the game is not counted in the record
  let counted = false;
  let token = 0;
  let log: LogEntry[] = [];
  let previewHouse: number | null = null;
  let frame: Frame = blankFrame(state);

  function blankFrame(s: GameState): Frame {
    return {
      slots: s.slots,
      playable: new Set(),
      hover: null,
      active: null,
      hand: 0,
      lastMove: null,
      captureFlash: new Set(),
      preview: null,
      hints: new Map(),
    };
  }
  const draw = () => renderer.draw(frame);
  const status = (text: string) => ($('status').textContent = text);
  const botName = () => opponent.short;
  const base = () => (human === 0 ? 0 : 8);
  const humanTurn = () => !state.over && state.toMove === human && !busy;

  function saveSettings() {
    settings = {
      opponentId: opponent.id,
      human: Number(sideSel.value) as Player,
      speed,
      sound: sound.enabled,
      seenHelp: settings.seenHelp,
    };
    store.set(KEYS.settings, JSON.stringify(settings));
  }

  function saveGame() {
    if (state.over) {
      store.remove(KEYS.game);
      return;
    }
    const g: SavedGame = { v: 1, seed, opponentId: opponent.id, human, moves, assisted };
    store.set(KEYS.game, JSON.stringify(g));
  }

  function toast(text: string, tone: 'gold' | 'red' | 'plain' = 'plain') {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.textContent = text;
    $('toasts').append(el);
    window.setTimeout(() => el.remove(), 1700);
  }

  // ---- House buttons are built once and updated in place, so keyboard focus survives moves.
  const buttons: HTMLButtonElement[] = [];
  for (let k = 0; k < 7; k++) {
    const b = document.createElement('button');
    b.className = 'house-btn';
    b.setAttribute('data-testid', `house-${k + 1}`);
    b.setAttribute('aria-keyshortcuts', String(k + 1));
    b.innerHTML = `<span class="hn">${k + 1}</span><span class="hc"></span>`;
    b.onclick = () => void humanMove(base() + k);
    b.onmouseenter = b.onfocus = () => setPreview(base() + k);
    b.onmouseleave = b.onblur = () => setPreview(null);
    buttons.push(b);
    $('house-buttons').append(b);
  }

  function setPreview(house: number | null) {
    previewHouse = house !== null && humanTurn() && isLegalMove(state, house) ? house : null;
    const p = previewHouse !== null ? previewMove(state, previewHouse) : null;
    frame = { ...frame, preview: p ? p.landing : null, hover: previewHouse };
    $('preview').textContent = p ? p.text : humanTurn() ? TIP : '';
    canvas.style.cursor = previewHouse !== null ? 'pointer' : 'default';
    draw();
  }

  function refreshChrome() {
    const mine = humanTurn();
    const playable = mine ? new Set(legalMoves(state)) : new Set<number>();
    frame = { ...frame, slots: frame.active === null ? state.slots : frame.slots, playable };
    if (!mine) frame = { ...frame, preview: null, hover: null };
    buttons.forEach((b, k) => {
      const slot = base() + k;
      const n = state.slots[slot] as number;
      b.disabled = !playable.has(slot);
      b.querySelector('.hc')!.textContent = String(n);
      b.setAttribute('aria-label', `House ${k + 1}, ${n} shell${n === 1 ? '' : 's'}`);
    });
    const you = state.slots[storeOf(human)] as number;
    const them = state.slots[storeOf(human === 0 ? 1 : 0)] as number;
    $('score-you').textContent = String(you);
    $('score-bot').textContent = String(them);
    $('score-bot-name').textContent = botName();
    const botToMove = !state.over && state.toMove !== human;
    $('score-you-box').classList.toggle('turn', !state.over && state.toMove === human);
    $('score-bot-box').classList.toggle('turn', botToMove);
    $('top-label').textContent =
      `${botName()} (${sideLetter(human === 0 ? 1 : 0)}) · store on the left${thinking ? ' · thinking…' : ''}`;
    $('top-label').classList.toggle('turn', botToMove);
    $('bottom-label').textContent =
      `You (${sideLetter(human)}) · sow left to right into your store on the right${mine ? ' · your turn' : ''}`;
    $('bottom-label').classList.toggle('turn', mine);
    $('blurb').textContent = opponent.blurb;
    $('seed').textContent = `Game seed ${seed} · bot spec ${opponent.spec}`;
    const book = parseRecord(store.get(KEYS.record));
    for (const opt of Array.from(opponentSel.options)) {
      const o = OPPONENTS.find((x) => x.id === opt.value)!;
      opt.textContent = (book[o.id]?.w ?? 0) > 0 ? `${o.name} ✓` : o.name;
    }
    const rec = book[opponent.id];
    $('record').textContent = rec
      ? `Your record vs ${botName()}: ${rec.w} W · ${rec.d} D · ${rec.l} L${rec.streak > 1 ? ` · ${rec.streak} wins in a row` : ''}`
      : `No games against ${botName()} yet. Games where you use hints or undo aren't counted.`;
    $<HTMLButtonElement>('hint').disabled = !mine || hinting;
    $<HTMLButtonElement>('undo').disabled = undoTarget(positions, human) === null;
    if (previewHouse === null) $('preview').textContent = mine ? TIP : '';
    const logEl = $('log');
    logEl.innerHTML = log
      .map(
        (e) =>
          `<li class="${e.who === 'You' ? 'you' : 'bot'}"><span>${e.who}</span> ${e.text}</li>`,
      )
      .join('');
    logEl.scrollTop = logEl.scrollHeight;
    draw();
  }

  function resize() {
    renderer.resize(wrap.clientWidth, human === 1);
    draw();
  }

  async function animate(
    before: GameState,
    events: readonly SowEvent[],
    my: number,
  ): Promise<void> {
    const delay = SPEEDS[speed];
    if (delay === 0) {
      sound.drop(0);
      return;
    }
    const slots = Array.from(before.slots);
    let hand = 0;
    let step = 0;
    for (const e of events) {
      if (my !== token) return;
      if (e.kind === 'pickup') {
        hand = e.count;
        slots[e.slot] = 0;
        frame = { ...frame, slots, active: e.slot, hand, playable: new Set() };
        draw();
        await sleep(delay * (e.relay ? 2.5 : 1.5));
      } else if (e.kind === 'drop') {
        slots[e.slot]!++;
        hand--;
        frame = { ...frame, slots, active: e.slot, hand };
        draw();
        sound.drop(step++);
        await sleep(delay);
      } else if (e.kind === 'capture') {
        frame = { ...frame, captureFlash: new Set([e.landing, e.opposite]) };
        draw();
        await sleep(delay * 4);
        // count = opposite shells + (1 if the rules also bank the landing shell).
        const takesLanding = e.count - slots[e.opposite]!;
        slots[e.store]! += e.count;
        slots[e.opposite] = 0;
        slots[e.landing]! -= takesLanding;
        frame = { ...frame, slots, captureFlash: new Set() };
        draw();
        await sleep(delay * 2);
      }
    }
  }

  /** Play one move with animation. Returns false if the game changed underneath it. */
  async function play(house: number, who: string): Promise<boolean> {
    const my = token;
    const before = state;
    const r = applyMoveTraced(before, house);
    busy = true;
    previewHouse = null;
    frame = { ...frame, lastMove: house, playable: new Set(), preview: null, hints: new Map() };
    refreshChrome();
    await animate(before, r.events, my);
    if (my !== token) return false;
    state = r.state;
    moves = [...moves, house];
    positions = [...positions, state];
    frame = { ...blankFrame(state), lastMove: house };
    const entry = describeMove(before.ply + 1, before.toMove, who, house, r);
    log = [...log, entry];
    const mineMove = before.toMove === human;
    if (entry.captured > 0) {
      sound.capture();
      toast(
        mineMove ? `+${entry.captured} captured!` : `${who} captured ${entry.captured}`,
        mineMove ? 'gold' : 'red',
      );
    }
    if (entry.extraTurn) {
      sound.extraTurn();
      toast(mineMove ? 'Extra turn!' : `${who} goes again`, mineMove ? 'gold' : 'plain');
    }
    busy = false;
    saveGame();
    refreshChrome();
    return true;
  }

  async function humanMove(house: number) {
    if (!humanTurn() || !isLegalMove(state, house)) return;
    if (await play(house, 'You')) void next();
  }

  async function botTurn() {
    const my = token;
    busy = true;
    thinking = true;
    $('retry').hidden = true;
    status(`${botName()} is thinking…`);
    refreshChrome();
    try {
      const res = await worker.think(
        encodePosition(state),
        opponent.spec,
        deriveSeed(seed, state.ply),
      );
      if (my !== token) return;
      if (!isLegalMove(state, res.move))
        throw new Error(`bot proposed an illegal move (${res.move})`);
      showInsight(res);
      thinking = false;
      busy = false;
      if (await play(res.move, botName())) void next();
    } catch (e) {
      if (my !== token || e instanceof CancelledError) return;
      thinking = false;
      busy = false;
      status(`${botName()} could not move: ${(e as Error).message}. Try again.`);
      $('retry').hidden = false;
      refreshChrome();
    }
  }

  async function hint() {
    if (!humanTurn() || hinting) return;
    const my = token;
    const at = moves.length;
    hinting = true;
    status('Asking the engine to score every move…');
    refreshChrome();
    try {
      const res = await worker.analyze(
        encodePosition(state),
        HINT_SPEC,
        deriveSeed(seed, state.ply, 0x417),
      );
      if (my !== token || moves.length !== at) return;
      const best = res.moves[0];
      if (!best) return;
      assisted = true;
      frame = {
        ...frame,
        hints: new Map(
          res.moves.map((m) => [
            m.move,
            { label: shortScore(m.score), best: m.score === best.score },
          ]),
        ),
      };
      status(
        `Hint: house ${houseNumber(best.move)} looks best (${formatScore(best.score, 'minimax')}). Gold marks the best move.`,
      );
      saveGame();
    } catch (e) {
      if (my !== token || e instanceof CancelledError) return;
      status(`The hint engine failed (${(e as Error).message}). Your move.`);
    } finally {
      hinting = false;
      if (my === token) refreshChrome();
    }
  }

  function undo() {
    const i = undoTarget(positions, human);
    if (i === null) return;
    token++;
    worker.cancel();
    busy = thinking = hinting = false;
    moves = moves.slice(0, i);
    positions = positions.slice(0, i + 1);
    log = log.slice(0, i);
    state = positions[i]!;
    assisted = true;
    frame = { ...blankFrame(state), lastMove: moves.length > 0 ? moves[moves.length - 1]! : null };
    $('retry').hidden = true;
    if (result.open) result.close();
    saveGame();
    toast('Move taken back');
    void next();
  }

  function showInsight(r: {
    score?: number;
    depth?: number;
    nodes?: number;
    pv?: readonly number[];
    ms: number;
  }) {
    const kind = opponent.spec.startsWith('mcts')
      ? 'mcts'
      : opponent.spec.startsWith('minimax')
        ? 'minimax'
        : 'other';
    const nps = r.nodes && r.ms > 0 ? Math.round((r.nodes / r.ms) * 1000) : 0;
    const pv = (r.pv ?? []).map((m) => `${m < 7 ? 'A' : 'B'}${houseNumber(m)}`).join(' ');
    const rows: Array<[string, string]> = [
      ['Evaluation', formatScore(r.score, kind)],
      [kind === 'mcts' ? 'Tree depth' : 'Depth', r.depth !== undefined ? String(r.depth) : '–'],
      [
        kind === 'mcts' ? 'Playouts' : 'Nodes',
        r.nodes !== undefined ? r.nodes.toLocaleString() : '–',
      ],
      ['Speed', nps ? `${nps.toLocaleString()} ${kind === 'mcts' ? 'playouts' : 'nodes'}/s` : '–'],
      ['Think time', `${r.ms.toFixed(0)} ms`],
      ['Expected line', pv || '–'],
    ];
    $('insight').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  function finish() {
    const { a, b } = finalScore(state);
    const you = human === 0 ? a : b;
    const them = human === 0 ? b : a;
    const outcome: Outcome = you > them ? 'win' : you < them ? 'loss' : 'draw';
    const verdict =
      outcome === 'win' ? 'You win' : outcome === 'loss' ? `${botName()} wins` : 'Draw';
    status(`${verdict}, ${you}–${them}. Shells left in a row go to that row's owner.`);
    if (!assisted && !counted) {
      counted = true;
      store.set(
        KEYS.record,
        JSON.stringify(addResult(parseRecord(store.get(KEYS.record)), opponent.id, outcome)),
      );
    }
    store.remove(KEYS.game);
    sound.end(outcome);
    refreshChrome();
    openResult(outcome, you, them);
  }

  function openResult(outcome: Outcome, you: number, them: number) {
    $('r-kicker').textContent =
      outcome === 'win' ? 'Panalo!' : outcome === 'draw' ? 'Tabla' : 'Talo';
    $('r-title').textContent =
      outcome === 'win'
        ? `You beat ${botName()}`
        : outcome === 'draw'
          ? `A draw with ${botName()}`
          : `${botName()} wins this one`;
    $('r-score').textContent = `${you} – ${them}`;
    const sy = statsFor(log, human);
    const sb = statsFor(log, human === 0 ? 1 : 0);
    $('r-stats').innerHTML = `
      <thead><tr><th><span class="sr-only">Statistic</span></th><th>You</th><th>${botName()}</th></tr></thead>
      <tbody>
        <tr><th>Shells captured</th><td>${sy.captured}</td><td>${sb.captured}</td></tr>
        <tr><th>Extra turns</th><td>${sy.extraTurns}</td><td>${sb.extraTurns}</td></tr>
        <tr><th>Longest move (drops)</th><td>${sy.longestMove}</td><td>${sb.longestMove}</td></tr>
      </tbody>`;
    const rec = parseRecord(store.get(KEYS.record))[opponent.id];
    $('r-note').textContent = assisted
      ? 'You used hints or undo, so this game is not counted in your record.'
      : rec
        ? `Record vs ${botName()}: ${rec.w} W · ${rec.d} D · ${rec.l} L${rec.streak > 1 ? ` · ${rec.streak} wins in a row` : ''}.`
        : '';
    const idx = OPPONENTS.findIndex((o) => o.id === opponent.id);
    const nextOpp = outcome === 'win' ? OPPONENTS[idx + 1] : undefined;
    const nextBtn = $<HTMLButtonElement>('r-next');
    nextBtn.hidden = !nextOpp;
    if (nextOpp) {
      nextBtn.textContent = `Try ${nextOpp.name}`;
      nextBtn.onclick = () => {
        opponentSel.value = nextOpp.id;
        result.close();
        newGame();
      };
    }
    const copyBtn = $<HTMLButtonElement>('r-copy');
    copyBtn.textContent = 'Copy result';
    copyBtn.onclick = () => {
      const text = shareText(outcome, you, them, `${opponent.name}`, PLAY_URL);
      const fallback = () => ($('r-note').textContent = text);
      try {
        void navigator.clipboard
          .writeText(text)
          .then(() => (copyBtn.textContent = 'Copied!'), fallback);
      } catch {
        fallback();
      }
    };
    const burst = $('r-burst');
    burst.innerHTML =
      outcome === 'win' && !reducedMotion()
        ? Array.from(
            { length: 18 },
            (_, i) =>
              `<i style="--x:${(i * 53) % 100}%;--d:${(i % 6) * 0.08}s;--r:${(i * 47) % 360}deg"></i>`,
          ).join('')
        : '';
    if (typeof result.showModal === 'function' && !result.open) result.showModal();
    $<HTMLButtonElement>('r-again').focus();
  }

  async function next() {
    if (state.over) return finish();
    if (state.toMove === human) {
      const extra = log.length > 0 && log[log.length - 1]!.mover === human;
      status(extra ? 'Extra turn! Your move again.' : 'Your move: pick one of your houses.');
      refreshChrome();
    } else {
      await botTurn();
    }
  }

  function startFrom(game: {
    seed: number;
    human: Player;
    moves: readonly number[];
    positions: GameState[];
    assisted: boolean;
  }) {
    token++;
    worker.cancel();
    busy = thinking = hinting = false;
    counted = false;
    human = game.human;
    seed = game.seed;
    moves = [...game.moves];
    positions = game.positions;
    state = positions[positions.length - 1]!;
    assisted = game.assisted;
    log = moves.map((m, i) => {
      const p = positions[i]!;
      return describeMove(
        i + 1,
        p.toMove,
        p.toMove === human ? 'You' : botName(),
        m,
        applyMove(p, m),
      );
    });
    frame = { ...blankFrame(state), lastMove: moves.length > 0 ? moves[moves.length - 1]! : null };
    $('insight').innerHTML = '<dt>Bot</dt><dd>Waiting for its first move.</dd>';
    $('retry').hidden = true;
    if (result.open) result.close();
    resize();
  }

  function newGame() {
    opponent = OPPONENTS.find((o) => o.id === opponentSel.value) ?? opponent;
    const start = initialState();
    startFrom({
      seed: randomSeed(),
      human: Number(sideSel.value) as Player,
      moves: [],
      positions: [start],
      assisted: false,
    });
    saveSettings();
    saveGame();
    void next();
  }

  /** Restore a saved game if it is valid and unfinished. */
  function resume(): boolean {
    const saved = parseSavedGame(store.get(KEYS.game), OPPONENT_IDS);
    if (!saved) return false;
    const replayed = replay(saved.moves);
    if (!replayed || replayed[replayed.length - 1]!.over) {
      store.remove(KEYS.game);
      return false;
    }
    opponent = OPPONENTS.find((o) => o.id === saved.opponentId)!;
    opponentSel.value = opponent.id;
    sideSel.value = String(saved.human);
    startFrom({ ...saved, positions: replayed });
    if (saved.moves.length > 0) toast('Welcome back! Your game was restored.');
    void next();
    return true;
  }

  function openHelp() {
    if (typeof help.showModal === 'function' && !help.open) help.showModal();
  }
  help.addEventListener('close', () => {
    if (!settings.seenHelp) {
      settings = { ...settings, seenHelp: true };
      saveSettings();
    }
  });

  function toggleSound() {
    sound.enabled = !sound.enabled;
    soundBox.checked = sound.enabled;
    saveSettings();
    toast(sound.enabled ? 'Sound on' : 'Sound off');
  }

  // ---- Events.
  $('new-game').onclick = newGame;
  $('help-btn').onclick = openHelp;
  $('hint').onclick = () => void hint();
  $('undo').onclick = undo;
  $('retry').onclick = () => void botTurn();
  $('r-again').onclick = () => {
    result.close();
    newGame();
  };
  $('r-close').onclick = () => result.close();
  soundBox.onchange = () => {
    sound.enabled = soundBox.checked;
    saveSettings();
  };
  speedSel.onchange = () => {
    speed = speedSel.value as Speed;
    saveSettings();
  };
  opponentSel.onchange = () => {
    // A new opponent takes effect at the next new game; until then, show who it will be.
    $('blurb').textContent =
      OPPONENTS.find((o) => o.id === opponentSel.value)?.blurb ?? opponent.blurb;
    if (moves.length === 0) newGame();
  };
  sideSel.onchange = () => {
    if (moves.length === 0) newGame();
  };
  const toCanvas = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return hitTest(renderer.layout, e.clientX - rect.left, e.clientY - rect.top);
  };
  canvas.addEventListener('pointermove', (e) => {
    const h = toCanvas(e);
    const hover = h !== null && frame.playable.has(h) ? h : null;
    if (hover !== previewHouse) setPreview(hover);
  });
  canvas.addEventListener('pointerleave', () => setPreview(null));
  canvas.addEventListener('click', (e) => {
    const h = toCanvas(e);
    if (h !== null) void humanMove(h);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (
      t instanceof HTMLSelectElement ||
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement
    )
      return;
    if (root.querySelector('dialog[open]')) return;
    const k = Number(e.key);
    if (k >= 1 && k <= 7) {
      void humanMove(base() + k - 1);
      return;
    }
    switch (e.key) {
      case 'n':
      case 'N':
        newGame();
        break;
      case 'h':
      case 'H':
        void hint();
        break;
      case 'u':
      case 'U':
        undo();
        break;
      case 'm':
      case 'M':
        toggleSound();
        break;
      case '?':
        openHelp();
        break;
    }
  };
  window.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  if (!resume()) newGame();
  if (!settings.seenHelp) openHelp();

  return () => {
    token++;
    worker.cancel();
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
  };
}
