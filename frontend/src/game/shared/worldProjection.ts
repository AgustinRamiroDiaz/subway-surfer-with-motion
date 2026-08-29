import * as THREE from 'three';

export type WorldProjection = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export function projectWorldPoint(
  camera: THREE.PerspectiveCamera,
  x: number,
  y: number,
  z: number,
  viewportIndex = 0,
  viewportCount = 1
): { x: number; y: number } {
  const projected = new THREE.Vector3(x, y, z).project(camera);
  const localX = THREE.MathUtils.clamp((projected.x + 1) / 2, 0, 1);
  return {
    x: (viewportIndex + localX) / viewportCount,
    // Keep vertical overflow so an aspect-correct camera overlay can extend past
    // the stage and be clipped there instead of being narrowed by object-fit.
    y: (1 - projected.y) / 2,
  };
}
