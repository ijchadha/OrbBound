import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

// Initialize the Phaser 3 game instance
window.addEventListener('DOMContentLoaded', () => {
  new Phaser.Game(gameConfig);
});
