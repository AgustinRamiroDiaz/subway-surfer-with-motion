import * as THREE from 'three';
import { OBSTACLE_SPAWN_Z } from '../../gameConstants';
import { GESTURE_TO_EMOJI, getHandRhythmCellWorldPosition, type HandRhythmCell, type HandRhythmGridSize } from '../../levels/handRhythmLevel';
import { disposeObject } from '../../playerAvatar';
import type { RhythmNote } from '../../rhythmTiming';

export type HandRhythmTarget = {
  root: THREE.Group;
  targetPlayerIndex: number;
  gesture: string;
  cell: HandRhythmCell;
  result: 'pending' | 'hit' | 'missed';
  note: RhythmNote;
  feedbackMaterial: THREE.MeshStandardMaterial;
};

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

function createTargetRoot(gesture: string): {
  root: THREE.Group;
  feedbackMaterial: THREE.MeshStandardMaterial;
} {
  const root = new THREE.Group();
  root.add(createEmojiSprite(GESTURE_TO_EMOJI[gesture] ?? '❓'));
  const color = '#ffd166';
  const feedbackMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.62,
  });
  root.add(new THREE.Mesh(new THREE.RingGeometry(0.55, 0.65, 48), feedbackMaterial));
  return { root, feedbackMaterial };
}

export function setHandRhythmTargetFeedback(target: HandRhythmTarget, hit: boolean): void {
  const color = hit ? '#2fffb2' : '#ff4d6d';
  target.feedbackMaterial.color.set(color);
  target.feedbackMaterial.emissive.set(hit ? '#0b5a3f' : '#6d1024');
  target.feedbackMaterial.emissiveIntensity = 1.5;
  target.feedbackMaterial.opacity = 0.9;
}

export function createHandRhythmTargetSystem(
  scene: THREE.Scene,
  playerCount: number,
  gridSize: HandRhythmGridSize
): {
  targets: HandRhythmTarget[];
  spawn: (note: RhythmNote, targetPlayerIndex: number) => HandRhythmTarget;
  remove: (target: HandRhythmTarget) => void;
  dispose: () => void;
} {
  const targets: HandRhythmTarget[] = [];

  const remove = (target: HandRhythmTarget): void => {
    scene.remove(target.root);
    disposeObject(target.root);
    const index = targets.indexOf(target);
    if (index >= 0) targets.splice(index, 1);
  };

  return {
    targets,
    spawn: (note, targetPlayerIndex) => {
      const position = getHandRhythmCellWorldPosition(note.cell, targetPlayerIndex, playerCount, gridSize);
      const visual = createTargetRoot(note.gesture);
      visual.root.scale.setScalar(0.9 + note.strength * 0.28);
      visual.root.position.set(position.x, position.y, OBSTACLE_SPAWN_Z);
      if (playerCount > 1) visual.root.traverse((child) => child.layers.set(targetPlayerIndex + 1));
      scene.add(visual.root);
      const target: HandRhythmTarget = {
        root: visual.root,
        targetPlayerIndex,
        gesture: note.gesture,
        cell: note.cell,
        result: 'pending',
        note,
        feedbackMaterial: visual.feedbackMaterial,
      };
      targets.push(target);
      return target;
    },
    remove,
    dispose: () => [...targets].forEach(remove),
  };
}
