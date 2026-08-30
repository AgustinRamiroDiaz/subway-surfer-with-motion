import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import {
  createHandRhythmSpatialGuides,
  getHandRhythmRowBoundaries,
} from './handRhythmSpatialGuides';
import { getHandRhythmGridBounds } from './levels/handRhythmLayout';

describe('hand rhythm spatial guides', () => {
  test('uses the exact low, middle, and top grid boundaries', () => {
    const bounds = getHandRhythmGridBounds(0, 1, 3);
    const boundaries = getHandRhythmRowBoundaries(0, 1, 3);

    expect(boundaries).toHaveLength(4);
    expect(boundaries[0]).toBeCloseTo(bounds.bottom);
    expect(boundaries[3]).toBeCloseTo(bounds.top);
    expect(boundaries[1] - boundaries[0]).toBeCloseTo(bounds.height / 3);
  });

  test('creates a horizon and ceiling for every player viewport', () => {
    const scene = new THREE.Scene();
    const dispose = createHandRhythmSpatialGuides(scene, 4, 3);

    for (let playerIndex = 0; playerIndex < 4; playerIndex += 1) {
      const group = scene.getObjectByName(`player-${playerIndex + 1}-rhythm-spatial-guides`);
      expect(group).toBeDefined();
      expect(group?.getObjectByName(`player-${playerIndex + 1}-rhythm-horizon`)).toBeDefined();
      expect(group?.getObjectByName(`player-${playerIndex + 1}-rhythm-ceiling`)).toBeDefined();
      expect(group?.children.filter((child) => child.name.includes('rhythm-horizon-row'))).toHaveLength(4);
    }

    dispose();
    expect(scene.children).toHaveLength(0);
  });
});
