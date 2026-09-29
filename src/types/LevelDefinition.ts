import { BallColor } from '../utils/constants';

export interface Point2D {
  x: number;
  y: number;
}

export interface LevelDefinition {
  id: number;
  name: string;
  subtitle: string;
  description: string;
  startPoint: Point2D;
  pathPoints: Point2D[];
  initialBallSequence: BallColor[];
  chainSpeed: number;
}
