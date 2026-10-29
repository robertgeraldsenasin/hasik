/**
 * Play view: a human against one of the bots. The game loop is a small state
 * machine: human turn -> (animate) -> bot turn in the worker -> (animate) -> ...
 * The engine is the referee on this side too: a bot move is checked for
 * legality before it is applied.
 */
import { LEVELS, MCTS_OPPONENT } from '@hasik/bots';
import {
  type GameState,
  type MoveResult,
  type Player,
  type SowEvent,
  applyMoveTraced,
  deriveSeed,
  encodePosition,
  finalScore,
  initialState,
  isLegalMove,
  legalMoves,
  storeOf,
} from '@hasik/engine';
import { hitTest } from '../board/layout';
import { BoardRenderer, type Frame } from '../board/renderer';
import {
  type LogEntry,
  describeMove,
  formatScore,
  houseNumber,
  sideLetter,
} from '../game/notation';
import { BotWorkerClient } from '../worker/client';

const SPEEDS = { slow: 260, normal: 130, fast: 55, instant: 0 } as const;
type Speed = keyof typeof SPEEDS;

interface Opponent {
  readonly id: string;
  readonly name: string;
  readonly spec: string;
  readonly blurb: string;
}

const OPPONENTS: readonly Opponent[] = [
  ...LEVELS.map((l) => ({
    id: `level-${l.level}`,
    name: `Level ${l.level} · ${l.name}`,
    spec: l.spec,
    blurb: l.blurb,
  })),
  {
    id: 'mcts',
    name: `Bonus · ${MCTS_OPPONENT.name}`,
    spec: MCTS_OPPONENT.spec,
    blurb: MCTS_OPPONENT.blurb,
  },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;

function loadRecord(): Record<string, { w: number; d: number; l: number }> {
  try {
    return JSON.parse(localStorage.getItem('hasik:record') ?? '{}') as Record<
      string,
      { w: number; d: number; l: number }
    >;
  } catch {
    return {};
  }
}
function saveRecord(r: Record<string, { w: number; d: number; l: number }>) {
  try {
    localStorage.setItem('hasik:record', JSON.stringify(r));
  } catch {
    /* storage unavailable (private mode, sandbox): the record is just not kept */
  }
}

export function mountPlay(root: HTMLElement): () => void {
  const params = new URLSearchParams(location.search);
  const initialOpp =
    OPPONENTS.find((o) => o.id === `level-${params.get('level')}`) ?? OPPONENTS[2]!;
  const initialSpeed =
    (params.get('anim') as Speed) in SPEEDS ? (params.get('anim') as Speed) : 'normal';

  root.innerHTML = `
  <section class="play">
    <div class="board-col">
      <div class="side-label" id="top-label"></div>
      <div class="board-wrap"><canvas id="board" aria-hidden="true"></canvas></div>
      <div class="side-label" id="bottom-label"></div>
      <div class="house-buttons" role="group" aria-label="Your houses, sowing left to right" id="house-buttons"></div>
      <p id="status" class="status" role="status" aria-live="polite" data-testid="status"></p>
      <div class="status-actions"><button id="retry" class="btn" hidden>Retry bot move</button></div>
    </div>
    <aside class="panel" aria-label="Game controls and information">
      <div class="controls">
        <label>Opponent
          <select id="opponent" data-testid="opponent">
            ${OPPONENTS.map((o) => `<option value="${o.id}" ${o.id === initialOpp.id ? 'selected' : ''}>${o.name}</option>`).join('')}
          </select>
        </label>
        <p class="blurb" id="blurb"></p>
        <label>You play
          <select id="side"><option value="0">First (A)</option><option value="1">Second (B)</option></select>
        </label>
        <label>Animation
          <select id="speed">
            ${(Object.keys(SPEEDS) as Speed[]).map((s) => `<option value="${s}" ${s === initialSpeed ? 'selected' : ''}>${s[0]!.toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </label>
        <button id="new-game" class="btn primary" data-testid="new-game">New game</button>
      </div>
      <div class="scoreboard" aria-label="Stores">
        <div><span class="who">You</span><strong id="score-you">0</strong></div>
        <div><span class="who" id="score-bot-name">Bot</span><strong id="score-bot">0</strong></div>
      </div>
      <details class="insight" open>
        <summary>Engine insight</summary>
        <dl id="insight"><dt>Waiting for the bot's first move.</dt></dl>
      </details>
      <h2 class="log-title">Moves</h2>
      <ol class="log" id="log" data-testid="move-log"></ol>
      <p class="record" id="record"></p>
      <p class="seed" id="seed"></p>
    </aside>
  </section>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const canvas = $<HTMLCanvasElement>('board');
  const renderer = new BoardRenderer(canvas);
  const worker = new BotWorkerClient();
  const wrap = root.querySelector<HTMLElement>('.board-wrap')!;

  let state: GameState = initialState();
  let human: Player = 0;
  let opponent: Opponent = initialOpp;
  let speed: Speed = initialSpeed;
  let seed = randomSeed();
  let busy = false;
  let token = 0; // bumps on every new game so stale async work stops
  let log: LogEntry[] = [];
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
    };
  }
  const draw = () => renderer.draw(frame);
  const status = (text: string) => ($('status').textContent = text);
  const botName = () => opponent.name.split('·').pop()!.trim();

  function humanTurn(): boolean {
    return !state.over && state.toMove === human && !busy;
  }

  function refreshChrome() {
    const playable = humanTurn() ? new Set(legalMoves(state)) : new Set<number>();
    frame = { ...frame, slots: frame.active === null ? state.slots : frame.slots, playable };
    const base = human === 0 ? 0 : 8;
    const buttons = $('house-buttons');
    buttons.innerHTML = '';
    for (let k = 0; k < 7; k++) {
      const slot = base + k;
      const b = document.createElement('button');
      b.className = 'house-btn';
      b.textContent = `${k + 1}`;
      b.dataset.testid = `house-${k + 1}`;
      b.setAttribute('data-testid', `house-${k + 1}`);
      b.setAttribute('aria-label', `House ${k + 1}, ${state.slots[slot]} shells`);
      b.disabled = !playable.has(slot);
      b.onclick = () => void humanMove(slot);
      buttons.append(b);
    }
    const you = state.slots[storeOf(human)] as number;
    const them = state.slots[storeOf(human === 0 ? 1 : 0)] as number;
    $('score-you').textContent = String(you);
    $('score-bot').textContent = String(them);
    $('score-bot-name').textContent = botName();
    $('top-label').textContent =
      `${botName()} (${sideLetter(human === 0 ? 1 : 0)}) · store on the left`;
    $('bottom-label').textContent =
      `You (${sideLetter(human)}) · sow left to right into your store on the right`;
    $('blurb').textContent = opponent.blurb;
    $('seed').textContent = `Game seed ${seed} · bot spec ${opponent.spec}`;
    const rec = loadRecord()[opponent.id];
    $('record').textContent = rec
      ? `Your record vs ${botName()}: ${rec.w} W · ${rec.d} D · ${rec.l} L`
      : '';
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
    if (delay === 0) return;
    const slots = Array.from(before.slots);
    let hand = 0;
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

  async function play(house: number, who: string): Promise<MoveResult> {
    const my = token;
    const before = state;
    const r = applyMoveTraced(before, house);
    busy = true;
    frame = { ...frame, lastMove: house, playable: new Set() };
    await animate(before, r.events, my);
    if (my !== token) return r;
    state = r.state;
    frame = { ...blankFrame(state), lastMove: house };
    log = [...log, describeMove(before.ply + 1, before.toMove, who, house, r)];
    busy = false;
    refreshChrome();
    return r;
  }

  async function humanMove(house: number) {
    if (!humanTurn() || !isLegalMove(state, house)) return;
    await play(house, 'You');
    void next();
  }

  async function botTurn() {
    const my = token;
    busy = true;
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
      busy = false;
      await play(res.move, botName());
      void next();
    } catch (e) {
      if (my !== token) return;
      busy = false;
      status(`${botName()} could not move: ${(e as Error).message}.`);
      $('retry').hidden = false;
      refreshChrome();
    }
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
    const verdict = you > them ? 'You win' : you < them ? `${botName()} wins` : 'Draw';
    status(`${verdict}, ${you}–${them}. Shells left in a row go to that row's owner.`);
    const rec = loadRecord();
    const r = rec[opponent.id] ?? { w: 0, d: 0, l: 0 };
    if (you > them) r.w++;
    else if (you < them) r.l++;
    else r.d++;
    rec[opponent.id] = r;
    saveRecord(rec);
    refreshChrome();
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

  function newGame() {
    token++;
    worker.cancel();
    busy = false;
    human = Number($<HTMLSelectElement>('side').value) as Player;
    opponent = OPPONENTS.find((o) => o.id === $<HTMLSelectElement>('opponent').value) ?? opponent;
    seed = randomSeed();
    state = initialState();
    log = [];
    frame = blankFrame(state);
    $('insight').innerHTML = "<dt>Waiting for the bot's first move.</dt>";
    $('retry').hidden = true;
    resize();
    void next();
  }

  // Events.
  $('new-game').onclick = newGame;
  $('retry').onclick = () => void botTurn();
  $<HTMLSelectElement>('speed').onchange = (e) =>
    (speed = (e.target as HTMLSelectElement).value as Speed);
  $<HTMLSelectElement>('opponent').onchange = () => {
    opponent = OPPONENTS.find((o) => o.id === $<HTMLSelectElement>('opponent').value) ?? opponent;
    refreshChrome();
  };
  const toCanvas = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return hitTest(renderer.layout, e.clientX - rect.left, e.clientY - rect.top);
  };
  canvas.addEventListener('pointermove', (e) => {
    const h = toCanvas(e);
    const hover = h !== null && frame.playable.has(h) ? h : null;
    if (hover !== frame.hover) {
      frame = { ...frame, hover };
      canvas.style.cursor = hover !== null ? 'pointer' : 'default';
      draw();
    }
  });
  canvas.addEventListener('pointerleave', () => {
    frame = { ...frame, hover: null };
    draw();
  });
  canvas.addEventListener('click', (e) => {
    const h = toCanvas(e as PointerEvent);
    if (h !== null) void humanMove(h);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLSelectElement) return;
    const k = Number(e.key);
    if (k >= 1 && k <= 7) void humanMove((human === 0 ? 0 : 8) + k - 1);
    if (e.key === 'n' || e.key === 'N') newGame();
  };
  window.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  newGame();

  return () => {
    token++;
    worker.cancel();
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
  };
}
