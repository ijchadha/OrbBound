import Phaser from 'phaser';
import {
  BALL_COLOR_HEX,
  BALL_COLORS,
  BALL_RADIUS,
  BALL_SPACING,
  BallColor,
  CHAIN_SPEED,
  FIXED_LEVEL_SEQUENCE,
  INITIAL_BALL_COUNT,
  MATCH_MIN,
} from '../utils/constants';
import { AudioSynth } from '../utils/AudioSynth';
import { PathSampler } from '../utils/PathSampler';
import { MatchSystem } from '../systems/MatchSystem';
import { Ball } from './Ball';

export interface ChainEvents {
  onReachedEnd?: () => void;
  onMatch?: (color: string, count: number, x: number, y: number, comboMultiplier: number) => void;
  onCrash?: (x: number, y: number, comboReaction: boolean) => void;
  onWaveCleared?: () => void;
}

interface ChainSegment {
  startIndex: number;
  endIndex: number;
}

/**
 * BallChain acts as the authority and manager for all orbs along the path.
 *
 * Implements:
 * 1. Zuma Chain Rollback / Fallback: When matches break the chain, the entire front half
 *    halts forward motion, accelerates backwards toward the rear chain, and crashes
 *    into it with physical momentum pushback and combo chain reactions.
 * 2. Magnetic Attraction Lightning: Electric energy arcs bridge open gaps while rolling back.
 * 3. Insertion Surge: Adding to the chain pushes the entire front half 1 orb forward (+40px)
 *    toward the vortex. If no match occurs, the forward push remains.
 * 4. Proper full-scale orb insertion: Squeeze animation starts at 0.75 and settles cleanly at 1.0.
 */
export class BallChain {
  private scene: Phaser.Scene;
  private pathSampler: PathSampler;
  private balls: Ball[] = [];
  private speed: number = CHAIN_SPEED;
  private isAtEnd: boolean = false;
  private events: ChainEvents;

  // Graphics for magnetic electric energy arcs between broken segments
  private magneticFxGraphics: Phaser.GameObjects.Graphics;

  // Current cascade multiplier for chain reactions
  private currentCascadeMultiplier: number = 1;

  public enableRollbackPhysics: boolean = true;

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
   * Handles segment division, Zuma rollback for front segments, magnetic attraction arcs,
   * crash impacts, and standard forward advance.
   */
  public update(time: number, delta: number): void {
    if (this.isAtEnd || this.balls.length === 0) {
      this.magneticFxGraphics.clear();
      return;
    }

    const dt = delta / 1000;
    this.magneticFxGraphics.clear();

    // 1. Identify contiguous chain segments separated by gaps
    const segments = this.identifySegments();

    if (segments.length === 1 || !this.enableRollbackPhysics) {
      // Single continuous chain: normal forward advance
      this.balls[0].distanceAlongPath += this.speed * dt;
      for (let i = 1; i < this.balls.length; i++) {
        const prev = this.balls[i - 1];
        const curr = this.balls[i];
        const targetDist = prev.distanceAlongPath - BALL_SPACING;

        if (curr.distanceAlongPath < targetDist - 0.5) {
          // Collapse gap smoothly
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
      // Multiple segments (Chain is broken!)
      // The rear-most segment advances steadily
      const rearSeg = segments[segments.length - 1];
      const rearStep = this.speed * 0.75 * dt;
      this.balls[rearSeg.startIndex].distanceAlongPath += rearStep;
      for (let i = rearSeg.startIndex + 1; i <= rearSeg.endIndex; i++) {
        this.balls[i].distanceAlongPath = this.balls[i - 1].distanceAlongPath - BALL_SPACING;
      }

      // Process gaps from back to front: Each front segment ROLLS BACKWARDS into the rear!
      for (let s = segments.length - 2; s >= 0; s--) {
        const frontSeg = segments[s];
        const nextSeg = segments[s + 1];

        const frontTailBall = this.balls[frontSeg.endIndex];
        const rearHeadBall = this.balls[nextSeg.startIndex];

        const currentGap = frontTailBall.distanceAlongPath - rearHeadBall.distanceAlongPath - BALL_SPACING;

        if (currentGap > 0.5) {
          // Gap exists: FRONT HALF ROLLS BACKWARDS!
          const colorsMatch = frontTailBall.color === rearHeadBall.color;
          const rollbackSpeed = colorsMatch ? 750 : 600;
          const rollbackStep = rollbackSpeed * dt;

          AudioSynth.playRollbackTick();
          this.drawMagneticArc(frontTailBall, rearHeadBall, colorsMatch);

          if (rollbackStep >= currentGap) {
            // CRASH! Front half slams into the rear chain!
            this.handleSegmentCrash(frontSeg, nextSeg, frontTailBall, rearHeadBall);
            break;
          } else {
            // Apply rollback to all balls in the front segment
            for (let k = frontSeg.startIndex; k <= frontSeg.endIndex; k++) {
              this.balls[k].distanceAlongPath -= rollbackStep;
            }
          }
        }
      }
    }

    this.updatePositions();
    this.checkEndpoint();
  }

  /**
   * Identifies contiguous segments of balls separated by gaps greater than BALL_SPACING.
   */
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

  /**
   * Executed when the front half crashes back into the rear half.
   * Shunts the chain backward (-24px) away from the vortex and checks for combo matches.
   */
  private handleSegmentCrash(
    frontSeg: ChainSegment,
    _nextSeg: ChainSegment,
    frontTailBall: Ball,
    rearHeadBall: Ball
  ): void {
    // 1. Weld the gap shut
    frontTailBall.distanceAlongPath = rearHeadBall.distanceAlongPath + BALL_SPACING;
    for (let k = frontSeg.endIndex - 1; k >= frontSeg.startIndex; k--) {
      this.balls[k].distanceAlongPath = this.balls[k + 1].distanceAlongPath + BALL_SPACING;
    }

    // 2. Momentum Pushback: The entire chain is shoved backward by the impact
    const PUSHBACK_IMPULSE = 24; // 24 pixels backward along the path away from the vortex
    for (const ball of this.balls) {
      ball.distanceAlongPath = Math.max(0, ball.distanceAlongPath - PUSHBACK_IMPULSE);
    }

    // 3. Audio & Screen FX
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

    // 4. Chain Reaction Check: Increase cascade multiplier and check matches across junction!
    this.currentCascadeMultiplier += 1;
    this.scene.time.delayedCall(30, () => {
      this.checkAndResolveMatches();
    });
  }

  /**
   * Draws a magnetic lightning energy beam bridging open gaps.
   */
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

  /**
   * Spawns shockwave ring and sparks when front segment slams into rear segment.
   */
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

  /**
   * Inserts an orb into the chain:
   * 1. PUSHES THE ENTIRE FRONT HALF ONE ORB FORWARD (+40px) TOWARD THE VORTEX!
   *    If there is no chain reaction, this forward surge remains permanent.
   * 2. Renders the newly inserted orb at full proper size with a smooth squeeze-in animation.
   * 3. Checks for match; if match pops, triggers chain rollback!
   */
  public insertBallAt(color: BallColor, insertIndex: number): void {
    const clampedIndex = Phaser.Math.Clamp(insertIndex, 0, this.balls.length);
    this.currentCascadeMultiplier = 1;

    // 1. PUSH THE ENTIRE FRONT HALF ONE ORB FORWARD (+BALL_SPACING)
    for (let k = 0; k < clampedIndex; k++) {
      this.balls[k].distanceAlongPath += BALL_SPACING;
    }

    // 2. Determine distance for the inserted orb
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

    // Audio & Visual Forward Surge on front half
    AudioSynth.playSurge();
    for (let k = 0; k < clampedIndex; k++) {
      const b = this.balls[k];
      this.scene.tweens.add({
        targets: b.getSprite(),
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    this.updatePositions();

    // 3. Squeeze animation on the newly inserted ball (smoothly settles to scale 1.0)
    newBall.animateSqueezeIn(120, () => {
      this.checkAndResolveMatches();
    });
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
   * Scans for 3+ identical adjacent colors and removes them.
   * Removing balls breaks the chain, causing the front half to crash back in rollback!
   */
  public checkAndResolveMatches(): boolean {
    if (this.balls.length < MATCH_MIN) return false;

    const matches = MatchSystem.findMatches(this.balls, MATCH_MIN);
    if (matches.length === 0) return false;

    matches.sort((a, b) => b.startIndex - a.startIndex);

    for (const m of matches) {
      const matchedBalls = this.balls.splice(m.startIndex, m.count);

      const midBall = matchedBalls[Math.floor(matchedBalls.length / 2)] || matchedBalls[0];
      const popX = midBall ? midBall.x : 0;
      const popY = midBall ? midBall.y : 0;

      for (const b of matchedBalls) {
        this.spawnPopParticles(b.x, b.y, b.color);
        b.destroy();
      }

      AudioSynth.playMatch(this.currentCascadeMultiplier);

      if (this.events.onMatch) {
        this.events.onMatch(m.color, m.count, popX, popY, this.currentCascadeMultiplier);
      }
    }

    this.updatePositions();

    if (this.balls.length === 0 && this.events.onWaveCleared) {
      this.events.onWaveCleared();
    }

    return true;
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
