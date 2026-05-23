import * as THREE from 'three';
import type { HorizontalAction, JumpDuckCell, VerticalAction } from '../motion-mapping/jumpDuckActions';
import {
  OBSTACLE_SPAWN_Z,
  TRACK_MIN_X,
  TRACK_WIDTH,
} from './gameConstants';
import type {
  JumpDuckObstacleCell,
  JumpDuckObstacleColumn,
  JumpDuckObstaclePiece,
  JumpDuckObstacleRow,
  ObstacleSystem,
  RunnerGameId,
} from './gameTypes';
import { playerTrackX } from './trackWorld';

const JUMP_DUCK_LANE_OFFSETS: Record<JumpDuckObstacleColumn, number> = {
  left: -0.48,
  right: 0.48,
};

const JUMP_DUCK_OBSTACLE_CELLS: JumpDuckObstacleCell[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

function getBlockedPlayerHorizontals(column: JumpDuckObstacleColumn): HorizontalAction[] {
  return column === 'left' ? ['left', 'center'] : ['center', 'right'];
}

function getBlockedPlayerVerticals(row: JumpDuckObstacleRow): VerticalAction[] {
  return row === 'top' ? ['jump', 'run'] : ['run', 'duck'];
}

function toBlockedPlayerCells(obstacleCells: JumpDuckObstacleCell[]): JumpDuckCell[] {
  const blockedCells = new Set<JumpDuckCell>();

  obstacleCells.forEach((cell) => {
    const [row, column] = cell.split('-') as [JumpDuckObstacleRow, JumpDuckObstacleColumn];
    getBlockedPlayerVerticals(row).forEach((verticalAction) => {
      getBlockedPlayerHorizontals(column).forEach((horizontalAction) => {
        blockedCells.add(`${verticalAction}-${horizontalAction}`);
      });
    });
  });

  return [...blockedCells];
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

function createJumpDuckObstacleRoot(obstacleCells: JumpDuckObstacleCell[]): {
  root: THREE.Group;
  pieces: JumpDuckObstaclePiece[];
} {
  const root = new THREE.Group();
  const pieces: JumpDuckObstaclePiece[] = [];

  obstacleCells.forEach((cell) => {
    const [row, column] = cell.split('-') as [JumpDuckObstacleRow, JumpDuckObstacleColumn];
    const laneOffset = JUMP_DUCK_LANE_OFFSETS[column];
    const visual = row === 'bottom' ? createLogMesh() : createBirdMesh();

    visual.position.set(laneOffset, row === 'bottom' ? 0.32 : 1.54, 0);
    root.add(visual);
    pieces.push({
      cell,
      row,
      column,
      blockedVerticals: getBlockedPlayerVerticals(row),
      blockedHorizontals: getBlockedPlayerHorizontals(column),
      materials: collectMaterials(visual),
    });
  });

  if (!root.children.length) {
    const fallback = createLogMesh();
    fallback.position.y = 0.32;
    root.add(fallback);
  }

  return { root, pieces };
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
  const obstaclePatterns: JumpDuckObstacleCell[][] = [
    ['bottom-left'],
    ['bottom-right'],
    ['top-left'],
    ['top-right'],
    ['bottom-left', 'bottom-right'],
    ['top-left', 'top-right'],
    ['bottom-left', 'top-left'],
    ['bottom-right', 'top-right'],
    JUMP_DUCK_OBSTACLE_CELLS.filter((cell) => cell !== 'top-left'),
    JUMP_DUCK_OBSTACLE_CELLS.filter((cell) => cell !== 'top-right'),
    JUMP_DUCK_OBSTACLE_CELLS.filter((cell) => cell !== 'bottom-left'),
    JUMP_DUCK_OBSTACLE_CELLS.filter((cell) => cell !== 'bottom-right'),
  ];

  return {
    obstacles,
    spawnObstacle: () => {
      const gameId = getGameId();
      const playerCount = getPlayerCount();
      const isJumpDuck = gameId === 'jump-duck';
      const kind = isJumpDuck ? 'jump-duck' : 'sideways';
      const targetPlayerIndex = isJumpDuck ? Math.floor(Math.random() * Math.max(1, playerCount)) : null;
      const obstacleCells = obstaclePatterns[Math.floor(Math.random() * obstaclePatterns.length)] ?? ['bottom-left'];
      const blockedCells = isJumpDuck
        ? toBlockedPlayerCells(obstacleCells)
        : [];
      const x = isJumpDuck && targetPlayerIndex !== null
        ? playerTrackX(targetPlayerIndex, playerCount)
        : TRACK_MIN_X + Math.random() * TRACK_WIDTH;
      const jumpDuckObstacle = isJumpDuck ? createJumpDuckObstacleRoot(obstacleCells) : null;
      const root = jumpDuckObstacle?.root ?? createSidewaysObstacleRoot();
      const y = isJumpDuck ? 0 : 0.82;
      root.position.set(x, y, OBSTACLE_SPAWN_Z);
      scene.add(root);
      obstacles.push({
        root,
        x,
        kind,
        targetPlayerIndex,
        blockedCells,
        hitBy: [],
        hitPieces: new Set<string>(),
        hitMaterials: collectMaterials(root),
        pieces: jumpDuckObstacle?.pieces ?? [],
      });
    },
    dispose: () => {
      obstacles.forEach((obstacle) => {
        scene.remove(obstacle.root);
        disposeObject(obstacle.root);
      });
    },
  };
}
