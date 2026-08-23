import * as THREE from 'three';
import type { HorizontalAction, JumpDuckCell, VerticalAction } from '../motion-mapping/jumpDuckActions';
import { randomIndex, type RandomSource } from './gameSimulation';
import {
  GESTURE_TO_EMOJI,
  getHandRhythmCellWorldPosition,
  HAND_RHYTHM_GESTURES,
  type HandRhythmCell,
  type HandRhythmGridSize,
} from './levels/handRhythmLevel';
import {
  OBSTACLE_SPAWN_Z,
  TRACK_MIN_X,
  TRACK_WIDTH,
} from './gameConstants';
import { disposeObject } from './playerAvatar';
import type {
  JumpDuckObstacleCell,
  JumpDuckObstacleColumn,
  JumpDuckObstaclePiece,
  JumpDuckObstacleRow,
  ObstacleSystem,
  RunnerGameId,
} from './gameTypes';
import { playerTrackX } from './trackLayout';

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

function createEmojiSprite(emoji: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = '84px Inter, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(emoji, 64, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 1.5, 1);
  return sprite;
}

function createGestureObstacleRoot(gesture: string): { root: THREE.Group; feedbackMaterial: THREE.MeshStandardMaterial } {
  const root = new THREE.Group();
  const emoji = GESTURE_TO_EMOJI[gesture] ?? '❓';
  const sprite = createEmojiSprite(emoji);
  sprite.position.y = 0;
  root.add(sprite);

  // Background glow
  const colors: Record<string, string> = {
    Closed_Fist: '#ff6a85',
    Open_Palm: '#2fffb2',
    Pointing_Up: '#b692ff',
    Thumb_Down: '#ff8f4d',
    Thumb_Up: '#ffd166',
    Victory: '#66a3ff',
    ILoveYou: '#ff73d1',
  };
  const color = colors[gesture] ?? '#ffffff';
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.4,
  });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 16, 32), material);
  glow.position.y = 0;
  glow.rotation.x = Math.PI / 2;
  root.add(glow);

  return { root, feedbackMaterial: material };
}

export function createObstacleSystem(
  scene: THREE.Scene,
  getGameId: () => RunnerGameId,
  getPlayerCount: () => number,
  getHandRhythmGridSize: () => HandRhythmGridSize = () => 3,
  getHandRhythmDoubleTargetChance: () => number = () => 0.1,
  random: RandomSource = Math.random
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
      const playerCount = Math.max(1, getPlayerCount());
      const isJumpDuck = gameId === 'jump-duck';
      const isHandRhythm = gameId === 'hand-rhythm';
      const kind = isHandRhythm ? 'hand-rhythm' : isJumpDuck ? 'jump-duck' : 'sideways';
      const obstacleCells = obstaclePatterns[randomIndex(obstaclePatterns.length, random)] ?? ['bottom-left'];
      const blockedCells = isJumpDuck
        ? toBlockedPlayerCells(obstacleCells)
        : [];
      const handTargetPlayers = isHandRhythm
        ? getHandRhythmTargetPlayers(playerCount, getHandRhythmDoubleTargetChance(), random)
        : [];
      const handCells: HandRhythmCell[] = [];
      if (isHandRhythm) {
        const gridSize = getHandRhythmGridSize();
        const availableCellsByPlayer = new Map<number, HandRhythmCell[]>();
        handTargetPlayers.forEach((playerIndex) => {
          const availableCells = availableCellsByPlayer.get(playerIndex) ?? Array.from({ length: gridSize * gridSize }, (_, index) => ({
            row: Math.floor(index / gridSize),
            column: index % gridSize,
          }));
          const [cell] = availableCells.splice(randomIndex(availableCells.length, random), 1);
          if (cell) {
            handCells.push(cell);
          }
          availableCellsByPlayer.set(playerIndex, availableCells);
        });
      }

      const spawnObstacleForPlayer = (targetPlayerIndex: number | null, handCell?: HandRhythmCell): void => {
        const gesture = isHandRhythm
          ? HAND_RHYTHM_GESTURES[randomIndex(HAND_RHYTHM_GESTURES.length, random)]
          : undefined;
        const handPosition = isHandRhythm && targetPlayerIndex !== null && handCell
          ? getHandRhythmCellWorldPosition(handCell, targetPlayerIndex, playerCount, getHandRhythmGridSize())
          : null;
        const x = handPosition?.x ?? ((isJumpDuck || isHandRhythm) && targetPlayerIndex !== null
          ? playerTrackX(targetPlayerIndex, playerCount)
          : TRACK_MIN_X + random() * TRACK_WIDTH);
        const jumpDuckObstacle = isJumpDuck ? createJumpDuckObstacleRoot(obstacleCells) : null;
        const gestureObstacle = isHandRhythm && gesture ? createGestureObstacleRoot(gesture) : null;
        const root = jumpDuckObstacle?.root ?? gestureObstacle?.root ?? createSidewaysObstacleRoot();
        const y = handPosition?.y ?? (isJumpDuck ? 0 : isHandRhythm ? 0.8 : 0.82);
        root.position.set(x, y, OBSTACLE_SPAWN_Z);
        if (isHandRhythm && playerCount > 1 && targetPlayerIndex !== null) {
          root.traverse((child) => child.layers.set(targetPlayerIndex + 1));
        }
        scene.add(root);
        obstacles.push({
          root,
          x,
          kind,
          targetPlayerIndex,
          blockedCells,
          gesture,
          handCell,
          handResult: isHandRhythm ? 'pending' : undefined,
          hitBy: [],
          hitPieces: new Set<string>(),
          hitMaterials: collectMaterials(root),
          feedbackMaterials: gestureObstacle ? [gestureObstacle.feedbackMaterial] : [],
          pieces: jumpDuckObstacle?.pieces ?? [],
        });
      };

      if (isJumpDuck || isHandRhythm) {
        const targetPlayers = isHandRhythm
          ? handTargetPlayers
          : Array.from({ length: playerCount }, (_, index) => index);
        targetPlayers.forEach((playerIndex, targetIndex) => {
          spawnObstacleForPlayer(playerIndex, isHandRhythm ? handCells[targetIndex] : undefined);
        });
        return;
      }

      spawnObstacleForPlayer(null);
    },
    dispose: () => {
      obstacles.forEach((obstacle) => {
        scene.remove(obstacle.root);
        disposeObject(obstacle.root);
      });
    },
  };
}

export function getHandRhythmTargetPlayers(
  playerCount: number,
  doubleTargetChance: number,
  random: RandomSource = Math.random
): number[] {
  const count = Math.max(1, playerCount);
  const chance = Math.min(1, Math.max(0, doubleTargetChance));
  const targets: number[] = [];

  for (let playerIndex = 0; playerIndex < count; playerIndex += 1) {
    targets.push(playerIndex);
    if (random() < chance) {
      targets.push(playerIndex);
    }
  }

  return targets;
}
