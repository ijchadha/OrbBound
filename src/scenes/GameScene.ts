import Phaser from 'phaser';
import { BallChain } from '../entities/BallChain';
import { Projectile } from '../entities/Projectile';
import { Shooter } from '../entities/Shooter';
import { CollisionSystem } from '../systems/CollisionSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { AudioSynth } from '../utils/AudioSynth';
import {
  BALL_RADIUS,
  BallColor,
  CHAIN_SPEED,
  ENABLE_ROLLBACK_PHYSICS,
  FIXED_LEVEL_SEQUENCE,
  GAME_HEIGHT,
  GAME_WIDTH,
  PROJECTILE_SPEED,
  SHOOT_COOLDOWN,
} from '../utils/constants';
import { PathSampler } from '../utils/PathSampler';
import { TextureFactory } from '../utils/TextureFactory';

export class GameScene extends Phaser.Scene {
  private pathSampler!: PathSampler;
  private ballChain!: BallChain;
  private shooter!: Shooter;
  private scoreSystem!: ScoreSystem;
  private projectiles: Projectile[] = [];

  // State flags
  private isPaused: boolean = false;
  private isGameEnded: boolean = false;
  private isDebugOpen: boolean = false;

  // Graphics and HUD elements
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private endpointMarker!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private lastFpsUpdate: number = 0;
  private pauseBtnText!: Phaser.GameObjects.Text;

  // Debug Panel elements
  private debugContainer?: Phaser.GameObjects.Container;
  private debugSpeedLabel?: Phaser.GameObjects.Text;
  private debugProjSpeedLabel?: Phaser.GameObjects.Text;

  // Modals & Overlays
  private pauseModal?: Phaser.GameObjects.Container;
  private endGameModal?: Phaser.GameObjects.Container;
  private gameOverBanner?: Phaser.GameObjects.Container;
  private waveClearBanner?: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'GameScene' });
  }

  public create(): void {
    this.scoreSystem = new ScoreSystem(1);
    this.projectiles = [];
    this.isPaused = false;
    this.isGameEnded = false;
    this.isDebugOpen = false;

    // Prevent default browser right-click context menu so secondary swap works
    if (this.game.canvas) {
      this.game.canvas.oncontextmenu = (e) => e.preventDefault();
    }

    // Pre-bake high-performance WebGL textures for all crystal marble colors
    TextureFactory.ensureTextures(this);

    this.renderBackground();
    this.buildTrack();
    this.renderEndpointMarker();
    this.setupHUD();

    // Initialize ball chain with deterministic matching and cascade callbacks
    this.ballChain = new BallChain(this, this.pathSampler, {
      onReachedEnd: () => this.handleChainReachedEnd(),
      onMatch: (color, count, x, y, comboMultiplier) =>
        this.handleMatch(color, count, x, y, comboMultiplier),
      onWaveCleared: () => this.handleWaveCleared(),
    });

    this.shooter = new Shooter(this);

    // Initialize debug panel after ballChain and shooter are active
    this.setupDebugPanel();

    // Aiming tracking (only when not paused/ended)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner) return;
      this.shooter.updateAim(pointer.x, pointer.y);
    });

    // Shooting on Left-Click, Swapping colors on Right-Click
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner) return;

      // Don't fire if clicking inside top HUD bar area (y < 85) or debug panel (y > 670 when open)
      if (pointer.y < 85) return;
      if (this.isDebugOpen && pointer.y > 640) return;

      if (pointer.rightButtonDown() || pointer.button === 2) {
        this.shooter.swapColors();
      } else {
        const projectile = this.shooter.shoot();
        if (projectile) {
          this.projectiles.push(projectile);
        }
      }
    });

    // Keyboard Shortcuts
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner) return;
      this.shooter.swapColors();
    });

    // Pause toggle: P or ESC
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    // Restart shortcut: R
    this.input.keyboard?.on('keydown-R', () => this.restartCurrentLevel());

    // Debug panel toggle: D
    this.input.keyboard?.on('keydown-D', () => this.toggleDebugPanel());
  }

  public override update(time: number, delta: number): void {
    // Real-time FPS monitoring (refreshed every 250ms for clean readability)
    if (time - this.lastFpsUpdate > 250) {
      this.lastFpsUpdate = time;
      const fps = Math.round(this.game.loop.actualFps);
      if (this.fpsText) {
        this.fpsText.setText(`${fps} FPS`);
        if (fps >= 55) {
          this.fpsText.setColor('#10b981');
        } else if (fps >= 35) {
          this.fpsText.setColor('#f59e0b');
        } else {
          this.fpsText.setColor('#ef4444');
        }
      }
    }

    if (this.isPaused || this.isGameEnded) return;

    if (this.ballChain) {
      this.ballChain.update(time, delta);
    }

    // Update projectiles & test collisions
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const alive = proj.update(delta);

      if (!alive) {
        this.projectiles.splice(i, 1);
        this.scoreSystem.resetCombo();
        continue;
      }

      // Check collision against the moving chain
      const collision = CollisionSystem.checkBallChainCollision(
        proj.x,
        proj.y,
        proj.radius,
        this.ballChain,
        this.pathSampler
      );

      if (collision) {
        this.ballChain.insertBallAt(proj.color, collision.insertIndex);
        proj.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Constructs the predefined curved path across the 1280x720 canvas.
   */
  private buildTrack(): void {
    const path = new Phaser.Curves.Path(-40, 110);

    path.splineTo([
      new Phaser.Math.Vector2(320, 90),
      new Phaser.Math.Vector2(760, 100),
      new Phaser.Math.Vector2(1120, 150),
      new Phaser.Math.Vector2(1170, 320),
      new Phaser.Math.Vector2(1040, 460),
      new Phaser.Math.Vector2(700, 480),
      new Phaser.Math.Vector2(340, 470),
      new Phaser.Math.Vector2(160, 380),
      new Phaser.Math.Vector2(200, 240),
      new Phaser.Math.Vector2(460, 210),
      new Phaser.Math.Vector2(740, 230),
      new Phaser.Math.Vector2(840, 340),
      new Phaser.Math.Vector2(640, 360), // Endpoint / Vortex coordinate
    ]);

    this.pathSampler = new PathSampler(path, 2);

    this.trackGraphics = this.add.graphics();
    this.pathSampler.drawTrack(this.trackGraphics);
  }

  /**
   * Renders the mystical vortex singularity at the track's endpoint.
   * Features a rotating runic outer ring, event horizon, and pulsating core.
   */
  private renderEndpointMarker(): void {
    const endPoint = this.pathSampler.getPointAtDistance(this.pathSampler.totalLength);

    this.endpointMarker = this.add.container(endPoint.x, endPoint.y);
    this.endpointMarker.setDepth(15);

    // 1. Outer hazard glow aura
    const auraG = this.add.graphics();
    auraG.fillStyle(0x7f1d1d, 0.45);
    auraG.fillCircle(0, 0, 54);
    auraG.fillStyle(0xdc2626, 0.2);
    auraG.fillCircle(0, 0, 46);
    this.endpointMarker.add(auraG);

    // 2. Rotating Runic Wheel with 8 arcane teeth / spikes
    const runicWheel = this.add.container(0, 0);
    const wheelG = this.add.graphics();

    wheelG.lineStyle(2.5, 0xef4444, 0.85);
    wheelG.strokeCircle(0, 0, 40);

    const teethCount = 8;
    for (let i = 0; i < teethCount; i++) {
      const angle = (Math.PI * 2 * i) / teethCount;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const outerCos = Math.cos(angle + 0.15);
      const outerSin = Math.sin(angle + 0.15);

      wheelG.fillStyle(0xb91c1c, 0.9);
      wheelG.beginPath();
      wheelG.moveTo(cos * 38, sin * 38);
      wheelG.lineTo(outerCos * 47, outerSin * 47);
      wheelG.lineTo(Math.cos(angle - 0.15) * 47, Math.sin(angle - 0.15) * 47);
      wheelG.closePath();
      wheelG.fillPath();
    }
    runicWheel.add(wheelG);
    this.endpointMarker.add(runicWheel);

    // Continuous clockwise rotation for the runic teeth
    this.tweens.add({
      targets: runicWheel,
      angle: 360,
      duration: 10000,
      repeat: -1,
      ease: 'Linear',
    });

    // 3. Dark Singularity / Event Horizon
    const coreG = this.add.graphics();
    coreG.fillStyle(0x020408, 1);
    coreG.fillCircle(0, 0, 33);

    // Inner swirling accretion glow
    coreG.lineStyle(3, 0xdc2626, 0.9);
    coreG.strokeCircle(0, 0, 24);

    coreG.fillStyle(0xef4444, 0.85);
    coreG.fillCircle(0, 0, 14);

    coreG.fillStyle(0xfecaca, 0.95);
    coreG.fillCircle(0, 0, 6);
    this.endpointMarker.add(coreG);

    // Rhythmic breathing / suction pulsation
    this.tweens.add({
      targets: coreG,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Draws an ancient mystical stone temple floor with flagstone masonry,
   * glowing dais for the shooter, and carved border framing.
   */
  private renderBackground(): void {
    this.backgroundGraphics = this.add.graphics();
    this.backgroundGraphics.setDepth(0);

    // Deep slate base
    this.backgroundGraphics.fillStyle(0x070b14, 1);
    this.backgroundGraphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 1. Large masonry flagstone tiles (80x80)
    const tileSize = 80;
    for (let x = 0; x < GAME_WIDTH; x += tileSize) {
      for (let y = 0; y < GAME_HEIGHT; y += tileSize) {
        const isAlt = ((x / tileSize) + (y / tileSize)) % 2 === 0;

        // Subtle tile surface variation
        this.backgroundGraphics.fillStyle(isAlt ? 0x090f1d : 0x0c1322, 1);
        this.backgroundGraphics.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);

        // Mortar shadow lines
        this.backgroundGraphics.lineStyle(1.5, 0x03060a, 0.8);
        this.backgroundGraphics.strokeRect(x, y, tileSize, tileSize);

        // Subtle inner stone bevel
        this.backgroundGraphics.lineStyle(1, 0x1e293b, 0.25);
        this.backgroundGraphics.lineBetween(x + 2, y + 2, x + tileSize - 2, y + 2);
        this.backgroundGraphics.lineBetween(x + 2, y + 2, x + 2, y + tileSize - 2);
      }
    }

    // 2. Arcane circular dais beneath the Shooter platform (x: 640, y: 640)
    this.backgroundGraphics.fillStyle(0x020408, 0.6);
    this.backgroundGraphics.fillCircle(640, 640, 95);

    this.backgroundGraphics.lineStyle(2, 0x0284c7, 0.4);
    this.backgroundGraphics.strokeCircle(640, 640, 90);

    this.backgroundGraphics.lineStyle(1.5, 0x38bdf8, 0.3);
    this.backgroundGraphics.strokeCircle(640, 640, 75);

    // Radiant spokes from dais
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      this.backgroundGraphics.lineBetween(
        640 + cos * 75, 640 + sin * 75,
        640 + cos * 90, 640 + sin * 90
      );
    }

    // 3. Temple outer decorative border
    this.backgroundGraphics.lineStyle(3, 0x334155, 0.85);
    this.backgroundGraphics.strokeRect(10, 10, GAME_WIDTH - 20, GAME_HEIGHT - 20);

    this.backgroundGraphics.lineStyle(1, 0x64748b, 0.4);
    this.backgroundGraphics.strokeRect(15, 15, GAME_WIDTH - 30, GAME_HEIGHT - 30);

    // Corner decorative brackets
    const corners = [
      [10, 10], [GAME_WIDTH - 10, 10],
      [10, GAME_HEIGHT - 10], [GAME_WIDTH - 10, GAME_HEIGHT - 10]
    ];
    for (const [cx, cy] of corners) {
      this.backgroundGraphics.fillStyle(0x38bdf8, 0.6);
      this.backgroundGraphics.fillCircle(cx, cy, 4);
    }
  }

  /**
   * Configures HUD with stats and interactive Pause, Restart, and End Game buttons.
   */
  private setupHUD(): void {
    const hudContainer = this.add.container(0, 0);

    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x0f172a, 0.9);
    hudBg.fillRoundedRect(24, 16, GAME_WIDTH - 48, 56, 10);
    hudBg.lineStyle(1.5, 0x334155, 0.85);
    hudBg.strokeRoundedRect(24, 16, GAME_WIDTH - 48, 56, 10);
    hudContainer.add(hudBg);

    // Brand title
    const titleText = this.add.text(42, 33, 'ORBBOUND', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    hudContainer.add(titleText);

    // Level label
    this.levelText = this.add.text(172, 34, 'LVL 1', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#c084fc',
    });
    hudContainer.add(this.levelText);

    // Score label
    this.scoreText = this.add.text(250, 34, 'SCORE: 000000', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#38bdf8',
    });
    hudContainer.add(this.scoreText);

    // Combo label
    this.comboText = this.add.text(425, 34, 'COMBO: x1', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#f59e0b',
    });
    hudContainer.add(this.comboText);

    // FPS Counter Badge
    const fpsBg = this.add.graphics();
    fpsBg.fillStyle(0x0a101d, 0.95);
    fpsBg.fillRoundedRect(535, 27, 88, 34, 6);
    fpsBg.lineStyle(1.5, 0x1e293b, 0.9);
    fpsBg.strokeRoundedRect(535, 27, 88, 34, 6);
    hudContainer.add(fpsBg);

    this.fpsText = this.add.text(579, 44, '60 FPS', {
      fontFamily: 'monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#10b981',
    });
    this.fpsText.setOrigin(0.5, 0.5);
    hudContainer.add(this.fpsText);

    // --- Interactive Action Buttons in HUD ---

    // 1. Pause Button
    const pauseBtn = this.createButton(
      690,
      44,
      115,
      36,
      '❚❚ PAUSE (P)',
      0x1e293b,
      0x334155,
      0x38bdf8,
      () => this.togglePause()
    );
    hudContainer.add(pauseBtn.container);
    this.pauseBtnText = pauseBtn.label;

    // 2. Restart Level Button
    const restartBtn = this.createButton(
      825,
      44,
      130,
      36,
      '↻ RESTART (R)',
      0x1e293b,
      0x334155,
      0xf59e0b,
      () => this.restartCurrentLevel()
    );
    hudContainer.add(restartBtn.container);

    // 3. End Game Button
    const endBtn = this.createButton(
      965,
      44,
      115,
      36,
      '✕ END GAME',
      0x1e293b,
      0x450a0a,
      0xef4444,
      () => this.endGame()
    );
    hudContainer.add(endBtn.container);

    // 4. Debug Panel Toggle Button
    const debugBtn = this.createButton(
      1110,
      44,
      130,
      36,
      '🛠 DEBUG (D)',
      0x1e293b,
      0x3b82f6,
      0x60a5fa,
      () => this.toggleDebugPanel()
    );
    hudContainer.add(debugBtn.container);

    // Helper hint text along bottom right
    const hintText = this.add.text(
      GAME_WIDTH - 36,
      GAME_HEIGHT - 22,
      'Aim & Left-Click: Fire | Right-Click / Space: Swap | P: Pause | R: Restart | D: Debug Controls',
      {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '11px',
        color: '#64748b',
      }
    );
    hintText.setOrigin(1, 0.5);

    // Subscribe to score updates
    this.scoreSystem.subscribe((score, level, combo) => {
      this.scoreText.setText(`SCORE: ${score.toString().padStart(6, '0')}`);
      this.levelText.setText(`LVL ${level}`);
      this.comboText.setText(`COMBO: x${combo}`);
    });
  }

  /**
   * Day 1 Designer Debug & Tuning Panel (Task 8).
   * Allows live tuning of chain speed, projectile speed, and instant cascade testing.
   */
  private setupDebugPanel(): void {
    this.debugContainer = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 45);
    this.debugContainer.setDepth(80);
    this.debugContainer.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x090d16, 0.95);
    bg.fillRoundedRect(-580, -32, 1160, 64, 10);
    bg.lineStyle(1.5, 0x3b82f6, 0.7);
    bg.strokeRoundedRect(-580, -32, 1160, 64, 10);
    this.debugContainer.add(bg);

    const title = this.add.text(-560, -18, 'DEV CONTROLS', {
      fontFamily: 'monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#3b82f6',
    });
    this.debugContainer.add(title);

    // --- Chain Speed Tuning ---
    this.debugSpeedLabel = this.add.text(-440, 2, `SPEED: ${CHAIN_SPEED} px/s`, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#f8fafc',
    });
    this.debugContainer.add(this.debugSpeedLabel);

    const speedDown = this.createButton(-335, 8, 28, 26, '-10', 0x1e293b, 0x334155, 0x38bdf8, () => {
      const newSpeed = Math.max(10, this.ballChain.getSpeed() - 10);
      this.ballChain.setSpeed(newSpeed);
      this.debugSpeedLabel?.setText(`SPEED: ${newSpeed} px/s`);
    });
    this.debugContainer.add(speedDown.container);

    const speedUp = this.createButton(-295, 8, 28, 26, '+10', 0x1e293b, 0x334155, 0x38bdf8, () => {
      const newSpeed = this.ballChain.getSpeed() + 10;
      this.ballChain.setSpeed(newSpeed);
      this.debugSpeedLabel?.setText(`SPEED: ${newSpeed} px/s`);
    });
    this.debugContainer.add(speedUp.container);

    // --- Projectile Speed Tuning (Phase 4: 800, 950, 1050, 1200) ---
    this.debugProjSpeedLabel = this.add.text(-240, 2, `PROJ: ${PROJECTILE_SPEED}`, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#f8fafc',
    });
    this.debugContainer.add(this.debugProjSpeedLabel);

    const projSpeeds = [950, 1100, 1250, 1400];
    let projIdx = projSpeeds.indexOf(PROJECTILE_SPEED);
    if (projIdx === -1) projIdx = 2;

    const cycleProj = this.createButton(-130, 8, 75, 26, 'Cycle Vel', 0x1e293b, 0x334155, 0x38bdf8, () => {
      projIdx = (projIdx + 1) % projSpeeds.length;
      const nextSpd = projSpeeds[projIdx];
      this.shooter.projectileSpeed = nextSpd;
      this.debugProjSpeedLabel?.setText(`PROJ: ${nextSpd}`);
      this.showTemporaryToast(`PROJ SPEED: ${nextSpd} px/s`);
    });
    this.debugContainer.add(cycleProj.container);

    // --- Phase 3 Test Case Launcher ---
    // Spawns: RED RED GREEN GREEN GREEN RED RED
    const phase3Btn = this.createButton(
      60,
      8,
      210,
      26,
      '🎯 Spawn Phase-3 Cascade Test',
      0x1e293b,
      0x059669,
      0x34d399,
      () => this.spawnPhase3TestCase()
    );
    this.debugContainer.add(phase3Btn.container);

    // --- Reset to Fixed Test Level ---
    const resetFixedBtn = this.createButton(
      240,
      8,
      125,
      26,
      '↻ Fixed Level 1',
      0x1e293b,
      0xd97706,
      0xfbbf24,
      () => this.restartCurrentLevel()
    );
    this.debugContainer.add(resetFixedBtn.container);

    // --- Toggle Rollback Physics (Phase 6) ---
    const isRollbackActive = this.ballChain ? this.ballChain.enableRollbackPhysics : ENABLE_ROLLBACK_PHYSICS;
    const rollbackBtn = this.createButton(
      410,
      8,
      175,
      26,
      isRollbackActive ? 'Rollback: ON' : 'Rollback: OFF (Day 1)',
      0x1e293b,
      0x334155,
      0xa855f7,
      () => {
        if (!this.ballChain) return;
        this.ballChain.enableRollbackPhysics = !this.ballChain.enableRollbackPhysics;
        rollbackBtn.label.setText(
          this.ballChain.enableRollbackPhysics ? 'Rollback: ON' : 'Rollback: OFF (Day 1)'
        );
        this.showTemporaryToast(
          `ROLLBACK PHYSICS: ${this.ballChain.enableRollbackPhysics ? 'ENABLED' : 'DISABLED (DAY 1 MODE)'}`
        );
      }
    );
    this.debugContainer.add(rollbackBtn.container);
  }

  private toggleDebugPanel(): void {
    this.isDebugOpen = !this.isDebugOpen;
    this.debugContainer?.setVisible(this.isDebugOpen);
    AudioSynth.playUiClick();
  }

  /**
   * Spawns the exact Phase 3 example from the brief:
   * [RED, RED, GREEN, GREEN, GREEN, RED, RED]
   * Pre-loads the shooter with a GREEN orb so a single shot triggers:
   * Match 3 green -> pop -> gap collapses -> 4 red meet -> secondary cascade match!
   */
  public spawnPhase3TestCase(): void {
    AudioSynth.playUiClick();
    for (const p of this.projectiles) p.destroy();
    this.projectiles = [];

    const testPattern: BallColor[] = [
      BallColor.RED,
      BallColor.RED,
      BallColor.GREEN,
      BallColor.GREEN,
      BallColor.GREEN,
      BallColor.RED,
      BallColor.RED,
    ];

    this.ballChain.spawnInitialChain(testPattern);

    // Ensure player has GREEN to test the trigger
    this.shooter.currentColor = BallColor.GREEN;
    this.shooter.nextColor = BallColor.RED;

    this.showTemporaryToast('PHASE 3 TEST LOADED: 🔴🔴 🟢🟢🟢 🔴🔴');
  }

  /**
   * Helper to create styled, interactive UI buttons with hover effects.
   */
  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    bgColor: number,
    hoverBgColor: number,
    textColorHex: number,
    onClick: () => void
  ): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    const renderBg = (color: number) => {
      bg.clear();
      bg.fillStyle(color, 0.95);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 7);
      bg.lineStyle(1.5, textColorHex, 0.6);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 7);
    };
    renderBg(bgColor);
    container.add(bg);

    const label = this.add.text(0, 0, text, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: `#${textColorHex.toString(16).padStart(6, '0')}`,
    });
    label.setOrigin(0.5);
    container.add(label);

    const zone = this.add.zone(0, 0, width, height);
    zone.setInteractive({ useHandCursor: true });
    container.add(zone);

    zone.on('pointerover', () => {
      renderBg(hoverBgColor);
      container.setScale(1.04);
    });

    zone.on('pointerout', () => {
      renderBg(bgColor);
      container.setScale(1.0);
    });

    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      AudioSynth.playUiClick();
      onClick();
    });

    return { container, label };
  }

  /**
   * Toggles the game pause state and displays the pause modal overlay.
   */
  public togglePause(): void {
    if (this.isGameEnded || this.gameOverBanner) return;

    AudioSynth.playUiClick();
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      this.pauseBtnText.setText('▶ RESUME (P)');
      this.showPauseModal();
    } else {
      this.pauseBtnText.setText('❚❚ PAUSE (P)');
      this.hidePauseModal();
    }
  }

  /**
   * Builds and displays the frosted pause modal overlay.
   */
  private showPauseModal(): void {
    if (this.pauseModal) return;

    this.pauseModal = this.add.container(0, 0);
    this.pauseModal.setDepth(100);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050811, 0.78);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains
    );
    this.pauseModal.add(backdrop);

    const modalBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.pauseModal.add(modalBox);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0f172a, 0.98);
    panelBg.fillRoundedRect(-220, -170, 440, 340, 14);
    panelBg.lineStyle(2, 0x38bdf8, 0.9);
    panelBg.strokeRoundedRect(-220, -170, 440, 340, 14);
    modalBox.add(panelBg);

    const title = this.add.text(0, -125, 'GAME PAUSED', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    title.setOrigin(0.5);
    modalBox.add(title);

    const statsText = this.add.text(
      0,
      -75,
      `LEVEL: ${this.scoreSystem.getLevel()}   |   SCORE: ${this.scoreSystem.getScore()}   |   MAX COMBO: x${this.scoreSystem.getMaxCombo()}`,
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#94a3b8',
      }
    );
    statsText.setOrigin(0.5);
    modalBox.add(statsText);

    const resumeBtn = this.createButton(
      0,
      -20,
      280,
      44,
      '▶  RESUME GAME  (P / ESC)',
      0x1e293b,
      0x0284c7,
      0x38bdf8,
      () => this.togglePause()
    );
    modalBox.add(resumeBtn.container);

    const restartBtn = this.createButton(
      0,
      42,
      280,
      44,
      '↻  RESTART LEVEL  (R)',
      0x1e293b,
      0xd97706,
      0xfbbf24,
      () => this.restartCurrentLevel()
    );
    modalBox.add(restartBtn.container);

    const endBtn = this.createButton(
      0,
      104,
      280,
      44,
      '✕  END GAME',
      0x1e293b,
      0x991b1b,
      0xf87171,
      () => this.endGame()
    );
    modalBox.add(endBtn.container);

    modalBox.setScale(0.92);
    modalBox.setAlpha(0);
    this.tweens.add({
      targets: modalBox,
      scale: 1,
      alpha: 1,
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  private hidePauseModal(): void {
    if (this.pauseModal) {
      this.pauseModal.destroy();
      this.pauseModal = undefined;
    }
  }

  /**
   * Restarts current level using the fixed sequence for Level 1 (Phase 9).
   */
  public restartCurrentLevel(): void {
    AudioSynth.playUiClick();

    this.hidePauseModal();
    this.hideEndGameModal();
    if (this.gameOverBanner) {
      this.gameOverBanner.destroy();
      this.gameOverBanner = undefined;
    }
    if (this.waveClearBanner) {
      this.waveClearBanner.destroy();
      this.waveClearBanner = undefined;
    }

    this.isPaused = false;
    this.isGameEnded = false;
    this.pauseBtnText.setText('❚❚ PAUSE (P)');

    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    this.scoreSystem.resetForCurrentLevel();

    const currentLevel = this.scoreSystem.getLevel();
    if (currentLevel === 1) {
      this.ballChain.spawnInitialChain(FIXED_LEVEL_SEQUENCE);
    } else {
      const ballCount = 25 + currentLevel * 2;
      this.ballChain.spawnInitialChain(ballCount);
    }

    this.showTemporaryToast(`LEVEL ${currentLevel} RESTARTED`);
  }

  /**
   * Ends current session and shows the summary card.
   */
  public endGame(): void {
    AudioSynth.playUiClick();

    this.hidePauseModal();
    this.isPaused = false;
    this.isGameEnded = true;

    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    this.showEndGameModal();
  }

  /**
   * Game Over / Session summary card.
   */
  private showEndGameModal(): void {
    if (this.endGameModal) return;

    this.endGameModal = this.add.container(0, 0);
    this.endGameModal.setDepth(100);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050811, 0.85);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains
    );
    this.endGameModal.add(backdrop);

    const modalBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.endGameModal.add(modalBox);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0f172a, 0.98);
    panelBg.fillRoundedRect(-240, -190, 480, 380, 16);
    panelBg.lineStyle(2, 0xef4444, 0.9);
    panelBg.strokeRoundedRect(-240, -190, 480, 380, 16);
    modalBox.add(panelBg);

    const title = this.add.text(0, -145, 'GAME OVER', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ef4444',
    });
    title.setOrigin(0.5);
    modalBox.add(title);

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x1e293b, 0.85);
    cardBg.fillRoundedRect(-190, -100, 380, 120, 10);
    modalBox.add(cardBg);

    const scoreLabel = this.add.text(0, -78, 'FINAL SCORE', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      color: '#94a3b8',
    });
    scoreLabel.setOrigin(0.5);
    modalBox.add(scoreLabel);

    const finalScoreText = this.add.text(0, -50, this.scoreSystem.getScore().toLocaleString(), {
      fontFamily: 'monospace',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#38bdf8',
    });
    finalScoreText.setOrigin(0.5);
    modalBox.add(finalScoreText);

    const detailsText = this.add.text(
      0,
      -10,
      `LEVEL REACHED: ${this.scoreSystem.getLevel()}    •    BEST COMBO: x${this.scoreSystem.getMaxCombo()}`,
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f59e0b',
      }
    );
    detailsText.setOrigin(0.5);
    modalBox.add(detailsText);

    const playAgainBtn = this.createButton(
      0,
      50,
      320,
      46,
      '▶  PLAY AGAIN  (FROM LVL 1)',
      0x1e293b,
      0x059669,
      0x34d399,
      () => this.startFreshGame()
    );
    modalBox.add(playAgainBtn.container);

    const restartLevelBtn = this.createButton(
      0,
      110,
      320,
      46,
      `↻  RETRY LEVEL ${this.scoreSystem.getLevel()}`,
      0x1e293b,
      0x2563eb,
      0x60a5fa,
      () => this.restartCurrentLevel()
    );
    modalBox.add(restartLevelBtn.container);

    modalBox.setScale(0.9);
    modalBox.setAlpha(0);
    this.tweens.add({
      targets: modalBox,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
  }

  private hideEndGameModal(): void {
    if (this.endGameModal) {
      this.endGameModal.destroy();
      this.endGameModal = undefined;
    }
  }

  /**
   * Resets score, level to 1, and spawns the fixed Level 1 test layout.
   */
  public startFreshGame(): void {
    AudioSynth.playUiClick();
    this.hideEndGameModal();
    this.hidePauseModal();
    if (this.gameOverBanner) {
      this.gameOverBanner.destroy();
      this.gameOverBanner = undefined;
    }

    this.isPaused = false;
    this.isGameEnded = false;
    this.pauseBtnText.setText('❚❚ PAUSE (P)');

    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    this.scoreSystem.resetAll();
    this.ballChain.setSpeed(CHAIN_SPEED);
    this.ballChain.spawnInitialChain(FIXED_LEVEL_SEQUENCE);

    this.showTemporaryToast('NEW GAME STARTED - FIXED LEVEL 1');
  }

  private showTemporaryToast(message: string): void {
    const toast = this.add.container(GAME_WIDTH / 2, 105);
    toast.setDepth(90);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(-180, -18, 360, 36, 8);
    bg.lineStyle(1.5, 0x38bdf8, 0.8);
    bg.strokeRoundedRect(-180, -18, 360, 36, 8);
    toast.add(bg);

    const text = this.add.text(0, 0, message, {
      fontFamily: 'monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#38bdf8',
    });
    text.setOrigin(0.5);
    toast.add(text);

    toast.setAlpha(0);
    toast.setScale(0.9);

    this.tweens.add({
      targets: toast,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.time.delayedCall(1400, () => {
          this.tweens.add({
            targets: toast,
            alpha: 0,
            y: 90,
            duration: 250,
            ease: 'Quad.easeIn',
            onComplete: () => toast.destroy(),
          });
        });
      },
    });
  }

  /**
   * Phase 7: Score calculation and floating text for match events.
   */
  private handleMatch(
    _color: string,
    count: number,
    x: number,
    y: number,
    comboMultiplier: number
  ): void {
    const points = this.scoreSystem.recordMatch(count, comboMultiplier);

    const textStr = comboMultiplier > 1 ? `+${points}\nCHAIN x${comboMultiplier}!` : `+${points}`;
    const floatText = this.add.text(x, y - 10, textStr, {
      fontFamily: 'monospace',
      fontSize: comboMultiplier > 1 ? '20px' : '16px',
      fontStyle: 'bold',
      color: comboMultiplier > 1 ? '#f59e0b' : '#38bdf8',
      align: 'center',
    });
    floatText.setOrigin(0.5);

    this.tweens.add({
      targets: floatText,
      y: y - 50,
      alpha: 0,
      scale: 1.15,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }

  /**
   * Phase 8: Level clear condition.
   */
  private handleWaveCleared(): void {
    if (this.waveClearBanner || this.isGameEnded) return;

    const nextLevel = this.scoreSystem.getLevel() + 1;
    this.scoreSystem.setLevel(nextLevel);

    this.waveClearBanner = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
    this.waveClearBanner.setDepth(95);

    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x0f172a, 0.98);
    bannerBg.fillRoundedRect(-200, -70, 400, 140, 14);
    bannerBg.lineStyle(2, 0x10b981, 0.9);
    bannerBg.strokeRoundedRect(-200, -70, 400, 140, 14);
    this.waveClearBanner.add(bannerBg);

    const text = this.add.text(0, -30, 'LEVEL CLEARED!', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#10b981',
    });
    text.setOrigin(0.5);
    this.waveClearBanner.add(text);

    const sub = this.add.text(
      0,
      5,
      `Score: ${this.scoreSystem.getScore()}  |  Best Combo: x${this.scoreSystem.getMaxCombo()}`,
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#94a3b8',
      }
    );
    sub.setOrigin(0.5);
    this.waveClearBanner.add(sub);

    const nextBtn = this.createButton(
      0,
      40,
      220,
      32,
      `▶ ADVANCE TO LVL ${nextLevel}`,
      0x1e293b,
      0x059669,
      0x34d399,
      () => {
        this.waveClearBanner?.destroy();
        this.waveClearBanner = undefined;
        const newSpeed = CHAIN_SPEED + (nextLevel - 1) * 6;
        this.ballChain.setSpeed(newSpeed);
        this.ballChain.spawnInitialChain(25 + nextLevel * 2);
      }
    );
    this.waveClearBanner.add(nextBtn.container);
  }

  /**
   * Phase 8: Lose condition when orbs plunge into the vortex.
   */
  private handleChainReachedEnd(): void {
    if (this.gameOverBanner || this.isGameEnded) return;

    this.gameOverBanner = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.gameOverBanner.setDepth(95);

    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x0f172a, 0.96);
    bannerBg.fillRoundedRect(-240, -120, 480, 240, 14);
    bannerBg.lineStyle(2, 0xef4444, 0.9);
    bannerBg.strokeRoundedRect(-240, -120, 480, 240, 14);
    this.gameOverBanner.add(bannerBg);

    const alertText = this.add.text(0, -75, 'VORTEX BREACHED', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ef4444',
    });
    alertText.setOrigin(0.5);
    this.gameOverBanner.add(alertText);

    const subText = this.add.text(0, -42, 'Orbs penetrated the endpoint seal.', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      color: '#94a3b8',
    });
    subText.setOrigin(0.5);
    this.gameOverBanner.add(subText);

    const retryBtn = this.createButton(
      0,
      5,
      280,
      40,
      '↻  RETRY LEVEL',
      0x1e293b,
      0x0284c7,
      0x38bdf8,
      () => this.restartCurrentLevel()
    );
    this.gameOverBanner.add(retryBtn.container);

    const endBtn = this.createButton(
      0,
      60,
      280,
      40,
      '✕  END GAME & SUMMARY',
      0x1e293b,
      0x991b1b,
      0xf87171,
      () => this.endGame()
    );
    this.gameOverBanner.add(endBtn.container);
  }
}
