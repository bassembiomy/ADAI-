import { describe, expect, it } from 'vitest';
import { presentationFromBlockGeometry } from './blockGeometryPresentation';

describe('presentationFromBlockGeometry', () => {
  it('maps BDD geometry directly', () => {
    expect(presentationFromBlockGeometry({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('maps IBD context geometry so a mixed geometric + semantic update does not drop it', () => {
    expect(presentationFromBlockGeometry({ name: 'N', ibdX: 5, ibdY: 6, ibdWidth: 700, ibdHeight: 500 })).toEqual({ x: 5, y: 6, width: 700, height: 500 });
  });

  it('prefers the plain key over the ibd key and omits untouched axes', () => {
    expect(presentationFromBlockGeometry({ x: 1, ibdX: 9 })).toEqual({ x: 1 });
  });
});
