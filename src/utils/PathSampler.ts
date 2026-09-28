import Phaser from 'phaser';

export interface PathSample {
  x: number;
  y: number;
  distance: number;
  angle: number;
}

/**
 * PathSampler samples a Phaser.Curves.Path at uniform arc-length intervals.
 * This guarantees that `distanceAlongPath` accurately translates to real pixel distance
 * along arbitrary curves and splines without speed warping or ball compression artifacts.
 */
export class PathSampler {
  public readonly path: Phaser.Curves.Path;
  public readonly totalLength: number;
  private samples: PathSample[] = [];

  constructor(path: Phaser.Curves.Path, sampleStep: number = 2) {
    this.path = path;
    const rawLength = path.getLength();
    const numSamples = Math.max(100, Math.ceil(rawLength / sampleStep));

    let accumulatedDistance = 0;
    let prevPoint = path.getPoint(0);

    this.samples.push({
      x: prevPoint.x,
      y: prevPoint.y,
      distance: 0,
      angle: 0,
    });

    for (let i = 1; i <= numSamples; i++) {
      const t = i / numSamples;
      const point = path.getPoint(t);
      const tangent = path.getTangent(t);
      const segmentDist = Phaser.Math.Distance.Between(prevPoint.x, prevPoint.y, point.x, point.y);
      accumulatedDistance += segmentDist;

      const angle = Math.atan2(tangent.y, tangent.x);

      this.samples.push({
        x: point.x,
        y: point.y,
        distance: accumulatedDistance,
        angle,
      });

      prevPoint = point;
    }

    this.totalLength = accumulatedDistance;
  }

  /**
   * Retrieves accurate (x, y, angle) coordinates for any linear distance along the curve.
   */
  public getPointAtDistance(distance: number): { x: number; y: number; angle: number } {
    if (this.samples.length === 0) {
      return { x: 0, y: 0, angle: 0 };
    }

    if (distance <= 0) {
      const first = this.samples[0];
      return { x: first.x, y: first.y, angle: first.angle };
    }

    if (distance >= this.totalLength) {
      const last = this.samples[this.samples.length - 1];
      return { x: last.x, y: last.y, angle: last.angle };
    }

    // Binary search for closest segment
    let low = 0;
    let high = this.samples.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const s = this.samples[mid];

      if (s.distance < distance) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx0 = Math.max(0, high);
    const idx1 = Math.min(this.samples.length - 1, low);

    if (idx0 === idx1) {
      const s = this.samples[idx0];
      return { x: s.x, y: s.y, angle: s.angle };
    }

    const s0 = this.samples[idx0];
    const s1 = this.samples[idx1];
    const segmentSpan = s1.distance - s0.distance;
    const t = segmentSpan > 0 ? (distance - s0.distance) / segmentSpan : 0;

    return {
      x: s0.x + (s1.x - s0.x) * t,
      y: s0.y + (s1.y - s0.y) * t,
      angle: s0.angle,
    };
  }

  /**
   * Renders the track onto a Graphics object with a stylized recessed groove.
   */
  public drawTrack(graphics: Phaser.GameObjects.Graphics): void {
    if (this.samples.length < 2) return;

    // Outer recessed trench / shadow
    graphics.lineStyle(46, 0x050811, 0.85);
    graphics.beginPath();
    graphics.moveTo(this.samples[0].x, this.samples[0].y);
    for (let i = 1; i < this.samples.length; i++) {
      graphics.lineTo(this.samples[i].x, this.samples[i].y);
    }
    graphics.strokePath();

    // Trench bevel borders
    graphics.lineStyle(42, 0x1e293b, 0.95);
    graphics.beginPath();
    graphics.moveTo(this.samples[0].x, this.samples[0].y);
    for (let i = 1; i < this.samples.length; i++) {
      graphics.lineTo(this.samples[i].x, this.samples[i].y);
    }
    graphics.strokePath();

    // Inner railbed
    graphics.lineStyle(36, 0x0f172a, 1);
    graphics.beginPath();
    graphics.moveTo(this.samples[0].x, this.samples[0].y);
    for (let i = 1; i < this.samples.length; i++) {
      graphics.lineTo(this.samples[i].x, this.samples[i].y);
    }
    graphics.strokePath();

    // Center guiding rail line
    graphics.lineStyle(2, 0x334155, 0.6);
    graphics.beginPath();
    graphics.moveTo(this.samples[0].x, this.samples[0].y);
    for (let i = 1; i < this.samples.length; i++) {
      graphics.lineTo(this.samples[i].x, this.samples[i].y);
    }
    graphics.strokePath();
  }
}
