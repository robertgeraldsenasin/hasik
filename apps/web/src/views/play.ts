/**
 * Play view: a human against one of the bots, plus the interactive tutorial.
 *
 * The game loop is a small state machine: human turn -> (animate) -> bot turn in
 * the worker -> (animate) -> ... The engine is the referee on this side too: a bot
 * move is checked for legality before it is applied, and the board scene only
 * ever animates a move the engine has already traced.
 *
 * Every piece of async work (an animation, a bot search, a hint) captures the
 * game `token` when it starts and stops if the token has changed by the time it
 * resumes. New game, undo, the tutorial and leaving the page all bump the token,
 * so stale work can never apply a move to the wrong game.
 */
import { LEVELS, MCTS_OPPONENT, WIN_SCORE } from '@hasik/bots';
import {
  type GameState,
  type Player,
  TOTAL_SHELLS,
  applyMove,
  applyMoveTraced,
  deriveSeed,
  encodePosition,
  finalScore,
  fromSlots,
  initialState,
  isLegalMove,
  legalMoves,
  storeOf,
} from '@hasik/engine';
import { createSound } from '../audio/sound';
import type { Orientation } from '../board/layout';
import { SPEEDS, SPEED_SCALE, type Speed, estimateMoveMs } from '../board/pacing';
import { BoardScene, type PreviewMarks } from '../board/scene';
import { LESSONS, lessonCopy } from '../game/lessons';
import {
  type LogEntry,
  describeMove,
  formatScore,
  houseNumber,
  shareText,
  shortScore,
  statsFor,
} from '../game/notation';
import { type MovePreview, previewMove } from '../game/preview';
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
import { ICONS, emblem, youMark } from '../ui/icons';
import { BotWorkerClient, CancelledError } from '../worker/client';
import { helpDialogHtml } from './help';

const SPEED_LABEL: Readonly<Record<Speed, string>> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
  instant: 'Instant',
};

/** Hint mode searches each legal move with a fixed node budget: deterministic and quick. */
const HINT_SPEC = 'minimax:nodes=30000';
const PLAY_URL = 'https://robertgeraldsenasin.github.io/hasik/';
const WIN_LINE = Math.floor(TOTAL_SHELLS / 2) + 1; // 50 of 98

interface Opponent {
  readonly id: string;
  readonly name: string;
  /** English gloss of the Tagalog name. */
  readonly meaning: string;
  readonly tier: string;
  readonly spec: string;
  readonly blurb: string;
  /** Difficulty 1-5; 0 for the bonus opponent. */
  readonly pips: number;
}

const MEANING: Readonly<Record<number, string>> = {
  1: 'the beginner',
  2: 'the greedy one',
  3: 'the clever one',
  4: 'the expert',
  5: 'the king',
};

const OPPONENTS: readonly Opponent[] = [
  ...LEVELS.map((l) => ({
    id: `level-${l.level}`,
    name: l.name,
    meaning: MEANING[l.level] ?? '',
    tier: `Level ${l.level}`,
    spec: l.spec,
    blurb: l.blurb,
    pips: l.level,
  })),
  {
    id: 'mcts',
    name: MCTS_OPPONENT.name,
    meaning: 'a different kind of AI',
    tier: 'Bonus',
    spec: MCTS_OPPONENT.spec,
    blurb: MCTS_OPPONENT.blurb,
    pips: 0,
  },
];
const OPPONENT_IDS = OPPONENTS.map((o) => o.id);

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface PlayOptions {
  /** Start straight into the tutorial (the #/learn route). */
  readonly tutorial?: boolean;
}

export function mountPlay(root: HTMLElement, opts: PlayOptions = {}): () => void {
  // ---- Settings: saved values, then URL overrides (?level=4&anim=instant).
  const defaults: Settings = {
    opponentId: 'level-3',
    human: 0,
    speed: reducedMotion() ? 'fast' : 'normal',
    sound: true,
    seenHelp: false,
    view: 'tilt',
  };
  let settings = parseSettings(store.get(KEYS.settings), defaults, OPPONENT_IDS, [...SPEEDS]);
  const params = new URLSearchParams(location.search);
  const urlLevel = params.get('level');
  if (urlLevel && OPPONENT_IDS.includes(`level-${urlLevel}`))
    settings = { ...settings, opponentId: `level-${urlLevel}` };
  const urlAnim = params.get('anim');
  if (urlAnim && (SPEEDS as readonly string[]).includes(urlAnim))
    settings = { ...settings, speed: urlAnim };

  root.innerHTML = template();

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const canvas = $<HTMLCanvasElement>('board');
  const scene = new BoardScene(canvas);
  const worker = new BotWorkerClient();
  const sound = createSound(settings.sound);
  const wrap = $('board-wrap');
  const stage = $('board-stage');
  const help = $<HTMLDialogElement>('help');
  const setup = $<HTMLDialogElement>('setup');
  const result = $<HTMLDialogElement>('result');
  scene.reducedMotion = reducedMotion();
  scene.view = settings.view;
  scene.onLand = (kind, step) => sound.land(kind, step);
  scene.onScoop = (relay) => sound.scoop(relay);
  scene.onCapture = (n) => sound.capture(n);
  scene.onCounts = (counts) => updateScores(counts);

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
  let hover: number | null = null;
  let armed = false;
  let lastPointer = coarsePointer() ? 'touch' : 'mouse';
  let shownScores = { you: -1, bot: -1 };

  // Tutorial state.
  let lesson = -1; // -1: playing a real game
  let lessonState: GameState = initialState();
  let lessonPlayed = false;

  const inLesson = () => lesson >= 0;
  const current = () => (inLesson() ? lessonState : state);
  const me = (): Player => (inLesson() ? 0 : human);
  const botName = () => opponent.name;
  const base = () => (me() === 0 ? 0 : 8);
  const humanTurn = () => {
    if (inLesson()) return !lessonPlayed && !busy;
    return !state.over && state.toMove === human && !busy;
  };
  const playableNow = (): Set<number> => {
    if (!humanTurn()) return new Set();
    if (inLesson()) return new Set([LESSONS[lesson]!.house]);
    return new Set(legalMoves(state));
  };
  const status = (text: string) => ($('status').textContent = text);

  function saveSettings() {
    settings = {
      opponentId: opponent.id,
      human,
      speed,
      sound: sound.enabled,
      seenHelp: settings.seenHelp,
      view: scene.view,
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

  /** Short-lived text over the board. `banner` is the big one for extra turns. */
  function toast(text: string, tone: 'you' | 'bot' | 'plain' = 'plain', banner?: string) {
    const box = $('toasts');
    // One banner at a time, and never a pile of toasts: chains of extra turns stay readable.
    if (banner) box.querySelectorAll('.banner').forEach((e) => e.remove());
    while (box.children.length >= 2) box.firstElementChild!.remove();
    const el = document.createElement('div');
    el.className = `toast ${tone}${banner ? ' banner' : ''}`;
    if (banner) {
      const big = document.createElement('strong');
      big.lang = 'tl';
      big.textContent = text;
      const small = document.createElement('span');
      small.textContent = banner;
      el.append(big, small);
    } else el.textContent = text;
    box.append(el);
    window.setTimeout(() => el.remove(), banner ? 1500 : 1900);
  }

  // ---- House buttons sit exactly over the pits on the canvas. They are the real
  // targets for mouse, touch, keyboard, screen readers and tests.
  const buttons: HTMLButtonElement[] = [];
  for (let k = 0; k < 7; k++) {
    const b = document.createElement('button');
    b.className = 'house-btn';
    b.type = 'button';
    b.setAttribute('data-testid', `house-${k + 1}`);
    b.setAttribute('aria-keyshortcuts', String(k + 1));
    b.addEventListener('pointerdown', (e) => (lastPointer = e.pointerType || 'mouse'));
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch' && !armed) setHover(base() + k);
    });
    b.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch' && !armed) setHover(null);
    });
    b.addEventListener('focus', () => {
      if (!armed) setHover(base() + k);
    });
    b.addEventListener('blur', () => {
      if (!armed) setHover(null);
    });
    b.addEventListener('click', (e) => {
      const slot = base() + k;
      // Touch has no hover, so the first tap aims (showing where the move ends)
      // and a second tap on the same house sows. Mouse and keyboard sow at once.
      const touch = lastPointer === 'touch' && e.detail > 0;
      if (touch && !(armed && hover === slot)) {
        if (!playableNow().has(slot)) return;
        armed = true;
        sound.tap();
        setHover(slot);
        return;
      }
      void humanMove(slot);
    });
    buttons.push(b);
    $('house-buttons').append(b);
  }

  function chipFor(p: MovePreview): string | null {
    if (p.endsGame) return 'Ends the game';
    if (p.captured > 0) return `Kain +${p.captured}`;
    if (p.extraTurn) return 'Isa pa!';
    if (p.relays > 0) return `Tuloy ×${p.relays}`;
    return null;
  }

  function setHover(slot: number | null) {
    const ok = slot !== null && humanTurn() && playableNow().has(slot);
    hover = ok ? slot : null;
    if (!ok) armed = false;
    const p = hover !== null ? previewMove(current(), hover) : null;
    const marks: PreviewMarks | null = p
      ? {
          path: p.path,
          relaySlots: p.relaySlots,
          landing: p.landing,
          chip: chipFor(p),
          store: storeOf(me()),
          storeGain: p.storeGain,
        }
      : null;
    scene.setMarks({ hover, armed, preview: marks });
    renderPreview(p);
  }

  function renderPreview(p: MovePreview | null) {
    const el = $('preview');
    if (p) {
      const bits = p.text.split(' · ');
      el.innerHTML =
        bits.map((b, i) => `<span class="${i === 0 ? 'lead' : 'tag'}">${esc(b)}</span>`).join('') +
        (armed ? '<span class="confirm">Tap again to sow</span>' : '');
      return;
    }
    el.textContent = humanTurn()
      ? lastPointer === 'touch'
        ? 'Tap a house to see where it ends, then tap it again to sow.'
        : 'Point at a house to see where its last shell lands.'
      : '';
  }

  function updateScores(counts: readonly number[]) {
    const you = counts[storeOf(me())]!;
    const bot = counts[storeOf(me() === 0 ? 1 : 0)]!;
    const bump = (id: string, v: number, prev: number) => {
      const el = $(id);
      el.textContent = String(v);
      if (prev >= 0 && v !== prev && !scene.reducedMotion) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    };
    bump('score-you', you, shownScores.you);
    bump('score-bot', bot, shownScores.bot);
    shownScores = { you, bot };
    const board = TOTAL_SHELLS - you - bot;
    const pct = (n: number) => `${((n / TOTAL_SHELLS) * 100).toFixed(2)}%`;
    $('t-you').style.width = pct(you);
    $('t-board').style.width = pct(board);
    $('t-bot').style.width = pct(bot);
    const note = $('tally-note');
    if (you >= WIN_LINE) note.textContent = `${you} banked. Nobody can catch you now.`;
    else if (bot >= WIN_LINE)
      note.textContent = `${botName()} has ${bot} banked, past the halfway line.`;
    else
      note.textContent = `First to ${WIN_LINE} wins. You need ${WIN_LINE - you} more, ${botName()} needs ${WIN_LINE - bot}.`;
  }

  function refreshChrome() {
    const mine = humanTurn();
    const playable = playableNow();
    if (!mine) {
      hover = null;
      armed = false;
    }
    scene.setMarks({
      playable,
      ...(mine ? {} : { hover: null, armed: false, preview: null }),
      thinking: thinking ? (human === 0 ? 1 : 0) : null,
      coach: inLesson() && !lessonPlayed && !busy ? LESSONS[lesson]!.house : null,
    });
    const s = current();
    buttons.forEach((b, k) => {
      const slot = base() + k;
      const n = s.slots[slot] as number;
      b.disabled = !playable.has(slot);
      b.setAttribute('aria-label', `House ${k + 1}, ${n} shell${n === 1 ? '' : 's'}`);
    });

    // Seats.
    const botToMove = !inLesson() && !state.over && state.toMove !== human;
    $('seat-near').classList.toggle('turn', mine);
    $('seat-far').classList.toggle('turn', botToMove);
    $('seat-far').classList.toggle('thinking', thinking);
    $('far-emblem').innerHTML = inLesson() ? emblem('level-1') : emblem(opponent.id);
    $('far-name').textContent = inLesson() ? 'Practice board' : botName();
    $('far-sub').textContent = inLesson()
      ? 'Lessons are never counted'
      : `${opponent.tier}, ${opponent.meaning}`;
    $('near-sub').textContent = inLesson()
      ? 'Learning the moves'
      : human === 0
        ? 'You move first'
        : 'You move second';
    $('far-state').textContent = thinking ? 'Thinking' : botToMove ? 'Its move' : '';
    const extra = log.length > 0 && log[log.length - 1]!.mover === human;
    $('near-state').textContent = mine
      ? inLesson()
        ? 'Your move'
        : extra
          ? 'Isa pa! Go again'
          : 'Your move'
      : '';

    // Dock.
    $<HTMLButtonElement>('hint').disabled = inLesson() || !mine || hinting;
    $<HTMLButtonElement>('undo').disabled = inLesson() || undoTarget(positions, human) === null;
    $('speed-label').textContent = SPEED_LABEL[speed];
    const tilted = scene.view === 'tilt';
    $('view').innerHTML =
      `${tilted ? ICONS.viewTilt : ICONS.viewFlat}<span>${tilted ? '2.5D' : 'Flat'}</span><kbd>V</kbd>`;
    $('view').setAttribute(
      'aria-label',
      tilted ? 'Board view: 2.5D table. Switch to flat' : 'Board view: flat. Switch to 2.5D table',
    );
    $('speed').setAttribute('aria-label', `Animation speed: ${SPEED_LABEL[speed]}`);
    $('sound').setAttribute('aria-pressed', String(sound.enabled));
    $('sound').innerHTML =
      `${sound.enabled ? ICONS.soundOn : ICONS.soundOff}<span>Sound</span><kbd>M</kbd>`;
    root.querySelector('.play')!.classList.toggle('lesson', inLesson());

    if (hover === null) renderPreview(null);

    // Match details.
    const book = parseRecord(store.get(KEYS.record));
    const rec = book[opponent.id];
    $('record').textContent = rec
      ? `Your record against ${botName()}: ${rec.w} won, ${rec.d} drawn, ${rec.l} lost${rec.streak > 1 ? `, ${rec.streak} wins in a row` : ''}.`
      : `No games against ${botName()} yet. Games where you use a hint or undo aren't counted.`;
    $('seed').textContent = `Game seed ${seed}, bot spec ${opponent.spec}`;
    const logEl = $('log');
    logEl.innerHTML = log
      .map((e) => {
        const [code, ...rest] = e.text.split(' · ');
        return `<li class="${e.mover === human ? 'you' : 'bot'}"><span>${esc(e.who)}</span> <b>${esc(code ?? '')}</b>${rest
          .map((t) => ` <em>${esc(t)}</em>`)
          .join('')}</li>`;
      })
      .join('');
    logEl.scrollTop = logEl.scrollHeight;
    updateScores(Array.from(current().slots));
  }

  // ---- Board size, orientation and camera.
  function placeButtons() {
    const { width, height } = scene.canvasSize;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    buttons.forEach((b, k) => {
      const box = scene.pitBox(base() + k);
      const w = Math.max(44, Math.round(box.w + 8));
      const h = Math.max(44, Math.round(box.h + 8));
      b.style.left = `${Math.round(box.x + box.w / 2 - w / 2)}px`;
      b.style.top = `${Math.round(box.y + box.h / 2 - h / 2)}px`;
      b.style.width = `${w}px`;
      b.style.height = `${h}px`;
    });
  }
  scene.onProjection = placeButtons;

  let lastSize = '';
  /** Fit the board to the page. `sweep` swings the camera down onto the table. */
  function resize(force = false, sweep = false) {
    const w = wrap.clientWidth;
    if (w <= 0) return;
    const portrait = w < 560 && window.innerHeight > window.innerWidth * 1.1;
    const orientation: Orientation = portrait ? 'portrait' : 'landscape';
    const width = portrait ? Math.min(w, 440) : Math.min(w, 1000);
    const maxH = portrait ? Math.max(420, window.innerHeight - 330) : undefined;
    const key = `${width}|${orientation}|${maxH}|${me()}`;
    if (!force && key === lastSize) return;
    lastSize = key;
    scene.human = me();
    scene.resize(width, orientation, maxH, sweep && speed !== 'instant');
    root.querySelector('.play')!.classList.toggle('portrait', portrait);
    if (!scene.animating) scene.setCounts(current().slots);
  }

  /** Play one move with animation. Returns false if the game changed underneath it. */
  async function play(house: number, who: string): Promise<boolean> {
    const my = token;
    const before = state;
    const r = applyMoveTraced(before, house);
    busy = true;
    hover = null;
    armed = false;
    scene.setMarks({
      lastMove: { slot: house, player: before.toMove },
      playable: new Set(),
      preview: null,
      hover: null,
      hints: new Map(),
    });
    refreshChrome();
    const scale = SPEED_SCALE[speed];
    const mineMove = before.toMove === human;
    if (scale > 0) {
      const drops = r.events.filter((e) => e.kind === 'drop').length;
      const relays = r.events.filter((e) => e.kind === 'pickup' && e.relay).length;
      $('skip-hint').hidden = estimateMoveMs(drops, relays, scale) < 1600;
      const ok = await scene.playMove(before, r.events, scale);
      $('skip-hint').hidden = true;
      if (!ok || my !== token) return false;
    } else {
      sound.land('house', 0);
    }
    if (my !== token) return false;
    state = r.state;
    moves = [...moves, house];
    positions = [...positions, state];
    scene.setCounts(state.slots);
    const entry = describeMove(before.ply + 1, before.toMove, who, house, r);
    log = [...log, entry];
    if (entry.captured > 0 && scale === 0) {
      sound.capture(entry.captured);
      scene.float(storeOf(before.toMove), `Kain +${entry.captured}`, scene.colorOf(before.toMove));
    }
    if (entry.captured > 0 && !mineMove) toast(`${who} captured ${entry.captured}`, 'bot');
    if (entry.extraTurn) {
      sound.extraTurn();
      toast(
        'Isa pa!',
        mineMove ? 'you' : 'bot',
        mineMove ? 'Extra turn, go again' : `${who} goes again`,
      );
    }
    busy = false;
    saveGame();
    refreshChrome();
    return true;
  }

  async function humanMove(house: number) {
    if (inLesson()) return void lessonMove(house);
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
      status(`${botName()} sows from its house ${houseNumber(res.move)}.`);
      refreshChrome();
      const scale = SPEED_SCALE[speed];
      if (scale > 0 && !(await scene.telegraph(res.move, 380 * scale))) return;
      if (my !== token) return;
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
    if (inLesson() || !humanTurn() || hinting) return;
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
      scene.setMarks({
        hints: new Map(
          res.moves.map((m) => [
            m.move,
            { label: shortScore(m.score), best: m.score === best.score },
          ]),
        ),
      });
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
    if (inLesson()) return;
    const i = undoTarget(positions, human);
    if (i === null) return;
    token++;
    worker.cancel();
    scene.cancel();
    busy = thinking = hinting = false;
    moves = moves.slice(0, i);
    positions = positions.slice(0, i + 1);
    log = log.slice(0, i);
    state = positions[i]!;
    assisted = true;
    scene.setCounts(state.slots);
    scene.setMarks({
      lastMove:
        moves.length > 0
          ? { slot: moves[moves.length - 1]!, player: positions[i - 1]!.toMove }
          : null,
      hints: new Map(),
    });
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
        kind === 'mcts' ? 'Playouts' : 'Positions',
        r.nodes !== undefined ? r.nodes.toLocaleString() : '–',
      ],
      ['Speed', nps ? `${nps.toLocaleString()} per second` : '–'],
      ['Think time', `${r.ms.toFixed(0)} ms`],
      ['Expected line', pv || '–'],
    ];
    $('insight').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    // Who the bot thinks is ahead, from the player's side: 50% is even.
    let lean = 0.5;
    let words = 'It sees an even game.';
    if (r.score !== undefined && kind === 'minimax') {
      const mine = -r.score;
      if (Math.abs(mine) >= WIN_SCORE) {
        lean = mine > 0 ? 1 : 0;
        words = mine > 0 ? 'It sees a forced win for you.' : 'It sees a forced win for itself.';
      } else {
        lean = 0.5 + 0.5 * Math.tanh(mine / 1000);
        const shells = Math.abs(mine / 100).toFixed(1);
        if (Math.abs(mine) >= 50)
          words =
            mine > 0
              ? `It thinks you are ahead by about ${shells}.`
              : `It thinks it is ahead by about ${shells}.`;
      }
    } else if (r.score !== undefined && kind === 'mcts') {
      lean = 1 - r.score / 100;
      words = `It gives you a ${Math.round(lean * 100)}% chance.`;
    } else if (kind === 'other') {
      words = opponent.spec.startsWith('random')
        ? `${botName()} picks a move at random. It doesn't look ahead at all.`
        : `${botName()} grabs the most it can this turn and never looks further.`;
    }
    $('eval-fill').style.width = `${(lean * 100).toFixed(1)}%`;
    $('eval-words').textContent = words;
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
    scene.setCounts(state.slots);
    sound.end(outcome);
    refreshChrome();
    openResult(outcome, you, them);
  }

  function openResult(outcome: Outcome, you: number, them: number) {
    result.dataset.outcome = outcome;
    $('r-kicker').textContent =
      outcome === 'win' ? 'Panalo!' : outcome === 'draw' ? 'Tabla' : 'Talo';
    $('r-title').textContent =
      outcome === 'win'
        ? `You beat ${botName()}`
        : outcome === 'draw'
          ? `A draw with ${botName()}`
          : `${botName()} wins this one`;
    $('r-you').textContent = String(you);
    $('r-them').textContent = String(them);
    $('r-them-name').textContent = botName();
    const sy = statsFor(log, human);
    const sb = statsFor(log, human === 0 ? 1 : 0);
    $('r-stats').innerHTML = `
      <thead><tr><th><span class="sr-only">Statistic</span></th><th>You</th><th>${esc(botName())}</th></tr></thead>
      <tbody>
        <tr><th>Shells captured</th><td>${sy.captured}</td><td>${sb.captured}</td></tr>
        <tr><th>Extra turns</th><td>${sy.extraTurns}</td><td>${sb.extraTurns}</td></tr>
        <tr><th>Longest move, in drops</th><td>${sy.longestMove}</td><td>${sb.longestMove}</td></tr>
      </tbody>`;
    const rec = parseRecord(store.get(KEYS.record))[opponent.id];
    $('r-note').textContent = assisted
      ? 'You used a hint or undo, so this game is not counted in your record.'
      : rec
        ? `Record against ${botName()}: ${rec.w} won, ${rec.d} drawn, ${rec.l} lost${rec.streak > 1 ? `, ${rec.streak} wins in a row` : ''}.`
        : '';
    const idx = OPPONENTS.findIndex((o) => o.id === opponent.id);
    const nextOpp = outcome === 'win' ? OPPONENTS[idx + 1] : undefined;
    const nextBtn = $<HTMLButtonElement>('r-next');
    nextBtn.hidden = !nextOpp;
    if (nextOpp) {
      nextBtn.textContent = `Take on ${nextOpp.name}`;
      nextBtn.onclick = () => {
        result.close();
        newGame(nextOpp.id, human);
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
          .then(() => (copyBtn.textContent = 'Copied'), fallback);
      } catch {
        fallback();
      }
    };
    const burst = $('r-burst');
    burst.innerHTML =
      outcome === 'win' && !reducedMotion()
        ? Array.from(
            { length: 22 },
            (_, i) =>
              `<i style="--x:${(i * 53) % 100}%;--d:${(i % 7) * 0.07}s;--r:${(i * 47) % 360}deg"></i>`,
          ).join('')
        : '';
    if (typeof result.showModal === 'function' && !result.open) result.showModal();
    $<HTMLButtonElement>('r-again').focus();
  }

  async function next() {
    if (inLesson()) return;
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
    scene.cancel();
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
    scene.setMarks({
      lastMove:
        moves.length > 0
          ? { slot: moves[moves.length - 1]!, player: positions[moves.length - 1]!.toMove }
          : null,
      hints: new Map(),
      preview: null,
      hover: null,
      telegraph: null,
    });
    $('insight').innerHTML = '<dt>Bot</dt><dd>Waiting for its first move.</dd>';
    $('eval-fill').style.width = '50%';
    $('eval-words').textContent = 'It has not searched yet.';
    $('retry').hidden = true;
    if (result.open) result.close();
    shownScores = { you: -1, bot: -1 };
    resize(true, true);
  }

  function newGame(opponentId = opponent.id, side: Player = human) {
    opponent = OPPONENTS.find((o) => o.id === opponentId) ?? opponent;
    startFrom({
      seed: randomSeed(),
      human: side,
      moves: [],
      positions: [initialState()],
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
    startFrom({ ...saved, positions: replayed });
    if (saved.moves.length > 0) toast('Welcome back! Your game was restored.');
    void next();
    return true;
  }

  // ---- Tutorial.
  function startTutorial() {
    token++;
    worker.cancel();
    scene.cancel();
    busy = thinking = hinting = false;
    if (result.open) result.close();
    lesson = 0;
    showLesson();
  }

  function showLesson() {
    const L = LESSONS[lesson]!;
    lessonState = fromSlots(L.slots, 0);
    lessonPlayed = false;
    hover = null;
    armed = false;
    scene.setMarks({
      lastMove: null,
      hints: new Map(),
      preview: null,
      hover: null,
      telegraph: null,
    });
    resize(true);
    $('coach').hidden = false;
    $('coach-step').innerHTML = LESSONS.map(
      (_, i) => `<i class="${i < lesson ? 'done' : i === lesson ? 'now' : ''}"></i>`,
    ).join('');
    $('coach-step').setAttribute('aria-label', `Lesson ${lesson + 1} of ${LESSONS.length}`);
    $('coach-word').textContent = L.word;
    $('coach-title').textContent = L.title;
    const prompt = lessonCopy(L.prompt, scene.layout.orientation);
    $('coach-text').textContent = prompt;
    $('coach-next').hidden = true;
    $('coach-replay').hidden = true;
    status(`Lesson ${lesson + 1} of ${LESSONS.length}: ${L.title}. ${prompt}`);
    refreshChrome();
  }

  async function lessonMove(house: number) {
    const L = LESSONS[lesson];
    if (!L || lessonPlayed || busy || house !== L.house) return;
    const my = token;
    lessonPlayed = true;
    busy = true;
    hover = null;
    armed = false;
    scene.setMarks({
      preview: null,
      hover: null,
      coach: null,
      playable: new Set(),
      lastMove: { slot: house, player: 0 },
    });
    refreshChrome();
    const before = lessonState;
    const r = applyMoveTraced(before, house);
    // Lessons never run faster than normal speed, so there is something to watch.
    const scale = Math.max(SPEED_SCALE[speed], 1.15);
    const ok = await scene.playMove(before, r.events, scale);
    if (!ok || my !== token) return;
    lessonState = r.state;
    scene.setCounts(lessonState.slots);
    busy = false;
    if (r.extraTurn && !r.state.over) {
      sound.extraTurn();
      toast('Isa pa!', 'you', 'Extra turn, go again');
    }
    if (r.state.over) sound.end('win');
    const last = lesson === LESSONS.length - 1;
    const debrief = lessonCopy(L.debrief, scene.layout.orientation);
    $('coach-text').textContent = debrief;
    $('coach-next').textContent = last ? 'Play a real game' : 'Next lesson';
    $('coach-next').hidden = false;
    $('coach-replay').hidden = false;
    status(debrief);
    refreshChrome();
    $('coach-next').focus();
  }

  function endTutorial(completed: boolean) {
    lesson = -1;
    if (location.hash.startsWith('#/learn')) {
      // Leave the tutorial URL without remounting the page.
      history.replaceState(null, '', '#/play');
      document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((a) => {
        a.toggleAttribute('aria-current', a.dataset.page === 'play');
      });
    }
    $('coach').hidden = true;
    token++;
    scene.cancel();
    busy = false;
    if (!resume()) newGame();
    if (completed) openSetup('level-2');
  }

  // ---- Opponent picker.
  function openSetup(suggest?: string) {
    const pick = suggest ?? opponent.id;
    const book = parseRecord(store.get(KEYS.record));
    for (const input of Array.from(setup.querySelectorAll<HTMLInputElement>('input[name="opp"]'))) {
      input.checked = input.value === pick;
      const rec = book[input.value];
      const el = setup.querySelector<HTMLElement>(`[data-rec="${input.value}"]`)!;
      el.textContent = rec && rec.w + rec.d + rec.l > 0 ? `${rec.w}–${rec.d}–${rec.l}` : '';
      el.title = rec ? `${rec.w} won, ${rec.d} drawn, ${rec.l} lost` : '';
      el.classList.toggle('beaten', (rec?.w ?? 0) > 0);
    }
    for (const input of Array.from(setup.querySelectorAll<HTMLInputElement>('input[name="side"]')))
      input.checked = input.value === String(human);
    if (typeof setup.showModal === 'function' && !setup.open) setup.showModal();
    setup.querySelector<HTMLButtonElement>('[data-testid="start-game"]')!.focus();
  }
  setup.addEventListener('close', () => {
    if (setup.returnValue !== 'start') return;
    const opp =
      setup.querySelector<HTMLInputElement>('input[name="opp"]:checked')?.value ?? opponent.id;
    const side =
      setup.querySelector<HTMLInputElement>('input[name="side"]:checked')?.value === '1' ? 1 : 0;
    if (inLesson()) {
      lesson = -1;
      $('coach').hidden = true;
    }
    newGame(opp, side);
  });

  function openHelp() {
    // First visit: the tutorial is the main way in. Later: the card is a quick reference.
    const first = !settings.seenHelp;
    const teach = help.querySelector<HTMLButtonElement>('[value="tutorial"]')!;
    const ok = $<HTMLButtonElement>('help-ok');
    teach.classList.toggle('primary', first);
    ok.classList.toggle('primary', !first);
    ok.textContent = first ? 'Start playing' : 'Back to the game';
    if (typeof help.showModal === 'function' && !help.open) help.showModal();
    (first ? teach : ok).focus();
  }
  help.addEventListener('close', () => {
    if (!settings.seenHelp) {
      settings = { ...settings, seenHelp: true };
      saveSettings();
    }
    if (help.returnValue === 'tutorial') startTutorial();
  });

  function toggleSound() {
    sound.enabled = !sound.enabled;
    saveSettings();
    refreshChrome();
    toast(sound.enabled ? 'Sound on' : 'Sound off');
  }

  function toggleView() {
    scene.setView(scene.view === 'tilt' ? 'flat' : 'tilt');
    saveSettings();
    refreshChrome();
  }

  function cycleSpeed() {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    saveSettings();
    refreshChrome();
  }

  // ---- Events.
  $('new-game').onclick = () => openSetup();
  $('help-btn').onclick = openHelp;
  $('hint').onclick = () => void hint();
  $('undo').onclick = undo;
  $('retry').onclick = () => void botTurn();
  $('speed').onclick = cycleSpeed;
  $('view').onclick = toggleView;
  $('sound').onclick = toggleSound;
  $('coach-skip').onclick = () => endTutorial(false);
  $('coach-replay').onclick = () => {
    token++;
    scene.cancel();
    busy = false;
    showLesson();
  };
  $('coach-next').onclick = () => {
    if (lesson >= LESSONS.length - 1) endTutorial(true);
    else {
      lesson++;
      showLesson();
    }
  };
  $('r-again').onclick = () => {
    result.close();
    newGame();
  };
  $('r-change').onclick = () => {
    result.close();
    openSetup();
  };
  $('r-close').onclick = () => result.close();
  // Tapping the board (not a house) fast-forwards an animation or cancels a first tap.
  wrap.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.house-btn')) return;
    lastPointer = e.pointerType || 'mouse';
    if (scene.animating) scene.fastForward();
    else if (armed) setHover(null);
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
    lastPointer = 'keyboard';
    const k = Number(e.key);
    if (k >= 1 && k <= 7) {
      void humanMove(base() + k - 1);
      return;
    }
    switch (e.key) {
      case ' ':
        if (scene.animating) {
          e.preventDefault();
          scene.fastForward();
        }
        break;
      case 'n':
      case 'N':
        openSetup();
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
      case 'v':
      case 'V':
        toggleView();
        break;
      case '?':
        openHelp();
        break;
      case 'Escape':
        if (armed) setHover(null);
        break;
    }
  };
  window.addEventListener('keydown', onKey);
  const onWindowResize = () => resize();
  window.addEventListener('resize', onWindowResize);
  // Resizing changes the board's height, which the observer would see again in the same
  // frame; doing the work in the next frame keeps the observer out of a loop.
  let resizeFrame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => resize());
  });
  ro.observe(wrap);

  if (!resume()) newGame();
  if (opts.tutorial) startTutorial();
  else if (!settings.seenHelp) openHelp();

  return () => {
    token++;
    worker.cancel();
    scene.destroy();
    ro.disconnect();
    cancelAnimationFrame(resizeFrame);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onWindowResize);
  };
}

function template(): string {
  const pips = (n: number) =>
    n === 0
      ? '<span class="pips bonus" aria-label="Bonus opponent">Bonus</span>'
      : `<span class="pips" aria-label="Difficulty ${n} of 5">${Array.from(
          { length: 5 },
          (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`,
        ).join('')}</span>`;
  return `
  <section class="play">
    <h1 class="sr-only">Play Sungka against Hasik's bots</h1>
    <div class="arena">
      <div class="seat seat-far" id="seat-far">
        <span class="emblem" id="far-emblem"></span>
        <span class="seat-id"><strong id="far-name"></strong><span id="far-sub"></span></span>
        <span class="seat-state" id="far-state"></span>
        <span class="seat-score bot"><output id="score-bot">0</output><small>banked</small></span>
      </div>
      <div class="board-wrap" id="board-wrap">
        <div class="board-stage" id="board-stage">
          <canvas id="board" aria-hidden="true"></canvas>
          <div class="houses" role="group" aria-label="Your houses, in sowing order" id="house-buttons"></div>
          <div class="toasts" id="toasts" aria-hidden="true"></div>
          <p class="skip-hint" id="skip-hint" hidden>Tap the board or press Space to skip ahead</p>
        </div>
      </div>
      <div class="seat seat-near" id="seat-near">
        <span class="emblem you">${youMark()}</span>
        <span class="seat-id"><strong>You</strong><span id="near-sub"></span></span>
        <span class="seat-state" id="near-state"></span>
        <span class="seat-score you"><output id="score-you">0</output><small>banked</small></span>
      </div>
      <div class="coach" id="coach" hidden>
        <p class="coach-step" id="coach-step" role="img"></p>
        <h2 class="coach-word"><span lang="tl" id="coach-word"></span> <small id="coach-title"></small></h2>
        <p class="coach-text" id="coach-text"></p>
        <div class="coach-actions">
          <button class="btn quiet" id="coach-skip" type="button">Skip tutorial</button>
          <button class="btn" id="coach-replay" type="button" hidden>Try it again</button>
          <button class="btn primary" id="coach-next" type="button" hidden>Next lesson</button>
        </div>
      </div>
      <div class="tally" aria-hidden="true">
        <div class="tally-bar">
          <i class="t-you" id="t-you"></i><i class="t-board" id="t-board"></i><i class="t-bot" id="t-bot"></i>
          <b class="t-line t-line-you"></b><b class="t-line t-line-bot"></b>
        </div>
        <p class="tally-note" id="tally-note"></p>
      </div>
      <p id="status" class="status" role="status" aria-live="polite" data-testid="status"></p>
      <p id="preview" class="preview" data-testid="preview"></p>
      <div class="dock" role="toolbar" aria-label="Game actions">
        <button id="hint" class="tool" type="button" data-testid="hint" aria-keyshortcuts="h">${ICONS.hint}<span>Hint</span><kbd>H</kbd></button>
        <button id="undo" class="tool" type="button" data-testid="undo" aria-keyshortcuts="u">${ICONS.undo}<span>Undo</span><kbd>U</kbd></button>
        <button id="retry" class="tool warn" type="button" hidden>${ICONS.retry}<span>Retry bot move</span></button>
        <span class="dock-gap"></span>
        <button id="speed" class="tool" type="button" data-testid="speed">${ICONS.speed}<span id="speed-label">Normal</span></button>
        <button id="view" class="tool" type="button" data-testid="view" aria-keyshortcuts="v"></button>
        <button id="sound" class="tool" type="button" data-testid="sound" aria-keyshortcuts="m" aria-pressed="true"></button>
        <button id="help-btn" class="tool" type="button" data-testid="help" aria-keyshortcuts="?">${ICONS.rules}<span>Rules</span><kbd>?</kbd></button>
        <button id="new-game" class="tool primary" type="button" data-testid="new-game" aria-keyshortcuts="n">${ICONS.newGame}<span>New game</span><kbd>N</kbd></button>
      </div>
    </div>
    <aside class="rail" aria-label="Match details">
      <section>
        <h2>Moves</h2>
        <ol class="log" id="log" data-testid="move-log"></ol>
      </section>
      <section>
        <h2>What the bot sees</h2>
        <div class="lean" aria-hidden="true"><span>Bot</span><div class="lean-bar"><i id="eval-fill"></i></div><span>You</span></div>
        <p class="lean-words" id="eval-words"></p>
        <dl id="insight"><dt>Bot</dt><dd>Waiting for its first move.</dd></dl>
      </section>
      <section class="rail-foot">
        <p class="record" id="record" data-testid="record"></p>
        <p class="seed" id="seed"></p>
      </section>
    </aside>
    ${helpDialogHtml()}
    <dialog id="setup" class="dialog setup" aria-labelledby="setup-title">
      <form method="dialog">
        <h2 id="setup-title">Choose your opponent</h2>
        <p class="muted">Each one looks further ahead than the one before. Start with Baguhan and work your way up to Hari.</p>
        <fieldset class="opponents">
          <legend class="sr-only">Opponent</legend>
          ${OPPONENTS.map(
            (o) => `<label class="opp" data-testid="opp-${o.id}">
              <input type="radio" name="opp" value="${o.id}" />
              <span class="opp-emblem">${emblem(o.id, 30)}</span>
              <span class="opp-text"><strong lang="tl">${esc(o.name)}</strong> <span class="opp-gloss">${esc(o.meaning)}</span><small>${esc(o.blurb)}</small></span>
              ${pips(o.pips)}
              <span class="opp-record" data-rec="${o.id}"></span>
            </label>`,
          ).join('')}
        </fieldset>
        <fieldset class="sides">
          <legend>Who sows first</legend>
          <label data-testid="you-first"><input type="radio" name="side" value="0" /> <span>You</span></label>
          <label data-testid="bot-first"><input type="radio" name="side" value="1" /> <span>The bot</span></label>
        </fieldset>
        <div class="setup-actions">
          <button class="btn quiet" value="cancel">Cancel</button>
          <button class="btn primary" value="start" data-testid="start-game">Start game</button>
        </div>
      </form>
    </dialog>
    <dialog id="result" class="dialog result" data-testid="result" aria-labelledby="r-title">
      <div class="burst" id="r-burst" aria-hidden="true"></div>
      <p class="kicker" lang="tl" id="r-kicker"></p>
      <h2 id="r-title"></h2>
      <p class="final"><span class="fy"><b id="r-you"></b><small>You</small></span><span class="fx">to</span><span class="ft"><b id="r-them"></b><small id="r-them-name"></small></span></p>
      <table class="result-stats" id="r-stats"></table>
      <p class="muted small" id="r-note"></p>
      <div class="result-actions">
        <button id="r-again" class="btn primary" type="button">Rematch</button>
        <button id="r-next" class="btn" type="button" hidden></button>
        <button id="r-change" class="btn" type="button">Change opponent</button>
        <button id="r-copy" class="btn" type="button">Copy result</button>
      </div>
      <button id="r-close" class="icon-close" type="button" aria-label="Close">${ICONS.close}</button>
    </dialog>
  </section>`;
}
