import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PersonDetection, PoseKeypoint } from '../pose-detection/detectionSchema';
import {
  KEYPOINT_CONFIDENCE,
  PLAYER_COLORS,
  PLAYER_EMISSIVE_COLORS,
  PLAYER_MODEL_PATH,
} from './gameConstants';
import type { PlayerAvatar, PlayerRig, PlayerRigBoneName } from './gameTypes';

function findKeypoint(detection: PersonDetection | null, label: string): PoseKeypoint | null {
  const keypoint = detection?.keypoints?.find((item) => item.label === label);
  if (!keypoint || keypoint.score < KEYPOINT_CONFIDENCE) {
    return null;
  }
  return keypoint;
}

function distanceBetween(left: PoseKeypoint, right: PoseKeypoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function markerSegmentDirection(
  detection: PersonDetection,
  from: PoseKeypoint | null,
  to: PoseKeypoint | null
): THREE.Vector3 | null {
  if (!from || !to) {
    return null;
  }

  const boxWidth = Math.max(1, detection.box.xmax - detection.box.xmin);
  const boxHeight = Math.max(1, detection.box.ymax - detection.box.ymin);
  const direction = new THREE.Vector3(
    (to.x - from.x) / boxWidth,
    -(to.y - from.y) / boxHeight,
    0
  );

  if (direction.lengthSq() < 0.0001) {
    return null;
  }

  return direction.normalize();
}

export function getPoseAnimationState(detection: PersonDetection | null): { lean: number; turn: number; energy: number } {
  if (!detection?.keypoints?.length) {
    return { lean: 0, turn: 0, energy: 0.55 };
  }

  const leftShoulder = findKeypoint(detection, 'Left Shoulder');
  const rightShoulder = findKeypoint(detection, 'Right Shoulder');
  const leftHip = findKeypoint(detection, 'Left Hip');
  const rightHip = findKeypoint(detection, 'Right Hip');
  const leftKnee = findKeypoint(detection, 'Left Knee');
  const rightKnee = findKeypoint(detection, 'Right Knee');
  const leftWrist = findKeypoint(detection, 'Left Wrist');
  const rightWrist = findKeypoint(detection, 'Right Wrist');

  const boxWidth = Math.max(1, detection.box.xmax - detection.box.xmin);
  const boxHeight = Math.max(1, detection.box.ymax - detection.box.ymin);
  const shoulderMidX = leftShoulder && rightShoulder ? (leftShoulder.x + rightShoulder.x) / 2 : null;
  const hipMidX = leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : null;
  const lean = shoulderMidX !== null && hipMidX !== null
    ? THREE.MathUtils.clamp((shoulderMidX - hipMidX) / boxWidth, -1, 1)
    : 0;

  const shoulderWidth = leftShoulder && rightShoulder ? distanceBetween(leftShoulder, rightShoulder) : boxWidth * 0.34;
  const hipWidth = leftHip && rightHip ? distanceBetween(leftHip, rightHip) : shoulderWidth;
  const turn = THREE.MathUtils.clamp((shoulderWidth - hipWidth) / boxWidth, -1, 1);
  const kneeStride = leftKnee && rightKnee ? Math.abs(leftKnee.y - rightKnee.y) / boxHeight : 0;
  const wristStride = leftWrist && rightWrist ? Math.abs(leftWrist.y - rightWrist.y) / boxHeight : 0;
  const energy = THREE.MathUtils.clamp(0.48 + kneeStride * 1.9 + wristStride * 0.9, 0.35, 1.8);

  return { lean, turn, energy };
}

function getRigBoneNames(): PlayerRigBoneName[] {
  return [
    'Hips',
    'Torso_1',
    'Head',
    'UpperArmL',
    'LowerArmL',
    'UpperArmR',
    'LowerArmR',
    'UpperLegL',
    'LowerLegL',
    'UpperLegR',
    'LowerLegR',
  ];
}

function createPlayerRig(model: THREE.Object3D): PlayerRig {
  const allBones = new Map<string, THREE.Bone>();
  const bones: Partial<Record<PlayerRigBoneName, THREE.Bone>> = {};
  const restQuaternions = new Map<PlayerRigBoneName, THREE.Quaternion>();
  const restWorldDirections = new Map<PlayerRigBoneName, THREE.Vector3>();
  const restWorldQuaternions = new Map<PlayerRigBoneName, THREE.Quaternion>();
  const expectedBoneNames = new Set(getRigBoneNames());

  model.updateMatrixWorld(true);
  model.traverse((child) => {
    const bone = child as THREE.Bone;
    if (!bone.isBone) {
      return;
    }

    allBones.set(bone.name, bone);
    if (!expectedBoneNames.has(bone.name as PlayerRigBoneName)) {
      return;
    }
    const boneName = bone.name as PlayerRigBoneName;
    bones[boneName] = bone;
    restQuaternions.set(boneName, bone.quaternion.clone());
    restWorldQuaternions.set(boneName, bone.getWorldQuaternion(new THREE.Quaternion()));
  });

  const directionTargets: Partial<Record<PlayerRigBoneName, string>> = {
    UpperArmL: 'LowerArmL',
    LowerArmL: 'Palm2L',
    UpperArmR: 'LowerArmR',
    LowerArmR: 'Palm2R',
    UpperLegL: 'LowerLegL',
    LowerLegL: 'FootL',
    UpperLegR: 'LowerLegR',
    LowerLegR: 'FootR',
  };

  Object.entries(directionTargets).forEach(([boneName, childName]) => {
    const bone = bones[boneName as PlayerRigBoneName];
    const child = allBones.get(childName);
    if (!bone || !child) {
      return;
    }

    const bonePosition = new THREE.Vector3();
    const childPosition = new THREE.Vector3();
    bone.getWorldPosition(bonePosition);
    child.getWorldPosition(childPosition);
    restWorldDirections.set(
      boneName as PlayerRigBoneName,
      childPosition.sub(bonePosition).normalize()
    );
  });

  return { bones, restQuaternions, restWorldDirections, restWorldQuaternions };
}

function rotateBoneFromRest(
  rig: PlayerRig,
  name: PlayerRigBoneName,
  rotation: THREE.Euler,
  alpha: number
): void {
  const bone = rig.bones[name];
  const restQuaternion = rig.restQuaternions.get(name);
  if (!bone || !restQuaternion) {
    return;
  }

  const targetQuaternion = restQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(rotation));
  bone.quaternion.slerp(targetQuaternion, alpha);
}

function pointBoneAtMarkerSegment(
  rig: PlayerRig,
  name: PlayerRigBoneName,
  direction: THREE.Vector3 | null,
  alpha: number
): void {
  const bone = rig.bones[name];
  const restWorldDirection = rig.restWorldDirections.get(name);
  const restWorldQuaternion = rig.restWorldQuaternions.get(name);
  const parent = bone?.parent;
  if (!bone || !parent || !restWorldDirection || !restWorldQuaternion || !direction) {
    return;
  }

  parent.updateWorldMatrix(true, false);
  const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
  const swing = new THREE.Quaternion().setFromUnitVectors(restWorldDirection, direction);
  const targetWorldQuaternion = swing.multiply(restWorldQuaternion);
  const targetQuaternion = parentWorldQuaternion.invert().multiply(targetWorldQuaternion);
  bone.quaternion.slerp(targetQuaternion, alpha);
}

function resetRigToRest(rig: PlayerRig, alpha: number): void {
  rig.restQuaternions.forEach((restQuaternion, boneName) => {
    const bone = rig.bones[boneName];
    bone?.quaternion.slerp(restQuaternion, alpha);
  });
}

export function applyMarkerPose(player: PlayerAvatar, detection: PersonDetection | null): void {
  const rig = player.rig;
  if (!rig) {
    return;
  }

  resetRigToRest(rig, detection?.keypoints?.length ? 0.2 : 0.08);
  if (!detection?.keypoints?.length) {
    return;
  }

  const leftShoulder = findKeypoint(detection, 'Left Shoulder');
  const rightShoulder = findKeypoint(detection, 'Right Shoulder');
  const leftElbow = findKeypoint(detection, 'Left Elbow');
  const rightElbow = findKeypoint(detection, 'Right Elbow');
  const leftWrist = findKeypoint(detection, 'Left Wrist');
  const rightWrist = findKeypoint(detection, 'Right Wrist');
  const leftHip = findKeypoint(detection, 'Left Hip');
  const rightHip = findKeypoint(detection, 'Right Hip');
  const leftKnee = findKeypoint(detection, 'Left Knee');
  const rightKnee = findKeypoint(detection, 'Right Knee');
  const leftAnkle = findKeypoint(detection, 'Left Ankle');
  const rightAnkle = findKeypoint(detection, 'Right Ankle');
  const nose = findKeypoint(detection, 'Nose');

  const poseState = getPoseAnimationState(detection);
  const leftUpperArm = markerSegmentDirection(detection, leftShoulder, leftElbow);
  const rightUpperArm = markerSegmentDirection(detection, rightShoulder, rightElbow);
  const leftLowerArm = markerSegmentDirection(detection, leftElbow, leftWrist);
  const rightLowerArm = markerSegmentDirection(detection, rightElbow, rightWrist);
  const leftUpperLeg = markerSegmentDirection(detection, leftHip, leftKnee);
  const rightUpperLeg = markerSegmentDirection(detection, rightHip, rightKnee);
  const leftLowerLeg = markerSegmentDirection(detection, leftKnee, leftAnkle);
  const rightLowerLeg = markerSegmentDirection(detection, rightKnee, rightAnkle);
  const shoulderLine = leftShoulder && rightShoulder
    ? THREE.MathUtils.clamp((rightShoulder.y - leftShoulder.y) / Math.max(1, distanceBetween(leftShoulder, rightShoulder)), -0.8, 0.8)
    : 0;
  const headTilt = nose && leftShoulder && rightShoulder
    ? THREE.MathUtils.clamp((nose.x - (leftShoulder.x + rightShoulder.x) / 2) / Math.max(1, distanceBetween(leftShoulder, rightShoulder)), -0.7, 0.7)
    : 0;

  rotateBoneFromRest(rig, 'Hips', new THREE.Euler(0, poseState.turn * 0.25, -poseState.lean * 0.35), 0.35);
  rotateBoneFromRest(rig, 'Torso_1', new THREE.Euler(0, -poseState.turn * 0.2, shoulderLine * 0.55), 0.35);
  rotateBoneFromRest(rig, 'Head', new THREE.Euler(0, headTilt * 0.5, -headTilt * 0.25), 0.3);

  pointBoneAtMarkerSegment(rig, 'UpperArmL', leftUpperArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'LowerArmL', leftLowerArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'UpperArmR', rightUpperArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'LowerArmR', rightLowerArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'UpperLegL', leftUpperLeg, 0.35);
  pointBoneAtMarkerSegment(rig, 'LowerLegL', leftLowerLeg, 0.35);
  pointBoneAtMarkerSegment(rig, 'UpperLegR', rightUpperLeg, 0.35);
  pointBoneAtMarkerSegment(rig, 'LowerLegR', rightLowerLeg, 0.35);
}

export function createFallbackPlayer(index: number): PlayerAvatar {
  const root = new THREE.Group();
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 32, 32),
    new THREE.MeshStandardMaterial({
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      emissive: PLAYER_EMISSIVE_COLORS[index % PLAYER_EMISSIVE_COLORS.length],
      roughness: 0.38,
      metalness: 0.12,
    })
  );
  fallback.position.y = 0.57;
  fallback.castShadow = true;
  root.add(fallback);

  return {
    root,
    fallback,
    rig: null,
    poseEnergy: 0.55,
  };
}

function tintPlayerModel(model: THREE.Object3D, index: number): void {
  const tint = new THREE.Color(PLAYER_COLORS[index % PLAYER_COLORS.length]);

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clonedMaterials = materials.map((material) => {
      const clone = material.clone();
      if ('color' in clone && clone.color instanceof THREE.Color) {
        clone.color.lerp(tint, 0.28);
      }
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
  });
}

export async function loadPlayerModels(players: PlayerAvatar[], isDisposed: () => boolean): Promise<void> {
  const loader = new GLTFLoader();
  const model = await loader.loadAsync(PLAYER_MODEL_PATH);
  if (isDisposed()) {
    disposeObject(model.scene);
    return;
  }

  players.forEach((player, index) => {
    if (isDisposed()) {
      return;
    }

    const clone = SkeletonUtils.clone(model.scene);
    clone.name = `pose-driven-player-${index + 1}`;
    clone.scale.setScalar(0.42);
    clone.rotation.y = Math.PI;
    tintPlayerModel(clone, index);
    player.rig = createPlayerRig(clone);
    player.fallback.visible = false;
    player.root.add(clone);
  });
}

export function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => materials.add(material));
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
