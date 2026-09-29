import { BallColor } from '../utils/constants';
import { LevelDefinition } from '../types/LevelDefinition';

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  // =========================================================================
  // LEVEL 1: "First Light"
  // Purpose: Teach the basic shooting and matching loop.
  // 25 balls, 4 colors, moderate speed (75 px/s), simple sweeping path.
  // =========================================================================
  {
    id: 1,
    name: 'First Light',
    subtitle: 'Awakening the Conduits',
    description: 'Learn the ancient art of matching spheres before they reach the singularity.',
    chainSpeed: 75,
    startPoint: { x: -40, y: 110 },
    pathPoints: [
      { x: 300, y: 100 },
      { x: 700, y: 110 },
      { x: 1080, y: 130 },
      { x: 1160, y: 260 },
      { x: 1050, y: 420 },
      { x: 760, y: 460 },
      { x: 400, y: 440 },
      { x: 220, y: 360 },
      { x: 260, y: 240 },
      { x: 500, y: 210 },
      { x: 760, y: 230 },
      { x: 820, y: 330 },
      { x: 640, y: 360 }, // Endpoint vortex
    ],
    initialBallSequence: [
      BallColor.RED, BallColor.RED, BallColor.BLUE,
      BallColor.GREEN, BallColor.GREEN, BallColor.YELLOW,
      BallColor.YELLOW, BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.GREEN, BallColor.BLUE,
      BallColor.GREEN, BallColor.YELLOW, BallColor.YELLOW,
      BallColor.BLUE, BallColor.BLUE, BallColor.RED,
      BallColor.RED, BallColor.GREEN, BallColor.GREEN,
      BallColor.YELLOW, BallColor.YELLOW, BallColor.RED,
      BallColor.BLUE,
    ], // 25 balls
  },

  // =========================================================================
  // LEVEL 2: "The Crossing"
  // Purpose: Teach planning and setup.
  // Deliberate sandwich arrangements where strategic shots setup cascades.
  // =========================================================================
  {
    id: 2,
    name: 'The Crossing',
    subtitle: 'Strategic Resonance',
    description: 'Plan your shots carefully. Splitting matching pairs triggers powerful chain reactions.',
    chainSpeed: 80,
    startPoint: { x: -40, y: 140 },
    pathPoints: [
      { x: 280, y: 120 },
      { x: 650, y: 135 },
      { x: 1020, y: 150 },
      { x: 1150, y: 280 },
      { x: 960, y: 420 },
      { x: 600, y: 420 },
      { x: 300, y: 450 },
      { x: 160, y: 350 },
      { x: 260, y: 250 },
      { x: 540, y: 220 },
      { x: 820, y: 240 },
      { x: 760, y: 360 },
      { x: 640, y: 370 }, // Endpoint vortex
    ],
    initialBallSequence: [
      BallColor.RED, BallColor.RED,
      BallColor.GREEN, BallColor.GREEN,
      BallColor.BLUE, BallColor.BLUE,
      BallColor.YELLOW, BallColor.YELLOW,
      BallColor.RED, BallColor.BLUE, BallColor.BLUE, BallColor.RED, // Sandwich opportunity
      BallColor.GREEN, BallColor.YELLOW, BallColor.YELLOW, BallColor.GREEN, // Sandwich opportunity
      BallColor.BLUE, BallColor.RED, BallColor.RED, BallColor.BLUE, // Sandwich opportunity
      BallColor.YELLOW, BallColor.GREEN, BallColor.GREEN, BallColor.YELLOW,
      BallColor.BLUE, BallColor.BLUE,
    ], // 26 balls
  },

  // =========================================================================
  // LEVEL 3: "Pressure"
  // Purpose: Introduce time pressure.
  // Faster chain speed (100 px/s), enters from top-right, tighter pacing.
  // =========================================================================
  {
    id: 3,
    name: 'Pressure',
    subtitle: 'The Quickening Torrent',
    description: 'The arcane current surges. Accuracy under speed is required to survive.',
    chainSpeed: 100,
    startPoint: { x: 1320, y: 110 },
    pathPoints: [
      { x: 1060, y: 100 },
      { x: 680, y: 115 },
      { x: 280, y: 140 },
      { x: 140, y: 260 },
      { x: 220, y: 420 },
      { x: 560, y: 470 },
      { x: 940, y: 450 },
      { x: 1080, y: 320 },
      { x: 940, y: 220 },
      { x: 650, y: 225 },
      { x: 480, y: 310 },
      { x: 640, y: 350 }, // Endpoint vortex
    ],
    initialBallSequence: [
      BallColor.BLUE, BallColor.BLUE, BallColor.RED,
      BallColor.GREEN, BallColor.GREEN, BallColor.YELLOW,
      BallColor.YELLOW, BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.RED, BallColor.GREEN,
      BallColor.BLUE, BallColor.BLUE, BallColor.YELLOW,
      BallColor.YELLOW, BallColor.RED, BallColor.GREEN,
      BallColor.GREEN, BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.RED, BallColor.YELLOW,
      BallColor.YELLOW, BallColor.GREEN, BallColor.RED,
      BallColor.RED, BallColor.BLUE, BallColor.BLUE,
      BallColor.GREEN, BallColor.YELLOW,
    ], // 32 balls
  },

  // =========================================================================
  // LEVEL 4: "The Curve"
  // Purpose: Introduce spatial variation.
  // Distinct sweeping S-curve geometry wrapping around the chamber.
  // =========================================================================
  {
    id: 4,
    name: 'The Curve',
    subtitle: 'Arcane Labyrinth',
    description: 'Curves twist your angles of approach. Master timing as orbs sweep the outer rim.',
    chainSpeed: 105,
    startPoint: { x: -40, y: 220 },
    pathPoints: [
      { x: 180, y: 120 },
      { x: 480, y: 105 },
      { x: 820, y: 115 },
      { x: 1120, y: 150 },
      { x: 1180, y: 320 },
      { x: 1000, y: 470 },
      { x: 680, y: 470 },
      { x: 360, y: 480 },
      { x: 150, y: 390 },
      { x: 220, y: 260 },
      { x: 500, y: 210 },
      { x: 780, y: 225 },
      { x: 880, y: 330 },
      { x: 740, y: 400 },
      { x: 560, y: 360 },
      { x: 640, y: 320 }, // Endpoint vortex
    ],
    initialBallSequence: [
      BallColor.YELLOW, BallColor.YELLOW, BallColor.RED,
      BallColor.BLUE, BallColor.BLUE, BallColor.GREEN,
      BallColor.GREEN, BallColor.YELLOW, BallColor.YELLOW,
      BallColor.RED, BallColor.RED, BallColor.BLUE,
      BallColor.BLUE, BallColor.GREEN, BallColor.GREEN,
      BallColor.YELLOW, BallColor.YELLOW, BallColor.RED,
      BallColor.RED, BallColor.BLUE, BallColor.GREEN,
      BallColor.GREEN, BallColor.YELLOW, BallColor.YELLOW,
      BallColor.RED, BallColor.RED, BallColor.BLUE,
      BallColor.BLUE, BallColor.GREEN, BallColor.YELLOW,
      BallColor.YELLOW, BallColor.RED, BallColor.RED,
      BallColor.BLUE, BallColor.BLUE, BallColor.GREEN,
    ], // 36 balls
  },

  // =========================================================================
  // LEVEL 5: "Convergence"
  // Purpose: Mini-campaign finale.
  // Longest chain (44 balls), fast speed (118 px/s), multi-stage cascade setups.
  // =========================================================================
  {
    id: 5,
    name: 'Convergence',
    subtitle: 'The Grand Singularity',
    description: 'The final vortex opens. Unleash deep multi-tier cascades to seal the breach.',
    chainSpeed: 118,
    startPoint: { x: 1320, y: 130 },
    pathPoints: [
      { x: 1040, y: 105 },
      { x: 640, y: 100 },
      { x: 240, y: 120 },
      { x: 120, y: 250 },
      { x: 170, y: 430 },
      { x: 460, y: 490 },
      { x: 840, y: 485 },
      { x: 1120, y: 420 },
      { x: 1160, y: 270 },
      { x: 960, y: 190 },
      { x: 640, y: 195 },
      { x: 360, y: 230 },
      { x: 290, y: 340 },
      { x: 440, y: 400 },
      { x: 780, y: 390 },
      { x: 850, y: 300 },
      { x: 640, y: 310 }, // Endpoint vortex
    ],
    initialBallSequence: [
      // Multi-tier sandwich sequence:
      BallColor.YELLOW, BallColor.YELLOW,
      BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.RED,
      BallColor.GREEN, BallColor.GREEN,
      BallColor.YELLOW, BallColor.YELLOW,
      BallColor.BLUE, BallColor.RED, BallColor.RED, BallColor.BLUE, // Cascade setup 1
      BallColor.GREEN, BallColor.YELLOW, BallColor.YELLOW, BallColor.GREEN, // Cascade setup 2
      BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.RED,
      BallColor.GREEN, BallColor.GREEN,
      BallColor.YELLOW, BallColor.YELLOW,
      BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.GREEN, BallColor.GREEN, BallColor.RED, // Cascade setup 3
      BallColor.YELLOW, BallColor.BLUE, BallColor.BLUE, BallColor.YELLOW, // Cascade setup 4
      BallColor.RED, BallColor.RED,
      BallColor.GREEN, BallColor.GREEN,
      BallColor.YELLOW, BallColor.YELLOW,
      BallColor.BLUE, BallColor.BLUE,
      BallColor.RED, BallColor.GREEN,
      BallColor.BLUE, BallColor.YELLOW,
    ], // 44 balls
  },
];
