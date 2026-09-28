import Phaser from 'phaser';
import {
  BALL_COLOR_HEX,
  BALL_COLOR_HIGHLIGHTS,
  BALL_RADIUS,
  BallColor,
  GAME_HEIGHT,
  GAME_WIDTH,
} from '../utils/constants';

/**
 * Projectile represents a ball fired by the Shooter traveling across the screen.
 */
export class Projectile {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public readonly color: BallColor;
  public readonly radius: number;
  public isAlive: boolean = true;

  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    startX: number,
    startY: number,
    angle: number,
    color: BallColor,
    speed: number = 1000,
    radius: number = BALL_RADIUS
  ) {
    this.scene = scene;
    this.x = startX;
    this.y = startY;
    this.color = color;
    this.radius = radius;

    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.container = this.scene.add.container(this.x, this.y);
    this.graphics = this.scene.add.graphics();
    this.container.add(this.graphics);

    this.render();
  }

  private render(): void {
    this.graphics.clear();
    const mainColor = BALL_COLOR_HEX[this.color];
    const highlightColor = BALL_COLOR_HIGHLIGHTS[this.color];
    const r = this.radius;

    // Glowing motion halo
    this.graphics.fillStyle(mainColor, 0.4);
    this.graphics.fillCircle(0, 0, r + 4);

    // Main orb
    this.graphics.fillStyle(mainColor, 1);
    this.graphics.fillCircle(0, 0, r);

    // Specular highlight
    this.graphics.fillStyle(0xffffff, 0.8);
    this.graphics.fillEllipse(-r * 0.35, -r * 0.35, r * 0.45, r * 0.25);
    this.graphics.fillStyle(highlightColor, 0.5);
    this.graphics.fillCircle(-r * 0.2, -r * 0.2, r * 0.35);

    // Outer ring
    this.graphics.lineStyle(1.5, 0xffffff, 0.4);
    this.graphics.strokeCircle(0, 0, r);
  }

  public update(delta: number): boolean {
    if (!this.isAlive) return false;

    const dt = delta / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.container.setPosition(this.x, this.y);

    // Check canvas boundaries
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
    this.container.destroy();
  }
}
