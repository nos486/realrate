import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from '../../../web/src/shared/utils/imageResize.js';

describe('calculateTargetDimensions (Pure Dimension Logic)', () => {
  it('scales down landscape images without altering aspect ratio', () => {
    // 3200 x 2400 (4:3) with maxSide 1600 -> 1600 x 1200
    const dims = calculateTargetDimensions(3200, 2400, 1600);
    expect(dims).toEqual({ width: 1600, height: 1200 });
  });

  it('scales down portrait images without altering aspect ratio', () => {
    // 2400 x 3200 (3:4) with maxSide 1600 -> 1200 x 1600
    const dims = calculateTargetDimensions(2400, 3200, 1600);
    expect(dims).toEqual({ width: 1200, height: 1600 });
  });

  it('scales down square images accurately', () => {
    // 2000 x 2000 with maxSide 1600 -> 1600 x 1600
    const dims = calculateTargetDimensions(2000, 2000, 1600);
    expect(dims).toEqual({ width: 1600, height: 1600 });
  });

  it('never upscales images smaller than maxSide', () => {
    // 800 x 600 with maxSide 1600 -> 800 x 600
    const dims = calculateTargetDimensions(800, 600, 1600);
    expect(dims).toEqual({ width: 800, height: 600 });

    const portrait = calculateTargetDimensions(500, 1000, 1600);
    expect(portrait).toEqual({ width: 500, height: 1000 });
  });

  it('handles edge cases gracefully', () => {
    expect(calculateTargetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    expect(calculateTargetDimensions(-100, 200, 1600)).toEqual({ width: 0, height: 0 });
    expect(calculateTargetDimensions(1000, 800, 0)).toEqual({ width: 1000, height: 800 });
    expect(calculateTargetDimensions(1000, 800, -100)).toEqual({ width: 1000, height: 800 });
  });
});
