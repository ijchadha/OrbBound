export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const BALL_RADIUS = 20;
export const BALL_DIAMETER = BALL_RADIUS * 2;

export enum BallColor {
  RED = 'RED',
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
}

export const BALL_COLORS: BallColor[] = [
  BallColor.RED,
  BallColor.BLUE,
  BallColor.GREEN,
  BallColor.YELLOW,
];

export const BALL_COLOR_HEX: Record<BallColor, number> = {
  [BallColor.RED]: 0xef4444,    // Ruby Crimson
  [BallColor.BLUE]: 0x3b82f6,   // Sapphire Blue
  [BallColor.GREEN]: 0x10b981,  // Emerald Jade
  [BallColor.YELLOW]: 0xf59e0b, // Amber Sun
};

export const BALL_COLOR_HIGHLIGHTS: Record<BallColor, number> = {
  [BallColor.RED]: 0xfca5a5,
  [BallColor.BLUE]: 0x93c5fd,
  [BallColor.GREEN]: 0x6ee7b7,
  [BallColor.YELLOW]: 0xfde68a,
};

export const BALL_COLOR_SHADOWS: Record<BallColor, number> = {
  [BallColor.RED]: 0x991b1b,
  [BallColor.BLUE]: 0x1e40af,
  [BallColor.GREEN]: 0x065f46,
  [BallColor.YELLOW]: 0xb45309,
};

export enum BallState {
  IN_CHAIN = 'IN_CHAIN',
  ROLLING = 'ROLLING',
  MATCHED = 'MATCHED',
  INSERTING = 'INSERTING',
}

export const DEFAULT_CHAIN_SPEED = 45; // Pixels per second along the path
export const INITIAL_BALL_COUNT = 25;
export const SHOOTER_Y = 640;
export const SHOOTER_X = 640;
