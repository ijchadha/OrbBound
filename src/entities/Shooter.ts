import Phaser from 'phaser';
import {
  BALL_COLOR_HEX,
  BALL_COLORS,
  BALL_RADIUS,
  BallColor,
  PROJECTILE_SPEED,
  SHOOT_COOLDOWN,
  SHOOTER_X,
  SHOOTER_Y,
} from '../utils/constants';
import { AudioSynth } from '../utils/AudioSynth';
import { Projectile } from './Projectile';

/**
 * Shooter represents the player's rotating launcher.
 * Uses cached WebGL textures for instant, responsive rendering.
 */
export class Shooter {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private turretContainer: Phaser.GameObjects.Container;
  private baseGraphics: Phaser.GameObjects.Graphics;
  private turretGraphics: Phaser.GameObjects.Graphics;
  private loadedOrbSprite: Phaser.GameObjects.Image;
  private nextOrbSprite: Phaser.GameObjects.Image;
  private nextOrbSlotGraphics: Phaser.GameObjects.Graphics;
  private aimLineGraphics: Phaser.GameObjects.Graphics;

  public currentColor: BallColor;
  public nextColor: BallColor;
  private currentAimAngle: number = -Math.PI / 2;
  private canShoot: boolean = true;
  public shootCooldownMs: number = SHOOT_COOLDOWN;
  public projectileSpeed: number = PROJECTILE_SPEED;

  constructor(scene: Phaser.Scene, x: number = SHOOTER_X, y: number = SHOOTER_Y) {
    this.scene = scene;
    this.currentColor = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;
    this.nextColor = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;

    this.container = this.scene.add.container(x, y);
    this.container.setDepth(16);

    this.turretContainer = this.scene.add.container(0, 0);

    this.aimLineGraphics = this.scene.add.graphics();
    this.aimLineGraphics.setDepth(14);

    this.baseGraphics = this.scene.add.graphics();
    this.turretGraphics = this.scene.add.graphics();
    this.nextOrbSlotGraphics = this.scene.add.graphics();

    // Reusable cached orb sprites
    this.loadedOrbSprite = this.scene.add.image(0, 0, `orb_${this.currentColor}`);
    this.nextOrbSprite = this.scene.add.image(56, 24, `orb_${this.nextColor}`);
    this.nextOrbSprite.setScale(0.65);

    // Assemble display hierarchy
    this.container.add(this.baseGraphics);
    this.container.add(this.turretContainer);
    this.turretContainer.add(this.turretGraphics);
    this.turretContainer.add(this.loadedOrbSprite);

    this.container.add(this.nextOrbSlotGraphics);
    this.container.add(this.nextOrbSprite);

    this.renderBase();
    this.renderTurret();
    this.renderNextSlot();
    this.renderAimLine();
  }

  /**
   * Static pedestal base beneath the rotating turret.
   */
  private renderBase(): void {
    this.baseGraphics.clear();

    // Outer drop shadow
    this.baseGraphics.fillStyle(0x000000, 0.4);
    this.baseGraphics.fillCircle(0, 6, 52);

    // Outer stone pedestal
    this.baseGraphics.fillStyle(0x1e293b, 1);
    this.baseGraphics.fillCircle(0, 0, 48);

    // Golden runic bevel ring
    this.baseGraphics.lineStyle(2, 0xd97706, 0.85);
    this.baseGraphics.strokeCircle(0, 0, 46);

    // Inner dark recessed well
    this.baseGraphics.fillStyle(0x0f172a, 1);
    this.baseGraphics.fillCircle(0, 0, 40);

    this.baseGraphics.lineStyle(1.5, 0x334155, 0.6);
    this.baseGraphics.strokeCircle(0, 0, 39);
  }

  /**
   * Stylized frog / gargoyle muzzle that rotates toward aim target.
   */
  private renderTurret(): void {
    this.turretGraphics.clear();

    // Left cannon tooth / bracket
    this.turretGraphics.fillStyle(0x334155, 1);
    this.turretGraphics.fillRoundedRect(-22, -34, 12, 48, 4);

    // Right cannon tooth / bracket
    this.turretGraphics.fillStyle(0x334155, 1);
    this.turretGraphics.fillRoundedRect(10, -34, 12, 48, 4);

    // Center chamber glow ring
    this.turretGraphics.lineStyle(2, 0x38bdf8, 0.7);
    this.turretGraphics.strokeCircle(0, 0, BALL_RADIUS + 3);

    // Forward aiming guide notch
    this.turretGraphics.fillStyle(0x38bdf8, 0.9);
    this.turretGraphics.fillTriangle(0, -36, -4, -28, 4, -28);
  }

  private renderNextSlot(): void {
    this.nextOrbSlotGraphics.clear();
    const r = BALL_RADIUS * 0.65;
    const offsetX = 56;
    const offsetY = 24;

    this.nextOrbSlotGraphics.fillStyle(0x0f172a, 0.9);
    this.nextOrbSlotGraphics.fillCircle(offsetX, offsetY, r + 4);
    this.nextOrbSlotGraphics.lineStyle(1.5, 0x475569, 0.8);
    this.nextOrbSlotGraphics.strokeCircle(offsetX, offsetY, r + 4);
  }

  /**
   * Rotates turret to face target point (e.g. mouse cursor) and updates aim trajectory.
   */
  public updateAim(targetX: number, targetY: number): void {
    const angle = Phaser.Math.Angle.Between(
      this.container.x,
      this.container.y,
      targetX,
      targetY
    );
    this.currentAimAngle = angle;
    this.turretContainer.setRotation(angle);

    this.renderAimLine();
  }

  /**
   * Draws a subtle dashed guide line from muzzle towards the aim direction.
   */
  private renderAimLine(): void {
    this.aimLineGraphics.clear();
    const startDistance = 45;
    const maxLineDist = 450;
    const colorHex = BALL_COLOR_HEX[this.currentColor];

    const cos = Math.cos(this.currentAimAngle);
    const sin = Math.sin(this.currentAimAngle);

    const dotSpacing = 24;
    for (let d = startDistance; d < maxLineDist; d += dotSpacing) {
      const px = this.container.x + cos * d;
      const py = this.container.y + sin * d;
      const alpha = Math.max(0.08, 0.45 * (1 - d / maxLineDist));

      this.aimLineGraphics.fillStyle(colorHex, alpha);
      this.aimLineGraphics.fillCircle(px, py, 2.5);
    }
  }

  /**
   * Fires the currently loaded orb and reloads the next orb.
   */
  public shoot(): Projectile | null {
    if (!this.canShoot) return null;

    this.canShoot = false;
    this.scene.time.delayedCall(this.shootCooldownMs, () => {
      this.canShoot = true;
    });

    const firedColor = this.currentColor;
    const muzzleDist = 38;
    const spawnX = this.container.x + Math.cos(this.currentAimAngle) * muzzleDist;
    const spawnY = this.container.y + Math.sin(this.currentAimAngle) * muzzleDist;

    // Turret recoil animation
    this.scene.tweens.add({
      targets: this.turretContainer,
      x: -Math.cos(this.currentAimAngle) * 8,
      y: -Math.sin(this.currentAimAngle) * 8,
      duration: 50,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.turretContainer.setPosition(0, 0);
      },
    });

    // Advance queue: loaded becomes next, generate new next
    this.currentColor = this.nextColor;
    this.nextColor = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;

    this.loadedOrbSprite.setTexture(`orb_${this.currentColor}`);
    this.nextOrbSprite.setTexture(`orb_${this.nextColor}`);
    this.renderAimLine();

    AudioSynth.playShoot();

    return new Projectile(
      this.scene,
      spawnX,
      spawnY,
      this.currentAimAngle,
      firedColor,
      this.projectileSpeed
    );
  }

  /**
   * Swaps the loaded orb with the queued secondary orb.
   */
  public swapColors(): void {
    const temp = this.currentColor;
    this.currentColor = this.nextColor;
    this.nextColor = temp;

    this.loadedOrbSprite.setTexture(`orb_${this.currentColor}`);
    this.nextOrbSprite.setTexture(`orb_${this.nextColor}`);
    this.renderAimLine();

    AudioSynth.playSwap();
  }

  public get x(): number {
    return this.container.x;
  }

  public get y(): number {
    return this.container.y;
  }

  public destroy(): void {
    this.aimLineGraphics.destroy();
    this.container.destroy();
  }
}
