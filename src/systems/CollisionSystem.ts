import { BallChain } from '../entities/BallChain';
import { PathSampler } from '../utils/PathSampler';

export interface CollisionResult {
  hitBallIndex: number;
  insertIndex: number;
  distance: number;
}

/**
 * CollisionSystem performs spatial tests between fired projectiles and the moving ball chain.
 */
export class CollisionSystem {
  /**
   * Tests whether a projectile circle overlaps with any active ball in the chain.
   * If collision occurs, determines the exact chain insertion index by testing
   * the projectile's relative offset against the local path tangent.
   */
  public static checkBallChainCollision(
    projectileX: number,
    projectileY: number,
    projectileRadius: number,
    ballChain: BallChain,
    pathSampler: PathSampler
  ): CollisionResult | null {
    const balls = ballChain.getBalls();
    let closestIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.isVisible()) continue;

      const dist = Math.hypot(ball.x - projectileX, ball.y - projectileY);
      const threshold = ball.radius + projectileRadius;

      if (dist <= threshold && dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    if (closestIndex === -1) {
      return null;
    }

    const hitBall = balls[closestIndex];
    const { angle } = pathSampler.getPointAtDistance(hitBall.distanceAlongPath);

    // Tangent vector of path at the hit ball
    const tangentX = Math.cos(angle);
    const tangentY = Math.sin(angle);

    // Vector from hit ball center to projectile center
    const dx = projectileX - hitBall.x;
    const dy = projectileY - hitBall.y;

    // Dot product determines if projectile hit ahead of or behind the ball along the path
    const dot = dx * tangentX + dy * tangentY;
    const insertIndex = dot >= 0 ? closestIndex : closestIndex + 1;

    return {
      hitBallIndex: closestIndex,
      insertIndex,
      distance: minDistance,
    };
  }
}
