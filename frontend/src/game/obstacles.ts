import * as THREE from 'three';
import type { HorizontalAction, JumpDuckCell, VerticalAction } from '../motion-mapping/jumpDuckActions';
import {
  OBSTACLE_SPAWN_Z,
  TRACK_MIN_X,
  TRACK_WIDTH,
} from './gameConstants';
import type { ObstacleSystem, RunnerGameId } from './gameTypes';
import { playerTrackX } from './trackWorld';

const JUMP_DUCK_LANE_OFFSETS: Record<HorizontalAction, number> = {
  left: -0.48,
  center: 0,
  right: 0.48,
};

function getBlockedVerticalActions(blockedCells: JumpDuckCell[], horizontalAction: HorizontalAction): Set<VerticalAction> {
  const actions = new Set<VerticalAction>();
  blockedCells.forEach((cell) => {
    const [verticalAction, cellHorizontalAction] = cell.split('-') as [VerticalAction, HorizontalAction];
    if (cellHorizontalAction === horizontalAction) {
      actions.add(verticalAction);
    }
  });
  return actions;
}

function createLogMesh(): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
  const material = new THREE.MeshStandardMaterial({
    color: '#8b4a20',
    emissive: '#2b1307',
    roughness: 0.62,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.82, 24), material);
  mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBirdMesh(): THREE.Group {
  const bird = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: '#ff2f55',
    emissive: '#650014',
    roughness: 0.36,
    metalness: 0.08,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), material);
  const leftWing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.44, 3), material);
  const rightWing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.44, 3), material);

  leftWing.position.set(-0.28, 0.02, 0);
  rightWing.position.set(0.28, 0.02, 0);
  leftWing.rotation.set(0, 0, -Math.PI / 2.8);
  rightWing.rotation.set(0, 0, Math.PI / 2.8);
  [body, leftWing, rightWing].forEach((part) => {
    part.castShadow = true;
    part.receiveShadow = true;
    bird.add(part);
  });

  return bird;
}

function collectMaterials(object: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        materials.push(material);
      }
    });
  });
  return materials;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.geometry.dispose();
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => material.dispose());
  });
}

function createJumpDuckObstacleRoot(blockedCells: JumpDuckCell[]): THREE.Group {
  const root = new THREE.Group();
  (['left', 'center', 'right'] as const).forEach((horizontalAction) => {
    const verticalActions = getBlockedVerticalActions(blockedCells, horizontalAction);
    const laneOffset = JUMP_DUCK_LANE_OFFSETS[horizontalAction];
    const hasLowObstacle = verticalActions.has('run') && verticalActions.has('duck');
    const hasHighObstacle = verticalActions.has('jump') && verticalActions.has('run');

    if (hasLowObstacle) {
      const log = createLogMesh();
      log.position.set(laneOffset, 0.32, 0);
      root.add(log);
    }

    if (hasHighObstacle) {
      const bird = createBirdMesh();
      bird.position.set(laneOffset, 1.54, 0);
      root.add(bird);
    }
  });

  if (!root.children.length) {
    const fallback = createLogMesh();
    fallback.position.y = 0.32;
    root.add(fallback);
  }

  return root;
}

function createSidewaysObstacleRoot(): THREE.Group {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: '#ff5f7a',
    emissive: '#5a0b18',
    roughness: 0.42,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.74, 36, 36), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return root;
}

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
      const root = isJumpDuck ? createJumpDuckObstacleRoot(blockedCells) : createSidewaysObstacleRoot();
      const y = isJumpDuck ? 0 : 0.82;
      root.position.set(x, y, OBSTACLE_SPAWN_Z);
      scene.add(root);
      obstacles.push({ root, x, kind, targetPlayerIndex, blockedCells, hitBy: [], hitMaterials: collectMaterials(root) });
    },
    dispose: () => {
      obstacles.forEach((obstacle) => {
        scene.remove(obstacle.root);
        disposeObject(obstacle.root);
      });
    },
  };
}
