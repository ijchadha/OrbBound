export interface ScoreListener {
  (score: number, level: number, combo: number): void;
}

/**
 * ScoreSystem encapsulates game scoring, combo multiplier tracking, and level state.
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

  public addScore(points: number): void {
    this.score += points * this.combo;
    this.notify();
  }

  public incrementCombo(): void {
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.notify();
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
