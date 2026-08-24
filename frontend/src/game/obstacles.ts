import * as THREE from 'three';
import type { HorizontalAction, JumpDuckCell, VerticalAction } from '../motion-mapping/jumpDuckActions';
import { OBSTACLE_SPAWN_Z, TRACK_MIN_X, TRACK_WIDTH } from './gameConstants';
import { randomIndex, type RandomSource } from './gameSimulation';
import type {
  JumpDuckObstacleCell,
  JumpDuckObstacleColumn,
  JumpDuckObstaclePiece,
  JumpDuckObstacleRow,
  ObstacleSystem,
  PoseRunnerGameId,
} from './gameTypes';
import { disposeObject } from './playerAvatar';
import { playerTrackX } from './trackLayout';

const LANE_OFFSETS: Record<JumpDuckObstacleColumn, number> = { left: -0.48, right: 0.48 };
const OBSTACLE_CELLS: JumpDuckObstacleCell[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function getBlockedHorizontals(column: JumpDuckObstacleColumn): HorizontalAction[] {
  return column === 'left' ? ['left', 'center'] : ['center', 'right'];
}

function getBlockedVerticals(row: JumpDuckObstacleRow): VerticalAction[] {
  return row === 'top' ? ['jump', 'run'] : ['run', 'duck'];
}

function toBlockedPlayerCells(obstacleCells: JumpDuckObstacleCell[]): JumpDuckCell[] {
  const blockedCells = new Set<JumpDuckCell>();
  obstacleCells.forEach((cell) => {
    const [row, column] = cell.split('-') as [JumpDuckObstacleRow, JumpDuckObstacleColumn];
    getBlockedVerticals(row).forEach((vertical) => {
      getBlockedHorizontals(column).forEach((horizontal) => blockedCells.add(`${vertical}-${horizontal}`));
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
    if (!mesh.isMesh) return;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) materials.push(material);
    });
  });
  return materials;
}

function createJumpDuckObstacleRoot(obstacleCells: JumpDuckObstacleCell[]): {
  root: THREE.Group;
  pieces: JumpDuckObstaclePiece[];
} {
  const root = new THREE.Group();
  const pieces: JumpDuckObstaclePiece[] = [];
  obstacleCells.forEach((cell) => {
    const [row, column] = cell.split('-') as [JumpDuckObstacleRow, JumpDuckObstacleColumn];
    const visual = row === 'bottom' ? createLogMesh() : createBirdMesh();
    visual.position.set(LANE_OFFSETS[column], row === 'bottom' ? 0.32 : 1.54, 0);
    root.add(visual);
    pieces.push({
      cell,
      row,
      column,
      blockedVerticals: getBlockedVerticals(row),
      blockedHorizontals: getBlockedHorizontals(column),
      materials: collectMaterials(visual),
    });
  });
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
  getGameId: () => PoseRunnerGameId,
  getPlayerCount: () => number,
  random: RandomSource = Math.random
): ObstacleSystem {
  const obstacles: ObstacleSystem['obstacles'] = [];
  const patterns: JumpDuckObstacleCell[][] = [
    ['bottom-left'], ['bottom-right'], ['top-left'], ['top-right'],
    ['bottom-left', 'bottom-right'], ['top-left', 'top-right'],
    ['bottom-left', 'top-left'], ['bottom-right', 'top-right'],
    OBSTACLE_CELLS.filter((cell) => cell !== 'top-left'),
    OBSTACLE_CELLS.filter((cell) => cell !== 'top-right'),
    OBSTACLE_CELLS.filter((cell) => cell !== 'bottom-left'),
    OBSTACLE_CELLS.filter((cell) => cell !== 'bottom-right'),
  ];

  return {
    obstacles,
    spawnObstacle: () => {
      const gameId = getGameId();
      const playerCount = Math.max(1, getPlayerCount());
      const isJumpDuck = gameId === 'jump-duck';
      const obstacleCells = patterns[randomIndex(patterns.length, random)] ?? ['bottom-left'];
      const blockedCells = isJumpDuck ? toBlockedPlayerCells(obstacleCells) : [];
      const targetPlayers = isJumpDuck
        ? Array.from({ length: playerCount }, (_, index) => index)
        : [null];

      targetPlayers.forEach((targetPlayerIndex) => {
        const x = isJumpDuck && targetPlayerIndex !== null
          ? playerTrackX(targetPlayerIndex, playerCount)
          : TRACK_MIN_X + random() * TRACK_WIDTH;
        const jumpDuckObstacle = isJumpDuck ? createJumpDuckObstacleRoot(obstacleCells) : null;
        const root = jumpDuckObstacle?.root ?? createSidewaysObstacleRoot();
        root.position.set(x, isJumpDuck ? 0 : 0.82, OBSTACLE_SPAWN_Z);
        scene.add(root);
        obstacles.push({
          root,
          x,
          kind: gameId,
          targetPlayerIndex,
          blockedCells,
          hitBy: [],
          hitPieces: new Set<string>(),
          hitMaterials: collectMaterials(root),
          pieces: jumpDuckObstacle?.pieces ?? [],
        });
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
