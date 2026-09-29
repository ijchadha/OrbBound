import Phaser from 'phaser';
import {
  BALL_COLOR_HEX,
  BALL_COLORS,
  BALL_RADIUS,
  BALL_SPACING,
  BallColor,
  CHAIN_SPEED,
  ENABLE_ROLLBACK_PHYSICS,
  FIXED_LEVEL_SEQUENCE,
  INITIAL_BALL_COUNT,
  MATCH_MIN,
} from '../utils/constants';
import { AudioSynth } from '../utils/AudioSynth';
import { PathSampler } from '../utils/PathSampler';
import { MatchSystem, MatchGroup } from '../systems/MatchSystem';
import { Ball } from './Ball';

export interface ChainEvents {
  onReachedEnd?: () => void;
  onMatch?: (color: string, count: number, x: number, y: number, comboMultiplier: number) => void;
  onCrash?: (x: number, y: number, comboReaction: boolean) => void;
  onWaveCleared?: () => void;
  onShotResolved?: (matchesCount: number, finalCombo: number, remainingBalls: number) => void;
}

interface ChainSegment {
  startIndex: number;
  endIndex: number;
}

/**
 * BallChain acts as the authority and manager for all orbs along the path.
 *
 * Day-1 Core Loop Architecture:
 * AIM → SHOOT → COLLISION → INSERT → MATCH 3+ → REMOVE → COLLAPSE CHAIN
 * → CHECK FOR NEW MATCH → REPEAT UNTIL NO MATCH → RESUME CHAIN
 *
 * Cascades are fully owned by the deterministic match resolver:
 * - Match 1: x1 combo
 * - Collapse creates Match 2: x2 combo
 * - Collapse creates Match 3: x3 combo
 * - Gaps are closed deterministically and ball distances updated without physics dependencies.
 *
 * Rollback/magnetic/crash implementation is preserved but disabled for Day-1 (ENABLE_ROLLBACK_PHYSICS = false).
 */
export class BallChain {
  private scene: Phaser.Scene;
  private pathSampler: PathSampler;
  private balls: Ball[] = [];
  private speed: number = CHAIN_SPEED;
  private isAtEnd: boolean = false;
  private events: ChainEvents;

  // Graphics for magnetic electric energy arcs between broken segments (Rollback Mode)
  private magneticFxGraphics: Phaser.GameObjects.Graphics;

  // Tracks cascade combo state for current shot resolution
  private currentCascadeMultiplier: number = 1;

  // Controls whether experimental rollback physics or standard Day-1 deterministic loop runs
  public enableRollbackPhysics: boolean = ENABLE_ROLLBACK_PHYSICS;

  constructor(scene: Phaser.Scene, pathSampler: PathSampler, events: ChainEvents = {}) {
    this.scene = scene;
    this.pathSampler = pathSampler;
    this.events = events;

    this.magneticFxGraphics = this.scene.add.graphics();
    this.magneticFxGraphics.setDepth(20);

    this.spawnInitialChain(FIXED_LEVEL_SEQUENCE);
  }

  /**
   * Spawns initial chain with evenly spaced balls.
   */
  public spawnInitialChain(source: BallColor[] | number = FIXED_LEVEL_SEQUENCE): void {
    this.destroy();
    this.isAtEnd = false;
    this.currentCascadeMultiplier = 1;

    let colors: BallColor[] = [];
    if (Array.isArray(source)) {
      colors = [...source];
    } else {
      const count = source || INITIAL_BALL_COUNT;
      let prev: BallColor | null = null;
      let repeat = 0;
      for (let i = 0; i < count; i++) {
        let col = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;
        if (col === prev) {
          repeat++;
          if (repeat >= 2) {
            const others = BALL_COLORS.filter((c) => c !== prev);
            col = Phaser.Utils.Array.GetRandom(others);
            repeat = 0;
          }
        } else {
          repeat = 0;
        }
        prev = col;
        colors.push(col);
      }
    }

    const count = colors.length;
    const startingHeadDistance = count * BALL_SPACING + 100;

    for (let i = 0; i < count; i++) {
      const distance = startingHeadDistance - i * BALL_SPACING;
      const ball = new Ball(this.scene, colors[i], distance, BALL_RADIUS);
      this.balls.push(ball);
    }

    this.updatePositions();
  }

  /**
   * Primary frame update loop.
   * Day-1: Continuous deterministic forward advance.
   * Experimental: Segment division, rollback, magnetic attraction, and crash physics.
   */
  public update(time: number, delta: number): void {
    if (this.isAtEnd || this.balls.length === 0) {
      this.magneticFxGraphics.clear();
      return;
    }

    const dt = delta / 1000;
    this.magneticFxGraphics.clear();

    if (!this.enableRollbackPhysics) {
      // --- Day-1 Deterministic Chain Advance ---
      this.balls[0].distanceAlongPath += this.speed * dt;
      for (let i = 1; i < this.balls.length; i++) {
        this.balls[i].distanceAlongPath = this.balls[i - 1].distanceAlongPath - BALL_SPACING;
      }
    } else {
      // --- Experimental Rollback Mode (Optional) ---
      this.updateRollbackPhysics(dt);
    }

    this.updatePositions();
    this.checkEndpoint();
  }

  /**
   * Inserts an orb into the chain at the specified index.
   * In Day-1 mode:
   * 1. Inserts the ball and updates spacing immediately across the entire chain.
   * 2. Executes the deterministic cascade match resolver.
   * 3. Returns the total number of matches resolved for this shot.
   */
  public insertBallAt(color: BallColor, insertIndex: number): number {
    const clampedIndex = Phaser.Math.Clamp(insertIndex, 0, this.balls.length);

    if (this.enableRollbackPhysics) {
      return this.insertBallRollbackMode(color, clampedIndex);
    }

    // Day-1 Mode: Deterministic insertion
    let newDistance: number;
    if (this.balls.length === 0) {
      newDistance = 120;
    } else if (clampedIndex === 0) {
      newDistance = this.balls[0].distanceAlongPath + BALL_SPACING;
    } else {
      newDistance = this.balls[clampedIndex - 1].distanceAlongPath - BALL_SPACING;
    }

    const newBall = new Ball(this.scene, color, newDistance, BALL_RADIUS);
    this.balls.splice(clampedIndex, 0, newBall);

    // Re-space all balls along the path immediately
    if (clampedIndex === 0) {
      for (let k = 1; k < this.balls.length; k++) {
        this.balls[k].distanceAlongPath = this.balls[k - 1].distanceAlongPath - BALL_SPACING;
      }
    } else {
      for (let k = 1; k < this.balls.length; k++) {
        this.balls[k].distanceAlongPath = this.balls[k - 1].distanceAlongPath - BALL_SPACING;
      }
    }

    this.updatePositions();
    newBall.animateSqueezeIn(90);

    // Directly resolve any matches and subsequent cascades initiated by this insertion
    const matchesResolved = this.checkAndResolveMatches(clampedIndex);
    return matchesResolved;
  }

  /**
   * Match Resolver (Day-1 Core Requirement 1, 2, 4):
   * Owns the complete cascade loop deterministically without relying on physics or delayed callbacks.
   *
   * Loop:
   * 1. Check for match at target boundary (preferring player's insertion or the collapse junction).
   * 2. If no match at boundary, check entire chain for any existing match.
   * 3. If match found:
   *    - Remove matched balls.
   *    - Close chain gap deterministically.
   *    - Update ball distances.
   *    - Target the newly connected boundary.
   *    - Advance combo: x1 -> x2 -> x3...
   * 4. Repeat until no match exists.
   * 5. Reset combo state for next shot.
   *
   * @param targetIndex Optional index of the orb that was just inserted or connected by collapse.
   * @returns Total number of matches resolved in this cascade.
   */
  public checkAndResolveMatches(targetIndex?: number): number {
    let matchesResolved = 0;
    let cascadeMultiplier = 1;
    let currentCheckIndex: number | null = targetIndex !== undefined ? targetIndex : null;

    while (this.balls.length >= MATCH_MIN) {
      let match: MatchGroup | null = null;

      // 1. Prefer resolving the match at the player's insertion index or the newly connected collapse boundary
      if (
        currentCheckIndex !== null &&
        currentCheckIndex >= 0 &&
        currentCheckIndex < this.balls.length
      ) {
        match = MatchSystem.findMatchAt(this.balls, currentCheckIndex, MATCH_MIN);
      }

      // 2. If no match at target index, check if any other match exists across the chain
      if (!match) {
        const allMatches = MatchSystem.findMatches(this.balls, MATCH_MIN);
        if (allMatches.length > 0) {
          match = allMatches[0];
        }
      }

      // 3. If no match exists anywhere, cascade resolution is complete
      if (!match) {
        break;
      }

      // 4. Resolve the match
      matchesResolved++;
      const startIndex = match.startIndex;
      const count = match.count;
      const matchedColor = match.color;

      const matchedBalls = this.balls.slice(startIndex, startIndex + count);
      const midBall = matchedBalls[Math.floor(matchedBalls.length / 2)] || matchedBalls[0];
      const popX = midBall ? midBall.x : 0;
      const popY = midBall ? midBall.y : 0;

      // Visual particle burst & cleanup
      for (const b of matchedBalls) {
        this.spawnPopParticles(b.x, b.y, b.color);
        b.destroy();
      }

      // Remove balls from chain array
      this.balls.splice(startIndex, count);

      // Audio feedback with pitch matching cascade multiplier
      AudioSynth.playMatch(cascadeMultiplier);

      // Emit onMatch event to update score system and spawn floating text
      if (this.events.onMatch) {
        this.events.onMatch(matchedColor, count, popX, popY, cascadeMultiplier);
      }

      console.log(
        `[Day-1 Match] Cascade stage x${cascadeMultiplier}: ${count}x ${matchedColor} removed. Remaining balls: ${this.balls.length}`
      );

      // 5. Close the chain gap deterministically & update ball distances
      if (this.balls.length > 0) {
        for (let k = 1; k < this.balls.length; k++) {
          this.balls[k].distanceAlongPath = this.balls[k - 1].distanceAlongPath - BALL_SPACING;
        }
      }

      // 6. Check the newly connected boundary for another match:
      // The balls previously on either side of the removed group are now at indices:
      // (startIndex - 1) and (startIndex).
      // We target startIndex to test if their colors match and form a cascade.
      if (startIndex > 0 && startIndex < this.balls.length) {
        currentCheckIndex = startIndex;
      } else if (startIndex === 0 && this.balls.length > 0) {
        currentCheckIndex = 0;
      } else {
        currentCheckIndex = null;
      }

      // 7. Advance cascade multiplier for next match stage in this shot
      cascadeMultiplier++;
    }

    this.updatePositions();

    // Reset internal cascade multiplier for the next shot
    this.currentCascadeMultiplier = 1;

    const finalCombo = Math.max(1, cascadeMultiplier - 1);
    if (this.events.onShotResolved) {
      this.events.onShotResolved(matchesResolved, finalCombo, this.balls.length);
    }

    console.log(
      `[Day-1 Core Loop] Shot resolution finished: ${matchesResolved} match(es), Final Combo: x${finalCombo}, Remaining Balls: ${this.balls.length}`
    );

    // Win condition check
    if (this.balls.length === 0 && this.events.onWaveCleared) {
      this.events.onWaveCleared();
    }

    return matchesResolved;
  }

  /**
   * Translates 1D distanceAlongPath into 2D world coordinates via PathSampler.
   */
  public updatePositions(): void {
    const totalLength = this.pathSampler.totalLength;

    for (const ball of this.balls) {
      const d = ball.distanceAlongPath;

      if (d < 0 || d > totalLength + BALL_RADIUS) {
        ball.setVisible(false);
      } else {
        ball.setVisible(true);
        const { x, y, angle } = this.pathSampler.getPointAtDistance(d);
        ball.setPosition(x, y, angle);
      }
    }
  }

  /**
   * Visual particle burst when orbs pop.
   */
  private spawnPopParticles(x: number, y: number, color: BallColor): void {
    const count = 12;
    const colorHex = BALL_COLOR_HEX[color];

    for (let i = 0; i < count; i++) {
      const p = this.scene.add.graphics();
      p.setDepth(30);
      p.fillStyle(colorHex, 1);
      p.fillCircle(0, 0, Phaser.Math.Between(2, 5));
      p.setPosition(x, y);

      const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.25, 0.25);
      const dist = Phaser.Math.Between(25, 65);

      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(280, 420),
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /**
   * Checks if leading ball has crossed into the endpoint vortex.
   */
  private checkEndpoint(): void {
    if (this.balls.length === 0) return;

    const headDistance = this.balls[0].distanceAlongPath;
    if (headDistance >= this.pathSampler.totalLength) {
      this.isAtEnd = true;
      if (this.events.onReachedEnd) {
        this.events.onReachedEnd();
      }
    }
  }

  // =========================================================================
  // --- Experimental Rollback Physics (Preserved for Later Experiments) ---
  // =========================================================================

  private updateRollbackPhysics(dt: number): void {
    const segments = this.identifySegments();

    if (segments.length === 1) {
      this.balls[0].distanceAlongPath += this.speed * dt;
      for (let i = 1; i < this.balls.length; i++) {
        const prev = this.balls[i - 1];
        const curr = this.balls[i];
        const targetDist = prev.distanceAlongPath - BALL_SPACING;

        if (curr.distanceAlongPath < targetDist - 0.5) {
          curr.distanceAlongPath += Math.max(620, this.speed * 5) * dt;
          if (curr.distanceAlongPath >= targetDist - 0.5) {
            curr.distanceAlongPath = targetDist;
            this.checkAndResolveMatches();
          }
        } else {
          curr.distanceAlongPath = targetDist;
        }
      }
    } else {
      const rearSeg = segments[segments.length - 1];
      const rearStep = this.speed * 0.75 * dt;
      this.balls[rearSeg.startIndex].distanceAlongPath += rearStep;
      for (let i = rearSeg.startIndex + 1; i <= rearSeg.endIndex; i++) {
        this.balls[i].distanceAlongPath = this.balls[i - 1].distanceAlongPath - BALL_SPACING;
      }

      for (let s = segments.length - 2; s >= 0; s--) {
        const frontSeg = segments[s];
        const nextSeg = segments[s + 1];

        const frontTailBall = this.balls[frontSeg.endIndex];
        const rearHeadBall = this.balls[nextSeg.startIndex];

        const currentGap = frontTailBall.distanceAlongPath - rearHeadBall.distanceAlongPath - BALL_SPACING;

        if (currentGap > 0.5) {
          const colorsMatch = frontTailBall.color === rearHeadBall.color;
          const rollbackSpeed = colorsMatch ? 750 : 600;
          const rollbackStep = rollbackSpeed * dt;

          AudioSynth.playRollbackTick();
          this.drawMagneticArc(frontTailBall, rearHeadBall, colorsMatch);

          if (rollbackStep >= currentGap) {
            this.handleSegmentCrash(frontSeg, nextSeg, frontTailBall, rearHeadBall);
            break;
          } else {
            for (let k = frontSeg.startIndex; k <= frontSeg.endIndex; k++) {
              this.balls[k].distanceAlongPath -= rollbackStep;
            }
          }
        }
      }
    }
  }

  private insertBallRollbackMode(color: BallColor, clampedIndex: number): number {
    for (let k = 0; k < clampedIndex; k++) {
      this.balls[k].distanceAlongPath += BALL_SPACING;
    }

    let newDistance: number;
    if (this.balls.length === 0) {
      newDistance = 120;
    } else if (clampedIndex === 0) {
      newDistance = this.balls[0].distanceAlongPath + BALL_SPACING;
    } else {
      newDistance = this.balls[clampedIndex - 1].distanceAlongPath - BALL_SPACING;
    }

    const newBall = new Ball(this.scene, color, newDistance, BALL_RADIUS);
    this.balls.splice(clampedIndex, 0, newBall);

    AudioSynth.playSurge();
    this.updatePositions();
    newBall.animateSqueezeIn(120, () => {
      this.checkAndResolveMatches(clampedIndex);
    });

    return 0;
  }

  private identifySegments(): ChainSegment[] {
    const segments: ChainSegment[] = [];
    if (this.balls.length === 0) return segments;

    let segStart = 0;
    for (let i = 1; i < this.balls.length; i++) {
      const gap = this.balls[i - 1].distanceAlongPath - this.balls[i].distanceAlongPath - BALL_SPACING;
      if (gap > 1.0) {
        segments.push({ startIndex: segStart, endIndex: i - 1 });
        segStart = i;
      }
    }
    segments.push({ startIndex: segStart, endIndex: this.balls.length - 1 });
    return segments;
  }

  private handleSegmentCrash(
    frontSeg: ChainSegment,
    _nextSeg: ChainSegment,
    frontTailBall: Ball,
    rearHeadBall: Ball
  ): void {
    frontTailBall.distanceAlongPath = rearHeadBall.distanceAlongPath + BALL_SPACING;
    for (let k = frontSeg.endIndex - 1; k >= frontSeg.startIndex; k--) {
      this.balls[k].distanceAlongPath = this.balls[k + 1].distanceAlongPath + BALL_SPACING;
    }

    const PUSHBACK_IMPULSE = 24;
    for (const ball of this.balls) {
      ball.distanceAlongPath = Math.max(0, ball.distanceAlongPath - PUSHBACK_IMPULSE);
    }

    AudioSynth.playCrash();
    this.scene.cameras.main.shake(140, 0.008);

    const crashX = (frontTailBall.x + rearHeadBall.x) / 2;
    const crashY = (frontTailBall.y + rearHeadBall.y) / 2;
    this.spawnCrashEffect(crashX, crashY, frontTailBall.color, rearHeadBall.color);

    const colorsMatch = frontTailBall.color === rearHeadBall.color;
    if (this.events.onCrash) {
      this.events.onCrash(crashX, crashY, colorsMatch);
    }

    this.updatePositions();

    this.currentCascadeMultiplier += 1;
    this.scene.time.delayedCall(30, () => {
      this.checkAndResolveMatches();
    });
  }

  private drawMagneticArc(ballA: Ball, ballB: Ball, colorsMatch: boolean): void {
    if (!ballA.isVisible() || !ballB.isVisible()) return;

    const colorHex = colorsMatch ? BALL_COLOR_HEX[ballA.color] : 0x38bdf8;
    this.magneticFxGraphics.lineStyle(colorsMatch ? 3 : 1.5, colorHex, 0.85);

    const segments = 6;
    const dx = ballB.x - ballA.x;
    const dy = ballB.y - ballA.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;

    const perpX = -dy / len;
    const perpY = dx / len;

    this.magneticFxGraphics.beginPath();
    this.magneticFxGraphics.moveTo(ballA.x, ballA.y);

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const jitter = (Math.random() - 0.5) * (colorsMatch ? 18 : 8);
      const px = ballA.x + dx * t + perpX * jitter;
      const py = ballA.y + dy * t + perpY * jitter;
      this.magneticFxGraphics.lineTo(px, py);
    }

    this.magneticFxGraphics.lineTo(ballB.x, ballB.y);
    this.magneticFxGraphics.strokePath();

    this.magneticFxGraphics.fillStyle(colorHex, 0.4);
    this.magneticFxGraphics.fillCircle(ballA.x, ballA.y, BALL_RADIUS * 0.7);
    this.magneticFxGraphics.fillCircle(ballB.x, ballB.y, BALL_RADIUS * 0.7);
  }

  private spawnCrashEffect(x: number, y: number, colorA: BallColor, colorB: BallColor): void {
    const shockwave = this.scene.add.graphics();
    shockwave.lineStyle(4, 0xffffff, 1);
    shockwave.strokeCircle(x, y, 10);
    shockwave.setDepth(25);

    this.scene.tweens.add({
      targets: shockwave,
      alpha: 0,
      scaleX: 3.5,
      scaleY: 3.5,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => shockwave.destroy(),
    });

    const sparkColors = [BALL_COLOR_HEX[colorA], BALL_COLOR_HEX[colorB], 0xffffff];
    const sparkCount = 14;
    for (let i = 0; i < sparkCount; i++) {
      const spark = this.scene.add.graphics();
      spark.setDepth(25);
      const col = Phaser.Utils.Array.GetRandom(sparkColors);
      spark.fillStyle(col, 1);
      spark.fillCircle(0, 0, Phaser.Math.Between(2, 4));
      spark.setPosition(x, y);

      const angle = (Math.PI * 2 * i) / sparkCount + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.Between(40, 95);

      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(200, 360),
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // =========================================================================
  // --- Public Accessors ---
  // =========================================================================

  public getBalls(): readonly Ball[] {
    return this.balls;
  }

  public getSpeed(): number {
    return this.speed;
  }

  public setSpeed(speed: number): void {
    this.speed = Math.max(10, speed);
  }

  public getHeadDistance(): number {
    return this.balls.length > 0 ? this.balls[0].distanceAlongPath : 0;
  }

  public hasReachedEnd(): boolean {
    return this.isAtEnd;
  }

  public destroy(): void {
    this.magneticFxGraphics.destroy();
    for (const ball of this.balls) {
      ball.destroy();
    }
    this.balls = [];
  }
}
