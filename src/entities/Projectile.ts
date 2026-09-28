import Phaser from 'phaser';
import {
  BALL_RADIUS,
  BallColor,
  GAME_HEIGHT,
  GAME_WIDTH,
} from '../utils/constants';

/**
 * Projectile represents a crystal marble fired by the Shooter traveling across the screen.
 * Uses cached WebGL sprite textures for high-speed 60 FPS performance.
 */
export class Projectile {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public readonly color: BallColor;
  public readonly radius: number;
  public isAlive: boolean = true;

  private sprite: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    startX: number,
    startY: number,
    angle: number,
    color: BallColor,
    speed: number = 1200,
    radius: number = BALL_RADIUS
  ) {
    this.x = startX;
    this.y = startY;
    this.color = color;
    this.radius = radius;

    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.sprite = scene.add.image(this.x, this.y, `orb_${color}`);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(18);
  }

  public update(delta: number): boolean {
    if (!this.isAlive) return false;

    const dt = delta / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.sprite.setPosition(this.x, this.y);

    // Boundary check
    if (
      this.x < -60 ||
      this.x > GAME_WIDTH + 60 ||
      this.y < -60 ||
      this.y > GAME_HEIGHT + 60
    ) {
      this.destroy();
      return false;
    }

    return true;
  }

  public destroy(): void {
    this.isAlive = false;
    this.sprite.destroy();
  }
}
