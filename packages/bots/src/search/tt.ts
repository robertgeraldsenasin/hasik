/**
 * Transposition table: a fixed-size hash table of search results keyed by the
 * Zobrist hash. When the search reaches a position it has already searched (by
 * another move order), it can reuse the result or at least the best move.
 *
 * Layout: structure-of-arrays (one typed array per field) so the table is a few
 * flat buffers with no per-entry objects and no GC pressure.
 *
 * Replacement: two-tier buckets. Slot 0 keeps the deepest result (expensive to
 * recompute); slot 1 is always replaced (keeps recent results). ADR-0002.
 *
 * Generations: newSearch() bumps a generation byte instead of clearing memory.
 * Entries from older generations count as empty, so every move starts from a
 * clean table in O(1). That makes "same position + same limits = same move" hold.
 */

export const Bound = { None: 0, Exact: 1, Lower: 2, Upper: 3 } as const;
export type Bound = (typeof Bound)[keyof typeof Bound];

export class TranspositionTable {
  readonly buckets: number;
  private readonly mask: number;
  private readonly keyHi: Int32Array;
  private readonly keyLo: Int32Array;
  private readonly score: Int32Array;
  private readonly depth: Int16Array;
  private readonly flag: Uint8Array;
  private readonly move: Int8Array;
  private readonly gen: Uint8Array;
  private generation = 1;

  /** @param sizeLog2 log2 of the number of buckets (each bucket holds 2 entries). */
  constructor(sizeLog2 = 16) {
    if (sizeLog2 < 4 || sizeLog2 > 24)
      throw new RangeError(`sizeLog2 must be 4..24, got ${sizeLog2}`);
    this.buckets = 1 << sizeLog2;
    this.mask = this.buckets - 1;
    const n = this.buckets * 2;
    this.keyHi = new Int32Array(n);
    this.keyLo = new Int32Array(n);
    this.score = new Int32Array(n);
    this.depth = new Int16Array(n);
    this.flag = new Uint8Array(n);
    this.move = new Int8Array(n);
    this.gen = new Uint8Array(n);
  }

  /** Approximate memory in bytes. */
  get bytes(): number {
    return this.buckets * 2 * (4 + 4 + 4 + 2 + 1 + 1 + 1);
  }

  newSearch(): void {
    this.generation = (this.generation + 1) & 0xff;
    if (this.generation === 0) {
      this.gen.fill(0);
      this.generation = 1;
    }
  }

  /** Returns the entry index, or -1 if the position is not stored. */
  probe(hi: number, lo: number): number {
    const b = (lo & this.mask) << 1;
    for (let i = b; i < b + 2; i++) {
      if (
        this.gen[i] === this.generation &&
        this.keyLo[i] === (lo | 0) &&
        this.keyHi[i] === (hi | 0)
      )
        return i;
    }
    return -1;
  }

  entryScore(i: number): number {
    return this.score[i] as number;
  }
  entryDepth(i: number): number {
    return this.depth[i] as number;
  }
  entryFlag(i: number): Bound {
    return this.flag[i] as Bound;
  }
  entryMove(i: number): number {
    return this.move[i] as number;
  }

  store(hi: number, lo: number, depth: number, score: number, flag: Bound, move: number): void {
    const b = (lo & this.mask) << 1;
    const g = this.generation;
    const sameKey = (i: number) =>
      this.gen[i] === g && this.keyLo[i] === (lo | 0) && this.keyHi[i] === (hi | 0);
    let i: number;
    if (this.gen[b] !== g || sameKey(b) || depth >= (this.depth[b] as number)) i = b;
    else i = b + 1;
    // Keep a known best move if this store has none (e.g. a fail-low node).
    const keepMove = move < 0 && sameKey(i) ? (this.move[i] as number) : move;
    this.keyHi[i] = hi | 0;
    this.keyLo[i] = lo | 0;
    this.score[i] = score;
    this.depth[i] = depth;
    this.flag[i] = flag;
    this.move[i] = keepMove;
    this.gen[i] = g;
  }
}
