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
  GAME_HEIGHT,
  GAME_WIDTH,
  PROJECTILE_SPEED,
} from '../utils/constants';
import { PathSampler } from '../utils/PathSampler';
import { TextureFactory } from '../utils/TextureFactory';
import { LevelManager } from '../managers/LevelManager';
import { LevelDefinition } from '../types/LevelDefinition';

export class GameScene extends Phaser.Scene {
  private levelManager!: LevelManager;
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
  private chainBallsText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private lastFpsUpdate: number = 0;
  private pauseBtnText!: Phaser.GameObjects.Text;
  private lastShotMatches: number = 0;

  // Debug Panel elements
  private debugContainer?: Phaser.GameObjects.Container;
  private debugSpeedLabel?: Phaser.GameObjects.Text;
  private debugProjSpeedLabel?: Phaser.GameObjects.Text;
  private debugTelemetryText?: Phaser.GameObjects.Text;

  // Modals & Overlays
  private pauseModal?: Phaser.GameObjects.Container;
  private endGameModal?: Phaser.GameObjects.Container;
  private gameOverBanner?: Phaser.GameObjects.Container;
  private waveClearBanner?: Phaser.GameObjects.Container;
  private levelSelectModal?: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'GameScene' });
  }

  public create(): void {
    this.levelManager = new LevelManager();
    this.scoreSystem = new ScoreSystem(
      this.levelManager.getCurrentLevelId(),
      this.levelManager.getTotalCampaignScore()
    );
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
    this.buildTrack(this.levelManager.getCurrentLevel());
    this.renderEndpointMarker();
    this.setupHUD();

    // Initialize ball chain with deterministic matching and cascade callbacks
    this.ballChain = new BallChain(this, this.pathSampler, {
      onReachedEnd: () => this.handleChainReachedEnd(),
      onMatch: (color, count, x, y, comboMultiplier) =>
        this.handleMatch(color, count, x, y, comboMultiplier),
      onWaveCleared: () => this.handleWaveCleared(),
      onShotResolved: (matchesCount, finalCombo, remainingBalls) =>
        this.updateChainDebugTelemetry(matchesCount, finalCombo, remainingBalls),
    });

    this.shooter = new Shooter(this);

    // Initialize debug panel after ballChain and shooter are active
    this.setupDebugPanel();

    // Aiming tracking (only when not paused/ended/cleared)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner || this.waveClearBanner || this.levelSelectModal) return;
      this.shooter.updateAim(pointer.x, pointer.y);
    });

    // Shooting on Left-Click, Swapping colors on Right-Click
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner || this.waveClearBanner || this.levelSelectModal) return;

      // Don't fire if clicking inside top HUD bar area (y < 85) or debug panel (y > 640 when open)
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
      if (this.isPaused || this.isGameEnded || this.gameOverBanner || this.waveClearBanner || this.levelSelectModal) return;
      this.shooter.swapColors();
    });

    // Pause toggle: P or ESC
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    // Restart shortcut: R
    this.input.keyboard?.on('keydown-R', () => this.restartCurrentLevel());

    // Debug panel toggle: D
    this.input.keyboard?.on('keydown-D', () => this.toggleDebugPanel());

    // Level select shortcut: L
    this.input.keyboard?.on('keydown-L', () => this.toggleLevelSelectModal());

    // Load initial level definition
    this.loadLevel(this.levelManager.getCurrentLevelId());
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

    if (this.isPaused || this.isGameEnded || this.waveClearBanner || this.levelSelectModal) return;

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
        const matches = this.ballChain.insertBallAt(proj.color, collision.insertIndex);
        proj.destroy();
        this.projectiles.splice(i, 1);

        // Day-1 Requirement 2: A normal shot that produces no match must reset the combo
        if (matches === 0) {
          this.scoreSystem.resetCombo();
        }
      }
    }

    if (this.chainBallsText && this.ballChain) {
      this.chainBallsText.setText(`BALLS: ${this.ballChain.getBalls().length}`);
    }
  }

  /**
   * Constructs the level track dynamically from LevelDefinition data.
   */
  private buildTrack(level?: LevelDefinition): void {
    const lvl = level || this.levelManager.getCurrentLevel();
    const path = new Phaser.Curves.Path(lvl.startPoint.x, lvl.startPoint.y);

    path.splineTo(lvl.pathPoints.map((p) => new Phaser.Math.Vector2(p.x, p.y)));

    this.pathSampler = new PathSampler(path, 2);

    if (!this.trackGraphics) {
      this.trackGraphics = this.add.graphics();
    } else {
      this.trackGraphics.clear();
    }
    this.pathSampler.drawTrack(this.trackGraphics);

    if (this.endpointMarker) {
      const endPoint = this.pathSampler.getPointAtDistance(this.pathSampler.totalLength);
      this.endpointMarker.setPosition(endPoint.x, endPoint.y);
    }
  }

  /**
   * Day 2 Level Loading:
   * Consumes LevelDefinition data to configure track, speed, and deterministic ball sequence.
   */
  public loadLevel(levelId: number, isRestart: boolean = false): void {
    const level = this.levelManager.getLevel(levelId);
    if (!level) return;

    this.levelManager.setCurrentLevelId(levelId);

    // 1. Clean up active projectiles
    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    // 2. Clear current chain balls
    if (this.ballChain) {
      this.ballChain.clearBalls();
    }

    // 3. Apply data-driven path definition
    this.buildTrack(level);
    if (this.ballChain) {
      this.ballChain.setPathSampler(this.pathSampler);
      this.ballChain.setSpeed(level.chainSpeed);
      this.ballChain.spawnInitialChain(level.initialBallSequence);
    }

    // 4. Reset level score and combo while preserving campaign progression
    this.scoreSystem.resetForCurrentLevel(levelId);
    this.scoreSystem.setTotalCampaignScore(this.levelManager.getTotalCampaignScore());

    // 5. Dismiss any open modals and banners
    this.hidePauseModal();
    this.hideEndGameModal();
    this.hideLevelSelectModal();
    if (this.waveClearBanner) {
      this.waveClearBanner.destroy();
      this.waveClearBanner = undefined;
    }
    if (this.gameOverBanner) {
      this.gameOverBanner.destroy();
      this.gameOverBanner = undefined;
    }

    this.isPaused = false;
    this.isGameEnded = false;

    // 6. Update HUD texts
    if (this.levelText) {
      this.levelText.setText(`LVL ${level.id}`);
    }
    if (this.scoreText) {
      this.scoreText.setText('SCORE: 000000');
    }
    if (this.comboText) {
      this.comboText.setText('COMBO: x1');
    }
    if (this.chainBallsText) {
      this.chainBallsText.setText(`BALLS: ${level.initialBallSequence.length}`);
    }
    if (this.debugSpeedLabel) {
      this.debugSpeedLabel.setText(`SPD: ${level.chainSpeed}`);
    }
    this.updateChainDebugTelemetry(0, 1, level.initialBallSequence.length);

    this.showTemporaryToast(
      isRestart
        ? `LEVEL ${level.id} RESTARTED: ${level.name.toUpperCase()}`
        : `LEVEL ${level.id}: ${level.name.toUpperCase()}`
    );
  }

  /**
   * Renders the mystical vortex singularity at the track's endpoint.
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

    // Corner decorative arcane brackets
    const corners = [
      { x: 10, y: 10, dx: 1, dy: 1 },
      { x: GAME_WIDTH - 10, y: 10, dx: -1, dy: 1 },
      { x: 10, y: GAME_HEIGHT - 10, dx: 1, dy: -1 },
      { x: GAME_WIDTH - 10, y: GAME_HEIGHT - 10, dx: -1, dy: -1 },
    ];
    for (const c of corners) {
      this.backgroundGraphics.fillStyle(0x0284c7, 0.85);
      this.backgroundGraphics.fillRect(c.x, c.y, c.dx * 18, c.dy * 4);
      this.backgroundGraphics.fillRect(c.x, c.y, c.dx * 4, c.dy * 18);
    }
  }

  /**
   * Configures HUD with stats and interactive Level Select, Pause, Restart, and Dev buttons.
   */
  private setupHUD(): void {
    const hudContainer = this.add.container(0, 0);

    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x0f172a, 0.92);
    hudBg.fillRoundedRect(20, 14, GAME_WIDTH - 40, 58, 10);
    hudBg.lineStyle(1.5, 0x334155, 0.85);
    hudBg.strokeRoundedRect(20, 14, GAME_WIDTH - 40, 58, 10);
    hudContainer.add(hudBg);

    // Brand title
    const titleText = this.add.text(38, 33, 'ORBBOUND', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    hudContainer.add(titleText);

    // Level label
    this.levelText = this.add.text(160, 34, 'LVL 1', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#c084fc',
    });
    hudContainer.add(this.levelText);

    // Score label
    this.scoreText = this.add.text(230, 34, 'SCORE: 000000', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#38bdf8',
    });
    hudContainer.add(this.scoreText);

    // Combo label
    this.comboText = this.add.text(390, 34, 'COMBO: x1', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#f59e0b',
    });
    hudContainer.add(this.comboText);

    // Ball Count label
    this.chainBallsText = this.add.text(495, 34, 'BALLS: 25', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#10b981',
    });
    hudContainer.add(this.chainBallsText);

    // FPS Counter Badge
    const fpsBg = this.add.graphics();
    fpsBg.fillStyle(0x0a101d, 0.95);
    fpsBg.fillRoundedRect(595, 26, 80, 34, 6);
    fpsBg.lineStyle(1.5, 0x1e293b, 0.9);
    fpsBg.strokeRoundedRect(595, 26, 80, 34, 6);
    hudContainer.add(fpsBg);

    this.fpsText = this.add.text(635, 43, '60 FPS', {
      fontFamily: 'monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#10b981',
    });
    this.fpsText.setOrigin(0.5, 0.5);
    hudContainer.add(this.fpsText);

    // --- Interactive Action Buttons in HUD ---

    // 1. Level Select Button
    const levelsBtn = this.createButton(
      735,
      43,
      105,
      36,
      '☰ LEVELS (L)',
      0x1e293b,
      0x2563eb,
      0x60a5fa,
      () => this.toggleLevelSelectModal()
    );
    hudContainer.add(levelsBtn.container);

    // 2. Pause Button
    const pauseBtn = this.createButton(
      850,
      43,
      100,
      36,
      '❚❚ PAUSE (P)',
      0x1e293b,
      0x334155,
      0x38bdf8,
      () => this.togglePause()
    );
    hudContainer.add(pauseBtn.container);
    this.pauseBtnText = pauseBtn.label;

    // 3. Restart Level Button
    const restartBtn = this.createButton(
      960,
      43,
      100,
      36,
      '↻ RESTART',
      0x1e293b,
      0x334155,
      0xf59e0b,
      () => this.restartCurrentLevel()
    );
    hudContainer.add(restartBtn.container);

    // 4. Debug Panel Toggle Button
    const debugBtn = this.createButton(
      1070,
      43,
      95,
      36,
      '🛠 DEV (D)',
      0x1e293b,
      0x3b82f6,
      0x60a5fa,
      () => this.toggleDebugPanel()
    );
    hudContainer.add(debugBtn.container);

    // 5. End Session Button
    const endBtn = this.createButton(
      1175,
      43,
      85,
      36,
      '✕ END',
      0x1e293b,
      0x450a0a,
      0xef4444,
      () => this.endGame()
    );
    hudContainer.add(endBtn.container);

    // Helper hint text along bottom right
    const hintText = this.add.text(
      GAME_WIDTH - 36,
      GAME_HEIGHT - 22,
      'Aim & Left-Click: Fire | Right-Click / Space: Swap | L: Levels | P: Pause | R: Restart | D: Dev Tools',
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
   * Day 2 Level Select Modal (Requirement 6):
   * Clean, responsive dialog displaying all 5 levels with lock/unlock status.
   */
  public showLevelSelectModal(): void {
    if (this.levelSelectModal) return;

    this.levelSelectModal = this.add.container(0, 0);
    this.levelSelectModal.setDepth(100);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050811, 0.85);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains
    );
    this.levelSelectModal.add(backdrop);

    const modalBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.levelSelectModal.add(modalBox);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0f172a, 0.98);
    panelBg.fillRoundedRect(-280, -215, 560, 430, 16);
    panelBg.lineStyle(2, 0x38bdf8, 0.9);
    panelBg.strokeRoundedRect(-280, -215, 560, 430, 16);
    modalBox.add(panelBg);

    const title = this.add.text(0, -175, 'LEVEL SELECT', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    title.setOrigin(0.5);
    modalBox.add(title);

    const highestUnlocked = this.levelManager.getHighestUnlockedLevel();
    const sub = this.add.text(
      0,
      -142,
      `Campaign Progression: ${highestUnlocked} of 5 Levels Unlocked  |  Total Score: ${this.levelManager.getTotalCampaignScore()}`,
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#94a3b8',
      }
    );
    sub.setOrigin(0.5);
    modalBox.add(sub);

    // List of 5 level cards
    const levels = this.levelManager.getAllLevels();
    const startY = -105;
    const rowHeight = 46;

    levels.forEach((lvl, idx) => {
      const y = startY + idx * (rowHeight + 8);
      const isUnlocked = this.levelManager.isLevelUnlocked(lvl.id);
      const isCurrent = this.levelManager.getCurrentLevelId() === lvl.id;

      const rowContainer = this.add.container(0, y);
      modalBox.add(rowContainer);

      const rowBg = this.add.graphics();
      const bgColor = isCurrent ? 0x1e3a5f : isUnlocked ? 0x1e293b : 0x090d16;
      const borderColor = isCurrent ? 0x38bdf8 : isUnlocked ? 0x475569 : 0x1e293b;
      rowBg.fillStyle(bgColor, 0.95);
      rowBg.fillRoundedRect(-240, -19, 480, 42, 8);
      rowBg.lineStyle(1.5, borderColor, 0.9);
      rowBg.strokeRoundedRect(-240, -19, 480, 42, 8);
      rowContainer.add(rowBg);

      // Level number badge
      const badgeText = this.add.text(-215, 0, `[${lvl.id}]`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: isUnlocked ? '#38bdf8' : '#64748b',
      });
      badgeText.setOrigin(0.5);
      rowContainer.add(badgeText);

      // Level name & details
      const nameText = this.add.text(-185, -7, lvl.name.toUpperCase(), {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: isUnlocked ? '#f8fafc' : '#64748b',
      });
      rowContainer.add(nameText);

      const descText = this.add.text(
        -185,
        9,
        `${lvl.chainSpeed} px/s  •  ${lvl.initialBallSequence.length} orbs  •  ${lvl.subtitle}`,
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: isUnlocked ? '#94a3b8' : '#475569',
        }
      );
      rowContainer.add(descText);

      // Status indicator
      const statusStr = isCurrent ? '▶ ACTIVE' : isUnlocked ? 'PLAY' : '🔒 LOCKED';
      const statusColor = isCurrent ? '#10b981' : isUnlocked ? '#38bdf8' : '#ef4444';
      const statusText = this.add.text(205, 0, statusStr, {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: statusColor,
      });
      statusText.setOrigin(0.5);
      rowContainer.add(statusText);

      // Click interaction
      rowBg.setInteractive(
        new Phaser.Geom.Rectangle(-240, -19, 480, 42),
        Phaser.Geom.Rectangle.Contains
      );

      if (isUnlocked) {
        rowBg.on('pointerover', () => {
          rowBg.clear();
          rowBg.fillStyle(0x2d4368, 1);
          rowBg.fillRoundedRect(-240, -19, 480, 42, 8);
          rowBg.lineStyle(1.5, 0x38bdf8, 1);
          rowBg.strokeRoundedRect(-240, -19, 480, 42, 8);
        });
        rowBg.on('pointerout', () => {
          rowBg.clear();
          rowBg.fillStyle(bgColor, 0.95);
          rowBg.fillRoundedRect(-240, -19, 480, 42, 8);
          rowBg.lineStyle(1.5, borderColor, 0.9);
          rowBg.strokeRoundedRect(-240, -19, 480, 42, 8);
        });
        rowBg.on('pointerdown', () => {
          AudioSynth.playUiClick();
          this.hideLevelSelectModal();
          this.loadLevel(lvl.id);
        });
      } else {
        rowBg.on('pointerdown', () => {
          AudioSynth.playUiClick();
          this.showTemporaryToast(`Level ${lvl.id} is locked. Complete Level ${lvl.id - 1} first.`);
        });
      }
    });

    const closeBtn = this.createButton(
      0,
      178,
      180,
      36,
      '✕ CLOSE',
      0x1e293b,
      0x334155,
      0x94a3b8,
      () => this.hideLevelSelectModal()
    );
    modalBox.add(closeBtn.container);

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

  public hideLevelSelectModal(): void {
    if (this.levelSelectModal) {
      this.levelSelectModal.destroy();
      this.levelSelectModal = undefined;
    }
  }

  public toggleLevelSelectModal(): void {
    if (this.levelSelectModal) {
      this.hideLevelSelectModal();
    } else {
      this.showLevelSelectModal();
    }
  }

  /**
   * Day 2 Designer Debug & Level Controls (Requirement 10).
   * Level progression buttons, instant cascade scenarios, chain speed, and live telemetry.
   */
  private setupDebugPanel(): void {
    this.debugContainer = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 45);
    this.debugContainer.setDepth(80);
    this.debugContainer.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x090d16, 0.96);
    bg.fillRoundedRect(-590, -34, 1180, 68, 10);
    bg.lineStyle(1.5, 0x3b82f6, 0.7);
    bg.strokeRoundedRect(-590, -34, 1180, 68, 10);
    this.debugContainer.add(bg);

    // Live Telemetry Label (Day-2 Requirement 10)
    const initialBalls = this.ballChain ? this.ballChain.getBalls().length : 25;
    this.debugTelemetryText = this.add.text(
      -575,
      -26,
      `[DEV] LVL 1: FIRST LIGHT  |  BALLS: ${initialBalls}  |  COMBO: x1  |  LAST SHOT: 0 MATCHES`,
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#38bdf8',
      }
    );
    this.debugContainer.add(this.debugTelemetryText);

    // --- Chain Speed Tuning ---
    this.debugSpeedLabel = this.add.text(
      -575,
      4,
      `SPD: ${this.ballChain ? this.ballChain.getSpeed() : CHAIN_SPEED}`,
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#f8fafc',
      }
    );
    this.debugContainer.add(this.debugSpeedLabel);

    const speedDown = this.createButton(-505, 8, 26, 24, '-10', 0x1e293b, 0x334155, 0x38bdf8, () => {
      const newSpeed = Math.max(10, this.ballChain.getSpeed() - 10);
      this.ballChain.setSpeed(newSpeed);
      this.debugSpeedLabel?.setText(`SPD: ${newSpeed}`);
    });
    this.debugContainer.add(speedDown.container);

    const speedUp = this.createButton(-470, 8, 26, 24, '+10', 0x1e293b, 0x334155, 0x38bdf8, () => {
      const newSpeed = this.ballChain.getSpeed() + 10;
      this.ballChain.setSpeed(newSpeed);
      this.debugSpeedLabel?.setText(`SPD: ${newSpeed}`);
    });
    this.debugContainer.add(speedUp.container);

    // --- Level Progression Controls ---
    const prevLvlBtn = this.createButton(
      -400,
      8,
      85,
      26,
      '◄ Prev Lvl',
      0x1e293b,
      0x334155,
      0x38bdf8,
      () => {
        const prevId = this.levelManager.getPrevLevelId();
        if (prevId) {
          this.loadLevel(prevId);
        } else {
          this.showTemporaryToast('Already at Level 1');
        }
      }
    );
    this.debugContainer.add(prevLvlBtn.container);

    const nextLvlBtn = this.createButton(
      -305,
      8,
      85,
      26,
      'Next Lvl ►',
      0x1e293b,
      0x334155,
      0x38bdf8,
      () => {
        const nextId = this.levelManager.getNextLevelId();
        if (nextId) {
          this.loadLevel(nextId);
        } else {
          this.showTemporaryToast('Already at Level 5');
        }
      }
    );
    this.debugContainer.add(nextLvlBtn.container);

    // Clear Chain Button (Instantly tests Level Cleared flow)
    const clearChainBtn = this.createButton(
      -205,
      8,
      95,
      26,
      '⚡ Clear Chain',
      0x1e293b,
      0x059669,
      0x34d399,
      () => {
        AudioSynth.playUiClick();
        this.ballChain.clearBalls();
        this.handleWaveCleared();
      }
    );
    this.debugContainer.add(clearChainBtn.container);

    // Acceptance Test B (2-Stage Cascade)
    const testBBtn = this.createButton(
      -95,
      8,
      105,
      26,
      '🎯 Test B (x2)',
      0x1e293b,
      0x059669,
      0x34d399,
      () => this.spawnPhase3TestCase()
    );
    this.debugContainer.add(testBBtn.container);

    // Acceptance Test C (3-Stage Cascade)
    const testCBtn = this.createButton(
      15,
      8,
      105,
      26,
      '🎯 Test C (x3)',
      0x1e293b,
      0x0284c7,
      0x38bdf8,
      () => this.spawnThreeStageCascadeTest()
    );
    this.debugContainer.add(testCBtn.container);

    // Acceptance Test D (Non-Match Shot)
    const testDBtn = this.createButton(
      125,
      8,
      105,
      26,
      '🎯 Test D (Miss)',
      0x1e293b,
      0x475569,
      0x94a3b8,
      () => this.spawnNonMatchTest()
    );
    this.debugContainer.add(testDBtn.container);

    // Restart Current Level
    const restartBtn = this.createButton(
      240,
      8,
      95,
      26,
      '↻ Restart',
      0x1e293b,
      0xd97706,
      0xfbbf24,
      () => this.restartCurrentLevel()
    );
    this.debugContainer.add(restartBtn.container);

    // Toggle Rollback Physics (Optional Day-1 Experiment)
    const isRollbackActive = this.ballChain ? this.ballChain.enableRollbackPhysics : ENABLE_ROLLBACK_PHYSICS;
    const rollbackBtn = this.createButton(
      365,
      8,
      140,
      26,
      isRollbackActive ? 'Rollback: ON' : 'Rollback: OFF',
      0x1e293b,
      0x334155,
      0xa855f7,
      () => {
        if (!this.ballChain) return;
        this.ballChain.enableRollbackPhysics = !this.ballChain.enableRollbackPhysics;
        rollbackBtn.label.setText(
          this.ballChain.enableRollbackPhysics ? 'Rollback: ON' : 'Rollback: OFF'
        );
        this.showTemporaryToast(
          `ROLLBACK PHYSICS: ${this.ballChain.enableRollbackPhysics ? 'ENABLED' : 'DISABLED (DAY 1 MODE)'}`
        );
      }
    );
    this.debugContainer.add(rollbackBtn.container);
  }

  /**
   * Updates real-time debug telemetry display (Requirement 10).
   */
  public updateChainDebugTelemetry(
    matchesCount: number,
    finalCombo: number,
    remainingBalls: number
  ): void {
    this.lastShotMatches = matchesCount;
    if (this.chainBallsText) {
      this.chainBallsText.setText(`BALLS: ${remainingBalls}`);
    }
    if (this.debugTelemetryText) {
      const currentLevel = this.levelManager.getCurrentLevel();
      this.debugTelemetryText.setText(
        `[DEV] LVL ${currentLevel.id}: ${currentLevel.name.toUpperCase()}  |  BALLS: ${remainingBalls}  |  COMBO: x${this.scoreSystem.getCombo()}  |  LAST SHOT: ${matchesCount} MATCH(ES)`
      );
    }
  }

  private toggleDebugPanel(): void {
    this.isDebugOpen = !this.isDebugOpen;
    this.debugContainer?.setVisible(this.isDebugOpen);
    AudioSynth.playUiClick();
  }

  /**
   * Test Case B: 2-Stage Cascade ($x1 \to x2$).
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
    this.shooter.setLoadedColors(BallColor.GREEN, BallColor.RED);

    this.showTemporaryToast('TEST B LOADED: 🔴🔴 🟢🟢🟢 🔴🔴 (Shoot GREEN)');
    this.updateChainDebugTelemetry(0, 1, testPattern.length);
  }

  /**
   * Test Case C: 3-Stage Cascade ($x1 \to x2 \to x3$).
   */
  public spawnThreeStageCascadeTest(): void {
    AudioSynth.playUiClick();
    for (const p of this.projectiles) p.destroy();
    this.projectiles = [];

    const testPattern: BallColor[] = [
      BallColor.YELLOW,
      BallColor.YELLOW,
      BallColor.BLUE,
      BallColor.BLUE,
      BallColor.RED,
      BallColor.RED,
      BallColor.BLUE,
      BallColor.BLUE,
      BallColor.YELLOW,
      BallColor.YELLOW,
    ];

    this.ballChain.spawnInitialChain(testPattern);
    this.shooter.setLoadedColors(BallColor.RED, BallColor.BLUE);

    this.showTemporaryToast('TEST C LOADED: 🟡🟡 🔵🔵 🔴🔴 🔵🔵 🟡🟡 (Shoot RED into center)');
    this.updateChainDebugTelemetry(0, 1, testPattern.length);
  }

  /**
   * Test Case D: Non-Match Shot (verifies combo reset).
   */
  public spawnNonMatchTest(): void {
    AudioSynth.playUiClick();
    for (const p of this.projectiles) p.destroy();
    this.projectiles = [];

    const testPattern: BallColor[] = [
      BallColor.RED,
      BallColor.BLUE,
      BallColor.RED,
      BallColor.BLUE,
      BallColor.RED,
      BallColor.BLUE,
    ];

    this.ballChain.spawnInitialChain(testPattern);
    this.shooter.setLoadedColors(BallColor.YELLOW, BallColor.YELLOW);

    this.showTemporaryToast('TEST D LOADED: Alternating colors (Shoot YELLOW for non-match)');
    this.updateChainDebugTelemetry(0, 1, testPattern.length);
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
  ): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics } {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 6);
    bg.lineStyle(1.5, textColorHex, 0.75);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 6);
    container.add(bg);

    const hexColorStr = '#' + textColorHex.toString(16).padStart(6, '0');
    const label = this.add.text(0, 0, text, {
      fontFamily: 'monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: hexColorStr,
    });
    label.setOrigin(0.5, 0.5);
    container.add(label);

    const hitZone = this.add.zone(0, 0, width, height);
    hitZone.setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverBgColor, 1);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 6);
      bg.lineStyle(2, 0xffffff, 0.95);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 6);
      label.setColor('#ffffff');
      this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 0.95);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 6);
      bg.lineStyle(1.5, textColorHex, 0.75);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 6);
      label.setColor(hexColorStr);
      this.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    });

    hitZone.on('pointerdown', () => {
      AudioSynth.playUiClick();
      onClick();
    });

    return { container, label, bg };
  }

  public togglePause(): void {
    if (this.isGameEnded || this.gameOverBanner || this.waveClearBanner || this.levelSelectModal) return;
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      this.pauseBtnText.setText('▶ RESUME');
      this.showPauseModal();
    } else {
      this.pauseBtnText.setText('❚❚ PAUSE (P)');
      this.hidePauseModal();
    }
  }

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
    panelBg.fillRoundedRect(-220, -180, 440, 360, 14);
    panelBg.lineStyle(2, 0x38bdf8, 0.9);
    panelBg.strokeRoundedRect(-220, -180, 440, 360, 14);
    modalBox.add(panelBg);

    const title = this.add.text(0, -135, 'GAME PAUSED', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    title.setOrigin(0.5);
    modalBox.add(title);

    const currentLevel = this.levelManager.getCurrentLevel();
    const statsText = this.add.text(
      0,
      -85,
      `LVL ${currentLevel.id}: ${currentLevel.name.toUpperCase()}\nLevel Score: ${this.scoreSystem.getScore()}   |   Campaign Score: ${this.scoreSystem.getTotalCampaignScore()}`,
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#94a3b8',
        align: 'center',
      }
    );
    statsText.setOrigin(0.5);
    modalBox.add(statsText);

    const resumeBtn = this.createButton(
      0,
      -25,
      280,
      42,
      '▶  RESUME GAME  (P / ESC)',
      0x1e293b,
      0x0284c7,
      0x38bdf8,
      () => this.togglePause()
    );
    modalBox.add(resumeBtn.container);

    const restartBtn = this.createButton(
      0,
      30,
      280,
      42,
      '↻  RESTART LEVEL  (R)',
      0x1e293b,
      0xd97706,
      0xfbbf24,
      () => this.restartCurrentLevel()
    );
    modalBox.add(restartBtn.container);

    const levelSelectBtn = this.createButton(
      0,
      85,
      280,
      42,
      '☰  LEVEL SELECT  (L)',
      0x1e293b,
      0x2563eb,
      0x60a5fa,
      () => {
        this.hidePauseModal();
        this.isPaused = false;
        this.showLevelSelectModal();
      }
    );
    modalBox.add(levelSelectBtn.container);

    const endBtn = this.createButton(
      0,
      140,
      280,
      42,
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
   * Restarts current level using its configured LevelDefinition (Requirement 4).
   */
  public restartCurrentLevel(): void {
    AudioSynth.playUiClick();
    this.loadLevel(this.levelManager.getCurrentLevelId(), true);
  }

  /**
   * Ends current session and shows the summary card.
   */
  public endGame(): void {
    AudioSynth.playUiClick();

    this.hidePauseModal();
    this.hideLevelSelectModal();
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

    const scoreLabel = this.add.text(0, -78, 'TOTAL CAMPAIGN SCORE', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      color: '#94a3b8',
    });
    scoreLabel.setOrigin(0.5);
    modalBox.add(scoreLabel);

    const finalScoreText = this.add.text(
      0,
      -50,
      this.scoreSystem.getTotalCampaignScore().toLocaleString(),
      {
        fontFamily: 'monospace',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#38bdf8',
      }
    );
    finalScoreText.setOrigin(0.5);
    modalBox.add(finalScoreText);

    const currentLevel = this.levelManager.getCurrentLevel();
    const detailsText = this.add.text(
      0,
      -10,
      `LEVEL REACHED: ${currentLevel.id} (${currentLevel.name})  •  BEST COMBO: x${this.scoreSystem.getMaxCombo()}`,
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#f59e0b',
      }
    );
    detailsText.setOrigin(0.5);
    modalBox.add(detailsText);

    const restartLevelBtn = this.createButton(
      0,
      45,
      320,
      44,
      `↻  RETRY LEVEL ${currentLevel.id}`,
      0x1e293b,
      0x2563eb,
      0x60a5fa,
      () => this.restartCurrentLevel()
    );
    modalBox.add(restartLevelBtn.container);

    const selectLevelBtn = this.createButton(
      0,
      100,
      320,
      44,
      '☰  LEVEL SELECT',
      0x1e293b,
      0x059669,
      0x34d399,
      () => {
        this.hideEndGameModal();
        this.isGameEnded = false;
        this.showLevelSelectModal();
      }
    );
    modalBox.add(selectLevelBtn.container);

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

  public startFreshGame(): void {
    AudioSynth.playUiClick();
    this.scoreSystem.resetAll();
    this.levelManager.resetProgression();
    this.loadLevel(1);
    this.showTemporaryToast('NEW CAMPAIGN STARTED - LEVEL 1');
  }

  private showTemporaryToast(message: string): void {
    const toast = this.add.container(GAME_WIDTH / 2, 105);
    toast.setDepth(90);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(-220, -18, 440, 36, 8);
    bg.lineStyle(1.5, 0x38bdf8, 0.8);
    bg.strokeRoundedRect(-220, -18, 440, 36, 8);
    toast.add(bg);

    const text = this.add.text(0, 0, message, {
      fontFamily: 'monospace',
      fontSize: '12px',
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
        this.time.delayedCall(1600, () => {
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
   * Match presentation effects (Requirement 9: Day-1 Juice).
   * Visual feedback only; zero dependency on physics or delayed gameplay logic.
   */
  private handleMatch(
    _color: string,
    count: number,
    x: number,
    y: number,
    comboMultiplier: number
  ): void {
    const points = this.scoreSystem.recordMatch(count, comboMultiplier);

    // Camera shake (proportional to combo, presentation only)
    const shakeIntensity = 0.005 * Math.min(3, comboMultiplier);
    this.cameras.main.shake(120, shakeIntensity);

    // Floating score popup
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
      y: y - 55,
      alpha: 0,
      scale: 1.15,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }

  /**
   * Day 2 Level Cleared Flow (Requirement 5 & 7):
   * Records level score, unlocks subsequent level, and offers Next Level / Campaign Complete actions.
   */
  private handleWaveCleared(): void {
    if (this.waveClearBanner || this.isGameEnded) return;

    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    const currentLevel = this.levelManager.getCurrentLevel();
    const levelScore = this.scoreSystem.getScore();
    const bestCombo = this.scoreSystem.getMaxCombo();

    // Persist progression & accumulate total campaign score
    this.levelManager.completeLevel(currentLevel.id, levelScore);
    const totalCampaignScore = this.levelManager.getTotalCampaignScore();
    this.scoreSystem.setTotalCampaignScore(totalCampaignScore);

    const hasNext = this.levelManager.hasNextLevel();
    const nextLevelId = this.levelManager.getNextLevelId();

    this.waveClearBanner = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
    this.waveClearBanner.setDepth(95);

    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x0f172a, 0.98);
    bannerBg.fillRoundedRect(-240, -115, 480, 230, 14);
    bannerBg.lineStyle(2, hasNext ? 0x10b981 : 0xf59e0b, 0.9);
    bannerBg.strokeRoundedRect(-240, -115, 480, 230, 14);
    this.waveClearBanner.add(bannerBg);

    const titleStr = hasNext ? 'LEVEL CLEARED' : 'CAMPAIGN COMPLETE!';
    const text = this.add.text(0, -70, titleStr, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: hasNext ? '#10b981' : '#f59e0b',
    });
    text.setOrigin(0.5);
    this.waveClearBanner.add(text);

    const levelTitle = this.add.text(
      0,
      -36,
      `LEVEL ${currentLevel.id}: ${currentLevel.name.toUpperCase()}`,
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#c084fc',
      }
    );
    levelTitle.setOrigin(0.5);
    this.waveClearBanner.add(levelTitle);

    const statsStr = `Level Score: ${levelScore}   |   Best Combo: x${bestCombo}\nTotal Campaign Score: ${totalCampaignScore}`;
    const sub = this.add.text(0, 0, statsStr, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#94a3b8',
      align: 'center',
    });
    sub.setOrigin(0.5);
    this.waveClearBanner.add(sub);

    if (hasNext && nextLevelId) {
      const nextBtn = this.createButton(
        -95,
        60,
        190,
        38,
        `▶ NEXT LEVEL (LVL ${nextLevelId})`,
        0x1e293b,
        0x059669,
        0x34d399,
        () => {
          this.loadLevel(nextLevelId);
        }
      );
      this.waveClearBanner.add(nextBtn.container);

      const selectBtn = this.createButton(
        110,
        60,
        170,
        38,
        '☰ LEVEL SELECT',
        0x1e293b,
        0x2563eb,
        0x60a5fa,
        () => {
          this.waveClearBanner?.destroy();
          this.waveClearBanner = undefined;
          this.showLevelSelectModal();
        }
      );
      this.waveClearBanner.add(selectBtn.container);
    } else {
      // Finale completed!
      const replayBtn = this.createButton(
        -105,
        60,
        190,
        38,
        '↻ REPLAY CAMPAIGN',
        0x1e293b,
        0x059669,
        0x34d399,
        () => {
          this.loadLevel(1);
        }
      );
      this.waveClearBanner.add(replayBtn.container);

      const selectBtn = this.createButton(
        105,
        60,
        170,
        38,
        '☰ LEVEL SELECT',
        0x1e293b,
        0x2563eb,
        0x60a5fa,
        () => {
          this.waveClearBanner?.destroy();
          this.waveClearBanner = undefined;
          this.showLevelSelectModal();
        }
      );
      this.waveClearBanner.add(selectBtn.container);
    }
  }

  /**
   * Lose condition when orbs plunge into the vortex (Requirement 7).
   * Does NOT advance progression.
   */
  private handleChainReachedEnd(): void {
    if (this.gameOverBanner || this.isGameEnded) return;

    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    this.gameOverBanner = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.gameOverBanner.setDepth(95);

    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x0f172a, 0.96);
    bannerBg.fillRoundedRect(-240, -125, 480, 250, 14);
    bannerBg.lineStyle(2, 0xef4444, 0.9);
    bannerBg.strokeRoundedRect(-240, -125, 480, 250, 14);
    this.gameOverBanner.add(bannerBg);

    const alertText = this.add.text(0, -80, 'VORTEX BREACHED', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ef4444',
    });
    alertText.setOrigin(0.5);
    this.gameOverBanner.add(alertText);

    const currentLevel = this.levelManager.getCurrentLevel();
    const subText = this.add.text(
      0,
      -45,
      `LEVEL ${currentLevel.id}: ${currentLevel.name.toUpperCase()}\nOrbs penetrated the endpoint seal.`,
      {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        color: '#94a3b8',
        align: 'center',
      }
    );
    subText.setOrigin(0.5);
    this.gameOverBanner.add(subText);

    const scoreInfo = this.add.text(
      0,
      0,
      `Level Score: ${this.scoreSystem.getScore()}  |  Total Campaign: ${this.levelManager.getTotalCampaignScore()}`,
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f59e0b',
      }
    );
    scoreInfo.setOrigin(0.5);
    this.gameOverBanner.add(scoreInfo);

    const retryBtn = this.createButton(
      -100,
      60,
      180,
      38,
      '↻ RETRY LEVEL',
      0x1e293b,
      0x2563eb,
      0x60a5fa,
      () => {
        this.restartCurrentLevel();
      }
    );
    this.gameOverBanner.add(retryBtn.container);

    const selectBtn = this.createButton(
      100,
      60,
      180,
      38,
      '☰ LEVEL SELECT',
      0x1e293b,
      0x059669,
      0x34d399,
      () => {
        if (this.gameOverBanner) {
          this.gameOverBanner.destroy();
          this.gameOverBanner = undefined;
        }
        this.showLevelSelectModal();
      }
    );
    this.gameOverBanner.add(selectBtn.container);
  }
}
