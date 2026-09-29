import { LEVEL_DEFINITIONS } from '../data/LevelDefinitions';
import { LevelDefinition } from '../types/LevelDefinition';

const STORAGE_KEY = 'orbbound_campaign_save_v2';

interface ProgressionData {
  highestUnlockedLevel: number;
  totalCampaignScore: number;
  completedLevels: number[];
}

/**
 * LevelManager governs level loading, progression tracking, and localStorage persistence.
 * Completely decoupled from rendering and physics.
 *
 * Campaign Score Policy (Day 2 Option B):
 * - A level's completion score is added to the total campaign score on its FIRST completion only.
 * - Replaying a previously cleared level does not accumulate score again, preserving campaign integrity.
 */
export class LevelManager {
  private levels: LevelDefinition[];
  private currentLevelId: number = 1;
  private highestUnlockedLevel: number = 1;
  private totalCampaignScore: number = 0;
  private completedLevels: number[] = [];

  constructor(definitions: LevelDefinition[] = LEVEL_DEFINITIONS) {
    this.levels = definitions;
    this.loadProgression();
  }

  public getCurrentLevel(): LevelDefinition {
    const level = this.levels.find((l) => l.id === this.currentLevelId);
    return level || this.levels[0];
  }

  public getLevel(id: number): LevelDefinition | undefined {
    return this.levels.find((l) => l.id === id);
  }

  public getAllLevels(): readonly LevelDefinition[] {
    return this.levels;
  }

  public getCurrentLevelId(): number {
    return this.currentLevelId;
  }

  /**
   * Production level navigation: only permits navigating to already unlocked levels.
   */
  public setCurrentLevelId(id: number): boolean {
    if (this.isLevelUnlocked(id)) {
      this.currentLevelId = id;
      return true;
    }
    return false;
  }

  /**
   * Developer override: allows testing levels directly without modifying unlock state.
   */
  public devForceSetLevelId(id: number): void {
    if (this.levels.some((l) => l.id === id)) {
      this.currentLevelId = id;
    }
  }

  public isLevelUnlocked(id: number): boolean {
    return id <= this.highestUnlockedLevel;
  }

  public isLevelCompleted(id: number): boolean {
    return this.completedLevels.includes(id);
  }

  public getHighestUnlockedLevel(): number {
    return this.highestUnlockedLevel;
  }

  public getTotalCampaignScore(): number {
    return this.totalCampaignScore;
  }

  public getCompletedLevels(): readonly number[] {
    return this.completedLevels;
  }

  /**
   * Called ONLY when a level is genuinely cleared through normal gameplay.
   * - Records score to total campaign score on first completion (Option B).
   * - Unlocks the next level if id < 5.
   * - Never unlocks level 6.
   * - Persists state to localStorage.
   */
  public completeLevel(clearedId: number, levelScore: number): boolean {
    const isFirstTime = !this.completedLevels.includes(clearedId);
    if (isFirstTime) {
      this.completedLevels.push(clearedId);
      this.totalCampaignScore += Math.max(0, levelScore);
    }

    let newlyUnlocked = false;
    // Mini-campaign finale is Level 5; do not attempt to unlock Level 6
    if (clearedId >= this.highestUnlockedLevel && clearedId < this.levels.length) {
      this.highestUnlockedLevel = clearedId + 1;
      newlyUnlocked = true;
    }

    this.saveProgression();
    return newlyUnlocked;
  }

  public hasNextLevel(): boolean {
    return this.currentLevelId < this.levels.length;
  }

  public getNextLevelId(): number | null {
    if (this.currentLevelId < this.levels.length) {
      return this.currentLevelId + 1;
    }
    return null;
  }

  public getPrevLevelId(): number | null {
    if (this.currentLevelId > 1) {
      return this.currentLevelId - 1;
    }
    return null;
  }

  /**
   * Resets campaign unlock progression back to Level 1.
   */
  public resetProgression(): void {
    this.currentLevelId = 1;
    this.highestUnlockedLevel = 1;
    this.totalCampaignScore = 0;
    this.completedLevels = [];
    this.saveProgression();
  }

  private loadProgression(): void {
    try {
      const dataStr = localStorage.getItem(STORAGE_KEY);
      if (dataStr) {
        const parsed: ProgressionData = JSON.parse(dataStr);
        if (typeof parsed.highestUnlockedLevel === 'number') {
          this.highestUnlockedLevel = Math.max(1, Math.min(this.levels.length, parsed.highestUnlockedLevel));
        }
        if (typeof parsed.totalCampaignScore === 'number') {
          this.totalCampaignScore = Math.max(0, parsed.totalCampaignScore);
        }
        if (Array.isArray(parsed.completedLevels)) {
          this.completedLevels = parsed.completedLevels.filter(
            (id) => typeof id === 'number' && id >= 1 && id <= this.levels.length
          );
        }
      }
    } catch {
      // Graceful fallback if localStorage is disabled or restricted
      this.highestUnlockedLevel = 1;
      this.totalCampaignScore = 0;
      this.completedLevels = [];
    }
  }

  private saveProgression(): void {
    try {
      const data: ProgressionData = {
        highestUnlockedLevel: this.highestUnlockedLevel,
        totalCampaignScore: this.totalCampaignScore,
        completedLevels: this.completedLevels,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore if localStorage unavailable
    }
  }
}
