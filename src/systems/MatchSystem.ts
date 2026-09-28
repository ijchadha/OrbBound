import { Ball } from '../entities/Ball';

export interface MatchGroup {
  color: string;
  startIndex: number;
  count: number;
}

/**
 * MatchSystem scans sequences of balls for 3 or more contiguous matching colors.
 * Kept completely decoupled from rendering and chain movement.
 */
export class MatchSystem {
  /**
   * Identifies contiguous runs of identical colors of length >= minLength (default 3).
   */
  public static findMatches(balls: readonly Ball[], minLength: number = 3): MatchGroup[] {
    const matches: MatchGroup[] = [];
    if (balls.length < minLength) return matches;

    let currentStart = 0;
    let currentColor = balls[0].color;
    let currentLength = 1;

    for (let i = 1; i < balls.length; i++) {
      if (balls[i].color === currentColor) {
        currentLength++;
      } else {
        if (currentLength >= minLength) {
          matches.push({
            color: currentColor,
            startIndex: currentStart,
            count: currentLength,
          });
        }
        currentStart = i;
        currentColor = balls[i].color;
        currentLength = 1;
      }
    }

    if (currentLength >= minLength) {
      matches.push({
        color: currentColor,
        startIndex: currentStart,
        count: currentLength,
      });
    }

    return matches;
  }
}
