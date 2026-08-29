import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { createObstacleSystem } from './obstacles';

describe('obstacle system', () => {
  test('keeps the musical hit beat on every spawned obstacle', () => {
    const scene = new THREE.Scene();
    const system = createObstacleSystem(scene, () => 'jump-duck', () => 2, () => 0);

    system.spawnObstacle(24);

    expect(system.obstacles).toHaveLength(2);
    expect(system.obstacles.every((obstacle) => obstacle.hitBeat === 24)).toBe(true);
    system.dispose();
  });
});
