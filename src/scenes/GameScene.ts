import Phaser from 'phaser';
import { BallChain } from '../entities/BallChain';
import { Projectile } from '../entities/Projectile';
import { Shooter } from '../entities/Shooter';
import { CollisionSystem } from '../systems/CollisionSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { AudioSynth } from '../utils/AudioSynth';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/constants';
import { PathSampler } from '../utils/PathSampler';

export class GameScene extends Phaser.Scene {
  private pathSampler!: PathSampler;
  private ballChain!: BallChain;
  private shooter!: Shooter;
  private scoreSystem!: ScoreSystem;
  private projectiles: Projectile[] = [];

  // State flags
  private isPaused: boolean = false;
  private isGameEnded: boolean = false;

  // Graphics and HUD elements
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private endpointMarker!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private pauseBtnText!: Phaser.GameObjects.Text;

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

    // Prevent default browser right-click context menu so secondary swap works
    if (this.game.canvas) {
      this.game.canvas.oncontextmenu = (e) => e.preventDefault();
    }

    this.renderBackground();
    this.buildTrack();
    this.renderEndpointMarker();
    this.setupHUD();

    // Initialize ball chain with match & clearance callbacks
    this.ballChain = new BallChain(this, this.pathSampler, {
      onReachedEnd: () => this.handleChainReachedEnd(),
      onMatch: (color, count, x, y) => this.handleMatch(color, count, x, y),
      onCrash: (x, y, comboReaction) => this.handleCrash(x, y, comboReaction),
      onWaveCleared: () => this.handleWaveCleared(),
    });

    this.shooter = new Shooter(this);

    // Aiming tracking (only when not paused/ended)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner) return;
      this.shooter.updateAim(pointer.x, pointer.y);
    });

    // Shooting on Left-Click, Swapping colors on Right-Click
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused || this.isGameEnded || this.gameOverBanner) return;

      // Don't fire if clicking inside top HUD bar area (y < 85)
      if (pointer.y < 85) return;

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
    this.input.keyboard?.on('keydown-P', () => {
      this.togglePause();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      this.togglePause();
    });

    // Restart shortcut: R
    this.input.keyboard?.on('keydown-R', () => {
      this.restartCurrentLevel();
    });
  }

  public override update(time: number, delta: number): void {
    // Freeze all gameplay when paused, ended, or at vortex breach
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
   * Renders the visible hazard / vortex marker at the path's terminus.
   */
  private renderEndpointMarker(): void {
    const endPoint = this.pathSampler.getPointAtDistance(this.pathSampler.totalLength);

    this.endpointMarker = this.add.container(endPoint.x, endPoint.y);

    const g = this.add.graphics();
    this.endpointMarker.add(g);

    // Outer hazard aura
    g.fillStyle(0x7f1d1d, 0.4);
    g.fillCircle(0, 0, 46);

    // Danger ring
    g.lineStyle(3, 0xef4444, 0.85);
    g.strokeCircle(0, 0, 38);

    // Dark vortex abyss
    g.fillStyle(0x090d16, 1);
    g.fillCircle(0, 0, 32);

    // Swirling inner energy core
    g.fillStyle(0xdc2626, 0.9);
    g.fillCircle(0, 0, 16);

    g.fillStyle(0xfca5a5, 0.9);
    g.fillCircle(0, 0, 7);

    // Subtle pulsing animation
    this.tweens.add({
      targets: this.endpointMarker,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Draws a clean dark grid backdrop with subtle border framing.
   */
  private renderBackground(): void {
    this.backgroundGraphics = this.add.graphics();

    this.backgroundGraphics.fillStyle(0x090d16, 1);
    this.backgroundGraphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.backgroundGraphics.lineStyle(1, 0x1e293b, 0.2);
    const gridSize = 40;
    for (let x = 0; x <= GAME_WIDTH; x += gridSize) {
      this.backgroundGraphics.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += gridSize) {
      this.backgroundGraphics.lineBetween(0, y, GAME_WIDTH, y);
    }

    this.backgroundGraphics.lineStyle(2, 0x334155, 0.7);
    this.backgroundGraphics.strokeRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24);
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
    const titleText = this.add.text(45, 33, 'ORBBOUND', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    hudContainer.add(titleText);

    // Level label
    this.levelText = this.add.text(205, 34, 'LVL 1', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#c084fc',
    });
    hudContainer.add(this.levelText);

    // Score label
    this.scoreText = this.add.text(300, 34, 'SCORE: 000000', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#38bdf8',
    });
    hudContainer.add(this.scoreText);

    // Combo label
    this.comboText = this.add.text(495, 34, 'COMBO: x1', {
      fontFamily: 'monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#f59e0b',
    });
    hudContainer.add(this.comboText);

    // --- Interactive Action Buttons in HUD ---

    // 1. Pause Button
    const pauseBtn = this.createButton(
      740,
      44,
      120,
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
      885,
      44,
      135,
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
      1035,
      44,
      120,
      36,
      '✕ END GAME',
      0x1e293b,
      0x450a0a,
      0xef4444,
      () => this.endGame()
    );
    hudContainer.add(endBtn.container);

    // Helper hint text along bottom right
    const hintText = this.add.text(GAME_WIDTH - 36, GAME_HEIGHT - 22, 'Aim & Left-Click: Fire | Right-Click / Space: Swap | P: Pause | R: Restart', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '11px',
      color: '#64748b',
    });
    hintText.setOrigin(1, 0.5);

    // Subscribe to score updates
    this.scoreSystem.subscribe((score, level, combo) => {
      this.scoreText.setText(`SCORE: ${score.toString().padStart(6, '0')}`);
      this.levelText.setText(`LVL ${level}`);
      this.comboText.setText(`COMBO: x${combo}`);
    });
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
      fontSize: '13px',
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

    // Dimmed backdrop
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050811, 0.78);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setInteractive(new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT), Phaser.Geom.Rectangle.Contains);
    this.pauseModal.add(backdrop);

    // Modal dialog box
    const modalBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.pauseModal.add(modalBox);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0f172a, 0.98);
    panelBg.fillRoundedRect(-220, -170, 440, 340, 14);
    panelBg.lineStyle(2, 0x38bdf8, 0.9);
    panelBg.strokeRoundedRect(-220, -170, 440, 340, 14);
    modalBox.add(panelBg);

    // Title
    const title = this.add.text(0, -125, 'GAME PAUSED', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });
    title.setOrigin(0.5);
    modalBox.add(title);

    // Stats breakdown
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

    // Resume button
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

    // Restart level button
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

    // End game button
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

    // Gentle pop-in scale tween
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
   * Restarts the current level with a fresh orb chain and cleared projectiles.
   */
  public restartCurrentLevel(): void {
    AudioSynth.playUiClick();

    // Dismiss modals if open
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

    // Destroy active flying projectiles
    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    // Reset current level combo
    this.scoreSystem.resetForCurrentLevel();

    // Re-spawn fresh chain for current level difficulty
    const currentLevel = this.scoreSystem.getLevel();
    const ballCount = 25 + currentLevel * 2;
    const speed = 45 + currentLevel * 6;
    this.ballChain.setSpeed(speed);
    this.ballChain.spawnInitialChain(ballCount);

    // Floating feedback banner
    this.showTemporaryToast(`LEVEL ${currentLevel} RESTARTED`);
  }

  /**
   * Ends the current game session and presents the Game Over / Summary screen.
   */
  public endGame(): void {
    AudioSynth.playUiClick();

    this.hidePauseModal();
    this.isPaused = false;
    this.isGameEnded = true;

    // Destroy active flying projectiles
    for (const proj of this.projectiles) {
      proj.destroy();
    }
    this.projectiles = [];

    this.showEndGameModal();
  }

  /**
   * Displays the Game Over / Session Summary modal.
   */
  private showEndGameModal(): void {
    if (this.endGameModal) return;

    this.endGameModal = this.add.container(0, 0);
    this.endGameModal.setDepth(100);

    // Dark backdrop
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050811, 0.85);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setInteractive(new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT), Phaser.Geom.Rectangle.Contains);
    this.endGameModal.add(backdrop);

    const modalBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.endGameModal.add(modalBox);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0f172a, 0.98);
    panelBg.fillRoundedRect(-240, -190, 480, 380, 16);
    panelBg.lineStyle(2, 0xef4444, 0.9);
    panelBg.strokeRoundedRect(-240, -190, 480, 380, 16);
    modalBox.add(panelBg);

    // Title
    const title = this.add.text(0, -145, 'GAME OVER', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ef4444',
    });
    title.setOrigin(0.5);
    modalBox.add(title);

    // Score Summary Card
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

    // Play Again (Reset from Level 1) Button
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

    // Restart Current Level Button
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

    // Pop-in animation
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
   * Resets score, resets level to 1, and spawns fresh game.
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
    this.ballChain.setSpeed(45);
    this.ballChain.spawnInitialChain(25);

    this.showTemporaryToast('NEW GAME STARTED - LEVEL 1');
  }

  /**
   * Floating notification toast banner.
   */
  private showTemporaryToast(message: string): void {
    const toast = this.add.container(GAME_WIDTH / 2, 105);
    toast.setDepth(90);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(-160, -18, 320, 36, 8);
    bg.lineStyle(1.5, 0x38bdf8, 0.8);
    bg.strokeRoundedRect(-160, -18, 320, 36, 8);
    toast.add(bg);

    const text = this.add.text(0, 0, message, {
      fontFamily: 'monospace',
      fontSize: '14px',
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
        this.time.delayedCall(1200, () => {
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
   * Triggers score and visual floating text when a match occurs.
   */
  private handleMatch(_color: string, count: number, x: number, y: number): void {
    const combo = this.scoreSystem.getCombo();
    const points = count * 100 * combo;
    this.scoreSystem.addScore(points);
    this.scoreSystem.incrementCombo();

    AudioSynth.playMatch(combo);

    // Floating combat text
    const textStr = combo > 1 ? `+${points}\nCOMBO x${combo}!` : `+${points}`;
    const floatText = this.add.text(x, y - 10, textStr, {
      fontFamily: 'monospace',
      fontSize: combo > 1 ? '20px' : '16px',
      fontStyle: 'bold',
      color: combo > 1 ? '#f59e0b' : '#38bdf8',
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
   * Triggered when rollback crashes back into the rear chain with momentum pushback.
   */
  private handleCrash(x: number, y: number, comboReaction: boolean): void {
    const floatText = this.add.text(x, y - 18, comboReaction ? 'COMBO SLAM!' : 'CRASH!', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: comboReaction ? '18px' : '14px',
      fontStyle: 'bold',
      color: comboReaction ? '#f59e0b' : '#38bdf8',
    });
    floatText.setOrigin(0.5);

    this.tweens.add({
      targets: floatText,
      y: y - 48,
      alpha: 0,
      scale: 1.25,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => floatText.destroy(),
    });
  }

  /**
   * Called when all balls in the chain are successfully matched.
   */
  private handleWaveCleared(): void {
    if (this.waveClearBanner || this.isGameEnded) return;

    const nextLevel = this.scoreSystem.getLevel() + 1;
    this.scoreSystem.setLevel(nextLevel);

    this.waveClearBanner = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);

    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x0f172a, 0.95);
    bannerBg.fillRoundedRect(-180, -50, 360, 100, 12);
    bannerBg.lineStyle(2, 0x10b981, 0.9);
    bannerBg.strokeRoundedRect(-180, -50, 360, 100, 12);
    this.waveClearBanner.add(bannerBg);

    const text = this.add.text(0, -12, 'WAVE CLEARED!', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#10b981',
    });
    text.setOrigin(0.5);
    this.waveClearBanner.add(text);

    const sub = this.add.text(0, 18, `Advancing to Level ${nextLevel}...`, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      color: '#94a3b8',
    });
    sub.setOrigin(0.5);
    this.waveClearBanner.add(sub);

    this.time.delayedCall(1600, () => {
      this.waveClearBanner?.destroy();
      this.waveClearBanner = undefined;
      // Spawn new wave with slight speed boost
      const newSpeed = 45 + nextLevel * 6;
      this.ballChain.setSpeed(newSpeed);
      this.ballChain.spawnInitialChain(25 + nextLevel * 2);
    });
  }

  /**
   * Invoked when the ball chain enters the terminal vortex.
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

    // Retry Current Level button
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

    // End Game button
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
