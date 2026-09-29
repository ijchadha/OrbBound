import { LEVEL_DEFINITIONS } from '../data/LevelDefinitions';
import { LevelDefinition } from '../types/LevelDefinition';

const STORAGE_KEY = 'orbbound_campaign_save_v2';

interface ProgressionData {
  highestUnlockedLevel: number;
  totalCampaignScore: number;
}

/**
 * LevelManager governs level loading, progression tracking, and localStorage persistence.
 * Completely decoupled from rendering and physics.
 */
export class LevelManager {
  private levels: LevelDefinition[];
  private currentLevelId: number = 1;
  private highestUnlockedLevel: number = 1;
  private totalCampaignScore: number = 0;

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

  public setCurrentLevelId(id: number): boolean {
    if (this.isLevelUnlocked(id)) {
      this.currentLevelId = id;
      return true;
    }
    return false;
  }

  public forceSetLevelId(id: number): void {
    if (this.levels.some((l) => l.id === id)) {
      this.currentLevelId = id;
    }
  }

  public isLevelUnlocked(id: number): boolean {
    return id <= this.highestUnlockedLevel;
  }

  public getHighestUnlockedLevel(): number {
    return this.highestUnlockedLevel;
  }

  public getTotalCampaignScore(): number {
    return this.totalCampaignScore;
  }

  /**
   * Called when a level is cleared.
   * Records the level score to campaign score and unlocks the subsequent level if applicable.
   * Returns true if a new level was unlocked.
   */
  public completeLevel(clearedId: number, levelScore: number): boolean {
    this.totalCampaignScore += Math.max(0, levelScore);

    let newlyUnlocked = false;
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
      }
    } catch {
      // Graceful fallback if localStorage is disabled or restricted
      this.highestUnlockedLevel = 1;
      this.totalCampaignScore = 0;
    }
  }

  private saveProgression(): void {
    try {
      const data: ProgressionData = {
        highestUnlockedLevel: this.highestUnlockedLevel,
        totalCampaignScore: this.totalCampaignScore,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore if localStorage unavailable
    }
  }
}
