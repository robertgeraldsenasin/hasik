/**
 * Messages between the web app's UI thread and its bot Web Worker. Internal to
 * one origin, so they are plain TypeScript types (no runtime validation cost).
 */
export interface ThinkRequest {
  readonly type: 'think';
  readonly id: number;
  /** encodePosition() text. */
  readonly position: string;
  /** Bot spec, e.g. "minimax:ms=200". */
  readonly spec: string;
  readonly seed: number;
}

export interface ThinkResponse {
  readonly type: 'move';
  readonly id: number;
  readonly move: number;
  readonly score?: number;
  readonly depth?: number;
  readonly nodes?: number;
  readonly pv?: readonly number[];
  readonly ms: number;
}

export interface ThinkError {
  readonly type: 'error';
  readonly id: number;
  readonly message: string;
}

/**
 * Hint mode: score every legal move of a position for the player to move, so the
 * board can show how good each house is (roadmap, milestone 2).
 */
export interface AnalyzeRequest {
  readonly type: 'analyze';
  readonly id: number;
  /** encodePosition() text. */
  readonly position: string;
  /** Bot spec used to search each child position, e.g. "minimax:nodes=40000". */
  readonly spec: string;
  readonly seed: number;
}

export interface MoveScore {
  readonly move: number;
  /** From the mover's view, same units as ThinkResponse.score (minimax: shells x 100). */
  readonly score: number;
}

export interface AnalyzeResponse {
  readonly type: 'analysis';
  readonly id: number;
  /** One entry per legal move, best first. */
  readonly moves: readonly MoveScore[];
  readonly nodes: number;
  readonly ms: number;
}

export type WorkerRequest = ThinkRequest | AnalyzeRequest;
export type WorkerResponse = ThinkResponse | AnalyzeResponse | ThinkError;
