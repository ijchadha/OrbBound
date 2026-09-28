import Phaser from 'phaser';
import { GameScene } from '../scenes/GameScene';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/constants';

/**
 * Phaser 3 configuration for Orbbound.
 *
 * NOTE: Standard physics (Arcade, Matter) is disabled by design.
 * All ball kinetics and chain movement are governed deterministically
 * along the 1D path coordinate space via BallChain.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#090d16',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};
