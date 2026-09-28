import Phaser from 'phaser';
import {
  BALL_COLOR_HEX,
  BALL_COLOR_HIGHLIGHTS,
  BALL_COLORS,
  BALL_RADIUS,
  BallColor,
  SHOOTER_X,
  SHOOTER_Y,
} from '../utils/constants';
import { AudioSynth } from '../utils/AudioSynth';
import { Projectile } from './Projectile';

/**
 * Shooter represents the player's rotating launcher.
 * Visual container with aiming line, loaded orb, queued orb, and shooting recoil.
 */
export class Shooter {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private turretContainer: Phaser.GameObjects.Container;
  private baseGraphics: Phaser.GameObjects.Graphics;
  private turretGraphics: Phaser.GameObjects.Graphics;
  private loadedOrbGraphics: Phaser.GameObjects.Graphics;
  private nextOrbGraphics: Phaser.GameObjects.Graphics;
  private aimLineGraphics: Phaser.GameObjects.Graphics;

  public currentColor: BallColor;
  public nextColor: BallColor;
  private currentAimAngle: number = -Math.PI / 2;
  private canShoot: boolean = true;
  private shootCooldownMs: number = 220;

  constructor(scene: Phaser.Scene, x: number = SHOOTER_X, y: number = SHOOTER_Y) {
    this.scene = scene;
    this.currentColor = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;
    this.nextColor = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;

    this.container = this.scene.add.container(x, y);
    this.turretContainer = this.scene.add.container(0, 0);

    this.aimLineGraphics = this.scene.add.graphics();
    this.baseGraphics = this.scene.add.graphics();
    this.turretGraphics = this.scene.add.graphics();
    this.loadedOrbGraphics = this.scene.add.graphics();
    this.nextOrbGraphics = this.scene.add.graphics();

    // Assemble display hierarchy
    this.container.add(this.baseGraphics);
    this.container.add(this.turretContainer);
    this.turretContainer.add(this.turretGraphics);
    this.turretContainer.add(this.loadedOrbGraphics);
    this.container.add(this.nextOrbGraphics);

    this.renderBase();
    this.renderTurret();
    this.renderLoadedOrb();
    this.renderNextOrb();
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
    this.baseGraphics.fillCircle(0, 0, 50);

    // Metallic ring
    this.baseGraphics.lineStyle(3, 0x475569, 1);
    this.baseGraphics.strokeCircle(0, 0, 47);

    // Inner mechanical well
    this.baseGraphics.fillStyle(0x0f172a, 1);
    this.baseGraphics.fillCircle(0, 0, 36);

    // Subtle alignment marks
    this.baseGraphics.lineStyle(1.5, 0x64748b, 0.5);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.baseGraphics.lineBetween(cos * 38, sin * 38, cos * 45, sin * 45);
    }
  }

  /**
   * Turret nozzle / barrel that rotates toward the mouse cursor.
   */
  private renderTurret(): void {
    this.turretGraphics.clear();

    // Dual guide rails pointing forward along local +X axis
    this.turretGraphics.fillStyle(0x334155, 1);
    this.turretGraphics.fillRect(6, -14, 34, 6);
    this.turretGraphics.fillRect(6, 8, 34, 6);

    // Aiming laser guide / arrow pointer
    this.turretGraphics.fillStyle(0x38bdf8, 0.85);
    this.turretGraphics.beginPath();
    this.turretGraphics.moveTo(42, 0);
    this.turretGraphics.lineTo(34, -5);
    this.turretGraphics.lineTo(34, 5);
    this.turretGraphics.closePath();
    this.turretGraphics.fillPath();

    // Chamber cradle
    this.turretGraphics.fillStyle(0x1e293b, 0.9);
    this.turretGraphics.fillCircle(0, 0, BALL_RADIUS + 4);
    this.turretGraphics.lineStyle(2, 0x64748b, 0.8);
    this.turretGraphics.strokeCircle(0, 0, BALL_RADIUS + 4);
  }

  /**
   * Loaded active orb resting in the chamber.
   */
  private renderLoadedOrb(): void {
    this.loadedOrbGraphics.clear();
    const colorHex = BALL_COLOR_HEX[this.currentColor];
    const highlightHex = BALL_COLOR_HIGHLIGHTS[this.currentColor];
    const r = BALL_RADIUS;

    this.loadedOrbGraphics.fillStyle(colorHex, 1);
    this.loadedOrbGraphics.fillCircle(0, 0, r);

    // Gloss
    this.loadedOrbGraphics.fillStyle(0xffffff, 0.7);
    this.loadedOrbGraphics.fillEllipse(-r * 0.35, -r * 0.35, r * 0.45, r * 0.25);
    this.loadedOrbGraphics.fillStyle(highlightHex, 0.4);
    this.loadedOrbGraphics.fillCircle(-r * 0.2, -r * 0.2, r * 0.35);

    // Rim highlight
    this.loadedOrbGraphics.lineStyle(1.5, 0xffffff, 0.3);
    this.loadedOrbGraphics.strokeCircle(0, 0, r);
  }

  /**
   * Preview of the next queued orb, rendered in a secondary slot.
   */
  private renderNextOrb(): void {
    this.nextOrbGraphics.clear();
    const colorHex = BALL_COLOR_HEX[this.nextColor];
    const r = BALL_RADIUS * 0.65;
    const offsetX = 56;
    const offsetY = 24;

    // Small slot background
    this.nextOrbGraphics.fillStyle(0x0f172a, 0.9);
    this.nextOrbGraphics.fillCircle(offsetX, offsetY, r + 4);
    this.nextOrbGraphics.lineStyle(1.5, 0x475569, 0.8);
    this.nextOrbGraphics.strokeCircle(offsetX, offsetY, r + 4);

    // Next orb
    this.nextOrbGraphics.fillStyle(colorHex, 0.9);
    this.nextOrbGraphics.fillCircle(offsetX, offsetY, r);
    this.nextOrbGraphics.fillStyle(0xffffff, 0.5);
    this.nextOrbGraphics.fillEllipse(offsetX - r * 0.3, offsetY - r * 0.3, r * 0.4, r * 0.2);
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

    // Update dotted laser trajectory line
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

    // Dotted ray
    const dotSpacing = 22;
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
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.turretContainer.setPosition(0, 0);
      },
    });

    // Advance queue: loaded becomes next, generate new next
    this.currentColor = this.nextColor;
    this.nextColor = Phaser.Utils.Array.GetRandom(BALL_COLORS) as BallColor;

    this.renderLoadedOrb();
    this.renderNextOrb();
    this.renderAimLine();

    AudioSynth.playShoot();

    return new Projectile(
      this.scene,
      spawnX,
      spawnY,
      this.currentAimAngle,
      firedColor,
      1050
    );
  }

  /**
   * Swaps the loaded orb with the queued secondary orb.
   */
  public swapColors(): void {
    const temp = this.currentColor;
    this.currentColor = this.nextColor;
    this.nextColor = temp;

    this.renderLoadedOrb();
    this.renderNextOrb();
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
