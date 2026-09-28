export interface ScoreListener {
  (score: number, level: number, combo: number): void;
}

/**
 * ScoreSystem encapsulates game scoring, cascade combo multiplier tracking, and level state.
 *
 * Phase 7 Scoring Rules:
 * - Base points: 10 per ball (3 balls = 30, 4 balls = 40, 5 balls = 50)
 * - Combo Multiplier: Represents consecutive chain-reaction matches in ONE shot resolution
 *   (1st match: x1, 2nd match via collapse: x2, 3rd match: x3...)
 */
export class ScoreSystem {
  private score: number = 0;
  private level: number = 1;
  private combo: number = 1;
  private maxCombo: number = 1;
  private listeners: ScoreListener[] = [];

  constructor(initialLevel: number = 1) {
    this.level = initialLevel;
  }

  public subscribe(listener: ScoreListener): () => void {
    this.listeners.push(listener);
    listener(this.score, this.level, this.combo);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.score, this.level, this.combo);
    }
  }

  /**
   * Records a match event using Phase 7 rules.
   * Returns the points earned from this match event.
   */
  public recordMatch(ballCount: number, cascadeMultiplier: number = 1): number {
    const basePoints = ballCount * 10;
    const earned = basePoints * cascadeMultiplier;

    this.score += earned;
    this.combo = cascadeMultiplier;
    this.maxCombo = Math.max(this.maxCombo, cascadeMultiplier);
    this.notify();

    return earned;
  }

  public resetCombo(): void {
    if (this.combo !== 1) {
      this.combo = 1;
      this.notify();
    }
  }

  public setLevel(level: number): void {
    this.level = level;
    this.notify();
  }

  public getScore(): number {
    return this.score;
  }

  public getLevel(): number {
    return this.level;
  }

  public getCombo(): number {
    return this.combo;
  }

  public getMaxCombo(): number {
    return this.maxCombo;
  }

  public resetAll(): void {
    this.score = 0;
    this.level = 1;
    this.combo = 1;
    this.maxCombo = 1;
    this.notify();
  }

  public resetForCurrentLevel(): void {
    this.combo = 1;
    this.notify();
  }
}
