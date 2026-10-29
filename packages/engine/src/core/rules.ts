/**
 * Rule variants. Sungka differs by region, so every rule that varies is a flag
 * instead of being hard-coded. ADR-0001 records which defaults Hasik adopts.
 */
export interface RuleConfig {
  /** Fixed at 7 for now; kept in the type so the shape matches the spec. */
  readonly housesPerSide: 7;
  /** Fixed at 7 for now. */
  readonly shellsPerHouse: 7;
  /** Last shell in your own store gives you another move. */
  readonly extraTurnOnStore: boolean;
  /** Last shell in a non-empty house: pick them all up and keep sowing. */
  readonly relaySowing: boolean;
  /** Only capture when the opposite house has shells. */
  readonly captureRequiresNonEmptyOpposite: boolean;
  /** The landing shell goes to the store along with the captured shells. */
  readonly captureIncludesLandingShell: boolean;
  /** Who gets shells left in houses when the game ends. See ADR-0001 for a note on this flag. */
  readonly remainingShellsGoTo: 'owner' | 'capturer';
  /** Traditional simultaneous first move. Stretch goal; must be false for now. */
  readonly simultaneousOpening: false;
  /** Safety cap on single-shell drops in one move (relay sowing can run long). */
  readonly maxSowSteps: number;
  /** Throw instead of ending the turn when maxSowSteps is hit. Tests set this to true. */
  readonly throwOnSowLimit: boolean;
}

export const DEFAULT_RULES: RuleConfig = Object.freeze({
  housesPerSide: 7,
  shellsPerHouse: 7,
  extraTurnOnStore: true,
  relaySowing: true,
  captureRequiresNonEmptyOpposite: false,
  captureIncludesLandingShell: true,
  remainingShellsGoTo: 'owner',
  simultaneousOpening: false,
  maxSowSteps: 10_000,
  throwOnSowLimit: false,
});

export function makeRules(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return Object.freeze({ ...DEFAULT_RULES, ...overrides });
}
