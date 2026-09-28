import Phaser from 'phaser';
import {
  BALL_COLOR_HEX,
  BALL_COLOR_HIGHLIGHTS,
  BALL_COLOR_SHADOWS,
  BALL_RADIUS,
  BallColor,
  BallState,
} from '../utils/constants';

let ballIdCounter = 0;

/**
 * Ball represents an individual orb in the game.
 * Its primary spatial truth is `distanceAlongPath`, while the container
 * renders it at the corresponding world (x, y) coordinates supplied by the BallChain.
 */
export class Ball {
  public readonly id: string;
  public color: BallColor;
  public radius: number;
  public distanceAlongPath: number;
  public state: BallState;

  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    color: BallColor,
    initialDistance: number = 0,
    radius: number = BALL_RADIUS
  ) {
    this.id = `ball_${++ballIdCounter}`;
    this.scene = scene;
    this.color = color;
    this.radius = radius;
    this.distanceAlongPath = initialDistance;
    this.state = BallState.IN_CHAIN;

    this.container = this.scene.add.container(0, 0);
    this.graphics = this.scene.add.graphics();
    this.container.add(this.graphics);

    this.render();
  }

  /**
   * Procedurally renders the ball with shadows, gradients, and specular highlights
   * using Phaser Graphics.
   */
  public render(): void {
    this.graphics.clear();

    const mainColor = BALL_COLOR_HEX[this.color];
    const highlightColor = BALL_COLOR_HIGHLIGHTS[this.color];
    const shadowColor = BALL_COLOR_SHADOWS[this.color];
    const r = this.radius;

    // Drop shadow
    this.graphics.fillStyle(0x000000, 0.35);
    this.graphics.fillCircle(2, 3, r);

    // Deep shadow base
    this.graphics.fillStyle(shadowColor, 1);
    this.graphics.fillCircle(0, 0, r);

    // Main orb body
    this.graphics.fillStyle(mainColor, 1);
    this.graphics.fillCircle(-0.5, -0.5, r - 1.5);

    // Outer edge bevel ring
    this.graphics.lineStyle(1.5, 0xffffff, 0.2);
    this.graphics.strokeCircle(0, 0, r - 0.5);

    // Inner rune / rune symbol for color-blind distinction & arcade flavor
    this.drawRune(r);

    // Primary glossy specular highlight
    this.graphics.fillStyle(0xffffff, 0.65);
    this.graphics.fillEllipse(-r * 0.32, -r * 0.35, r * 0.45, r * 0.25);

    // Secondary subtle highlight
    this.graphics.fillStyle(highlightColor, 0.4);
    this.graphics.fillCircle(-r * 0.2, -r * 0.2, r * 0.4);

    // Bottom bounce-light reflection
    this.graphics.fillStyle(highlightColor, 0.25);
    this.graphics.fillEllipse(r * 0.15, r * 0.4, r * 0.5, r * 0.15);
  }

  /**
   * Draws a subtle geometric glyph to make balls distinct even without color vision.
   */
  private drawRune(r: number): void {
    this.graphics.fillStyle(0xffffff, 0.25);
    this.graphics.lineStyle(1.5, 0xffffff, 0.4);

    const glyphSize = r * 0.38;
    switch (this.color) {
      case BallColor.RED:
        // Triangle
        this.graphics.strokeTriangle(
          0, -glyphSize,
          -glyphSize * 0.86, glyphSize * 0.5,
          glyphSize * 0.86, glyphSize * 0.5
        );
        break;
      case BallColor.BLUE:
        // Ring
        this.graphics.strokeCircle(0, 0, glyphSize * 0.7);
        break;
      case BallColor.GREEN:
        // Square
        this.graphics.strokeRect(-glyphSize * 0.6, -glyphSize * 0.6, glyphSize * 1.2, glyphSize * 1.2);
        break;
      case BallColor.YELLOW:
        // Diamond
        this.graphics.beginPath();
        this.graphics.moveTo(0, -glyphSize);
        this.graphics.lineTo(glyphSize, 0);
        this.graphics.lineTo(0, glyphSize);
        this.graphics.lineTo(-glyphSize, 0);
        this.graphics.closePath();
        this.graphics.strokePath();
        break;
    }
  }

  /**
   * Updates world position and rotation according to path coordinates.
   */
  public setPosition(x: number, y: number, angle: number = 0): void {
    this.container.setPosition(x, y);
    this.container.setRotation(angle);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  public isVisible(): boolean {
    return this.container.visible;
  }

  public get x(): number {
    return this.container.x;
  }

  public get y(): number {
    return this.container.y;
  }

  public setScale(scale: number): void {
    this.container.setScale(scale);
  }

  public destroy(): void {
    this.container.destroy();
  }
}
