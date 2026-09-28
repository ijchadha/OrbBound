import { Ball } from '../entities/Ball';
import { MATCH_MIN } from '../utils/constants';

export interface MatchGroup {
  color: string;
  startIndex: number;
  count: number;
}

/**
 * MatchSystem scans sequences of balls for 3 or more contiguous matching colors.
 * Fully deterministic and decoupled from rendering and chain movement.
 */
export class MatchSystem {
  /**
   * Identifies contiguous runs of identical colors of length >= minLength across the entire chain.
   */
  public static findMatches(balls: readonly Ball[], minLength: number = MATCH_MIN): MatchGroup[] {
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

  /**
   * Fast targeted check around an insertion or collapse junction point.
   * Finds the contiguous run of balls sharing the same color as the ball at `targetIndex`.
   */
  public static findMatchAt(
    balls: readonly Ball[],
    targetIndex: number,
    minLength: number = MATCH_MIN
  ): MatchGroup | null {
    if (targetIndex < 0 || targetIndex >= balls.length) return null;

    const targetColor = balls[targetIndex].color;
    let startIndex = targetIndex;
    let endIndex = targetIndex;

    // Scan backwards (towards chain head)
    while (startIndex > 0 && balls[startIndex - 1].color === targetColor) {
      startIndex--;
    }

    // Scan forwards (towards chain tail)
    while (endIndex < balls.length - 1 && balls[endIndex + 1].color === targetColor) {
      endIndex++;
    }

    const count = endIndex - startIndex + 1;
    if (count >= minLength) {
      return {
        color: targetColor,
        startIndex,
        count,
      };
    }

    return null;
  }
}
