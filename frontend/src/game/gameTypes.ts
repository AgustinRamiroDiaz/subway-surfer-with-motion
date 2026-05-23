import type * as THREE from 'three';
import type { JumpDuckCell } from '../motion-mapping/jumpDuckActions';

export type GamePhase = 'ready' | 'running' | 'paused';

export type RunnerGameId = 'sideways' | 'jump-duck';

export type Obstacle = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  x: number;
  kind: RunnerGameId;
  targetPlayerIndex: number | null;
  blockedCells: JumpDuckCell[];
  hitBy: boolean[];
};

export type GameStats = {
  dodged: number;
  hits: number[];
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
  rig: PlayerRig | null;
  poseEnergy: number;
};

export type TrackWorld = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  players: PlayerAvatar[];
  dispose: () => void;
};

export type ObstacleSystem = {
  obstacles: Obstacle[];
  spawnObstacle: () => void;
  dispose: () => void;
};
