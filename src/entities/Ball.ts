import Phaser from 'phaser';
import {
  BALL_RADIUS,
  BallColor,
  BallState,
} from '../utils/constants';

let ballIdCounter = 0;

/**
 * Ball represents a crystal marble orb in the chain.
 * Uses hardware-accelerated batched WebGL Sprite Images for high-speed 60 FPS performance.
 */
export class Ball {
  public readonly id: string;
  public color: BallColor;
  public radius: number;
  public distanceAlongPath: number;
  public state: BallState;

  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;

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

    // Use cached WebGL texture created by TextureFactory
    this.sprite = this.scene.add.image(0, 0, `orb_${color}`);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(1.0);
  }

  /**
   * Smooth, guaranteed insertion squeeze animation that lands strictly at scale 1.0.
   */
  public animateSqueezeIn(durationMs: number = 130, onComplete?: () => void): void {
    this.sprite.setScale(0.75);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: durationMs,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.sprite.setScale(1.0);
        if (onComplete) onComplete();
      },
    });
  }

  public setPosition(x: number, y: number, angle: number = 0): void {
    this.sprite.setPosition(x, y);
    this.sprite.setRotation(angle);
  }

  public setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
  }

  public isVisible(): boolean {
    return this.sprite.visible;
  }

  public get x(): number {
    return this.sprite.x;
  }

  public get y(): number {
    return this.sprite.y;
  }

  public setScale(scale: number): void {
    this.sprite.setScale(scale);
  }

  public getSprite(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}
