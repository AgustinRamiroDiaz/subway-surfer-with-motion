import type * as THREE from 'three';
import type { HorizontalAction, JumpDuckCell, VerticalAction } from '../motion-mapping/jumpDuckActions';
import type { HandRhythmCell } from './levels/handRhythmLevel';
import type { RhythmNote } from './rhythmTiming';

export type GamePhase = 'ready' | 'running' | 'paused';

export type RunnerGameId = 'sideways' | 'jump-duck' | 'hand-rhythm';

export type JumpDuckObstacleRow = 'top' | 'bottom';
export type JumpDuckObstacleColumn = 'left' | 'right';
export type JumpDuckObstacleCell = `${JumpDuckObstacleRow}-${JumpDuckObstacleColumn}`;

export type JumpDuckObstaclePiece = {
  cell: JumpDuckObstacleCell;
  row: JumpDuckObstacleRow;
  column: JumpDuckObstacleColumn;
  blockedVerticals: VerticalAction[];
  blockedHorizontals: HorizontalAction[];
  materials: THREE.MeshStandardMaterial[];
};

export type Obstacle = {
  root: THREE.Group;
  x: number;
  kind: RunnerGameId;
  targetPlayerIndex: number | null;
  blockedCells: JumpDuckCell[];
  gesture?: string;
  handCell?: HandRhythmCell;
  handResult?: 'pending' | 'hit' | 'missed';
  rhythmNote?: RhythmNote;
  hitBy: boolean[];
  hitPieces: Set<string>;
  hitMaterials: THREE.MeshStandardMaterial[];
  feedbackMaterials: THREE.MeshStandardMaterial[];
  pieces: JumpDuckObstaclePiece[];
};

export type GameStats = {
  dodged: number;
  hits: number[];
  misses: number[];
  status: 'running' | 'hit';
  hitPlayer: number | null;
};

export type PlayerRigBoneName =
  | 'Hips'
  | 'Torso_1'
  | 'Head'
  | 'UpperArmL'
  | 'LowerArmL'
  | 'UpperArmR'
  | 'LowerArmR'
  | 'UpperLegL'
  | 'LowerLegL'
  | 'UpperLegR'
  | 'LowerLegR';

export type PlayerRig = {
  bones: Partial<Record<PlayerRigBoneName, THREE.Bone>>;
  restQuaternions: Map<PlayerRigBoneName, THREE.Quaternion>;
  restWorldDirections: Map<PlayerRigBoneName, THREE.Vector3>;
  restWorldQuaternions: Map<PlayerRigBoneName, THREE.Quaternion>;
};

export type PlayerAvatar = {
  root: THREE.Group;
  fallback: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  gestureSprite?: THREE.Sprite;
  gestureTexture?: THREE.CanvasTexture;
  gestureSprites?: THREE.Sprite[];
  gestureTextures?: THREE.CanvasTexture[];
  rig: PlayerRig | null;
  poseEnergy: number;
};

export type TrackWorld = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameras: THREE.PerspectiveCamera[];
  renderer: THREE.WebGLRenderer;
  players: PlayerAvatar[];
  render: () => void;
  resize: (width: number, height: number) => void;
  updateHandRhythmGrid: (cells: Array<HandRhythmCell[] | undefined>) => void;
  dispose: () => void;
};

export type ObstacleSystem = {
  obstacles: Obstacle[];
  spawnHandRhythmTarget: (note: RhythmNote, targetPlayerIndex: number) => void;
  spawnObstacle: () => void;
  dispose: () => void;
};
