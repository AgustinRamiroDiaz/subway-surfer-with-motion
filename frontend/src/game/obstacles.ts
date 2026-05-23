import * as THREE from 'three';
import type { JumpDuckCell } from '../motion-mapping/jumpDuckActions';
import {
  OBSTACLE_SPAWN_Z,
  TRACK_MIN_X,
  TRACK_WIDTH,
} from './gameConstants';
import type { ObstacleSystem, RunnerGameId } from './gameTypes';
import { playerTrackX } from './trackWorld';

export function createObstacleSystem(
  scene: THREE.Scene,
  getGameId: () => RunnerGameId,
  getPlayerCount: () => number
): ObstacleSystem {
  const obstacles: ObstacleSystem['obstacles'] = [];
  const allJumpDuckCells: JumpDuckCell[] = [
    'jump-left',
    'jump-center',
    'jump-right',
    'run-left',
    'run-center',
    'run-right',
    'duck-left',
    'duck-center',
    'duck-right',
  ];
  const obstaclePatterns: JumpDuckCell[][] = [
    ['run-center', 'duck-center'],
    ['jump-center', 'run-center'],
    ['run-left', 'run-center', 'duck-left', 'duck-center'],
    ['run-center', 'run-right', 'duck-center', 'duck-right'],
    ['jump-left', 'run-left', 'jump-center', 'run-center'],
    ['jump-center', 'run-center', 'jump-right', 'run-right'],
    allJumpDuckCells.filter((cell) => cell !== 'jump-left'),
    allJumpDuckCells.filter((cell) => cell !== 'jump-right'),
    allJumpDuckCells.filter((cell) => cell !== 'duck-left'),
    allJumpDuckCells.filter((cell) => cell !== 'duck-right'),
  ];

  return {
    obstacles,
    spawnObstacle: () => {
      const gameId = getGameId();
      const playerCount = getPlayerCount();
      const isJumpDuck = gameId === 'jump-duck';
      const kind = isJumpDuck ? 'jump-duck' : 'sideways';
      const targetPlayerIndex = isJumpDuck ? Math.floor(Math.random() * Math.max(1, playerCount)) : null;
      const blockedCells = isJumpDuck
        ? obstaclePatterns[Math.floor(Math.random() * obstaclePatterns.length)] ?? ['run-center']
        : [];
      const x = isJumpDuck && targetPlayerIndex !== null
        ? playerTrackX(targetPlayerIndex, playerCount)
        : TRACK_MIN_X + Math.random() * TRACK_WIDTH;
      const geometry = !isJumpDuck
        ? new THREE.SphereGeometry(0.74, 36, 36)
        : new THREE.BoxGeometry(1.68, 1.86, 0.34);
      const material = new THREE.MeshStandardMaterial({
        color: '#ff5f7a',
        emissive: '#5a0b18',
        roughness: 0.42,
        metalness: 0.08,
        transparent: isJumpDuck,
        opacity: isJumpDuck ? 0.72 : 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const y = isJumpDuck ? 0.96 : 0.82;
      mesh.position.set(x, y, OBSTACLE_SPAWN_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      obstacles.push({ mesh, x, kind, targetPlayerIndex, blockedCells, hitBy: [] });
    },
    dispose: () => {
      obstacles.forEach((obstacle) => {
        scene.remove(obstacle.mesh);
        obstacle.mesh.geometry.dispose();
        obstacle.mesh.material.dispose();
      });
    },
  };
}
