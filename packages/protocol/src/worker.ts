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

export type WorkerRequest = ThinkRequest;
export type WorkerResponse = ThinkResponse | ThinkError;
