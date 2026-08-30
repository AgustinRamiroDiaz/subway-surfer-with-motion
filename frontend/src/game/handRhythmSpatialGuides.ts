import * as THREE from 'three';
import type { HandRhythmGridSize } from './levels/handRhythmLevel';
import { getHandRhythmGridBounds } from './levels/handRhythmLayout';

const GUIDE_FAR_Z = -24;
const GUIDE_NEAR_Z = 4;
const PLAYER_GUIDE_COLORS = ['#2fffb2', '#66a3ff', '#ffd166', '#ff6a85'] as const;

export function getHandRhythmRowBoundaries(
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize
): number[] {
  const bounds = getHandRhythmGridBounds(playerIndex, playerCount, gridSize);
  const cellHeight = bounds.height / gridSize;
  return Array.from(
    { length: gridSize + 1 },
    (_, boundaryIndex) => bounds.bottom + boundaryIndex * cellHeight
  );
}

function createLine(
  points: THREE.Vector3[],
  material: THREE.LineBasicMaterial,
  name: string
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  line.name = name;
  return line;
}

export function createHandRhythmSpatialGuides(
  scene: THREE.Scene,
  playerCount: number,
  gridSize: HandRhythmGridSize
): () => void {
  const groups: THREE.Group[] = [];

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const bounds = getHandRhythmGridBounds(playerIndex, playerCount, gridSize);
    const color = PLAYER_GUIDE_COLORS[playerIndex % PLAYER_GUIDE_COLORS.length] ?? '#2fffb2';
    const group = new THREE.Group();
    group.name = `player-${playerIndex + 1}-rhythm-spatial-guides`;

    const horizonMaterial = new THREE.MeshBasicMaterial({
      color,
      depthWrite: false,
      opacity: 0.075,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const horizon = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.width, bounds.height),
      horizonMaterial
    );
    horizon.name = `player-${playerIndex + 1}-rhythm-horizon`;
    horizon.position.set(bounds.centerX, bounds.centerY, GUIDE_FAR_Z);
    horizon.renderOrder = -18;
    group.add(horizon);

    const ceilingMaterial = new THREE.MeshBasicMaterial({
      color,
      depthWrite: false,
      opacity: 0.055,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.width, GUIDE_NEAR_Z - GUIDE_FAR_Z),
      ceilingMaterial
    );
    ceiling.name = `player-${playerIndex + 1}-rhythm-ceiling`;
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.set(bounds.centerX, bounds.top, (GUIDE_FAR_Z + GUIDE_NEAR_Z) / 2);
    ceiling.renderOrder = -18;
    group.add(ceiling);

    const lineMaterial = new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      opacity: 0.32,
      transparent: true,
    });
    const rowBoundaries = getHandRhythmRowBoundaries(playerIndex, playerCount, gridSize);
    rowBoundaries.forEach((y, boundaryIndex) => {
      group.add(createLine(
        [
          new THREE.Vector3(bounds.left, y, GUIDE_FAR_Z + 0.02),
          new THREE.Vector3(bounds.right, y, GUIDE_FAR_Z + 0.02),
        ],
        lineMaterial,
        `player-${playerIndex + 1}-rhythm-horizon-row-${boundaryIndex}`
      ));

      for (const x of [bounds.left, bounds.right]) {
        group.add(createLine(
          [new THREE.Vector3(x, y, GUIDE_FAR_Z), new THREE.Vector3(x, y, GUIDE_NEAR_Z)],
          lineMaterial,
          `player-${playerIndex + 1}-rhythm-row-rail-${boundaryIndex}`
        ));
      }
    });

    for (let columnBoundary = 0; columnBoundary <= gridSize; columnBoundary += 1) {
      const x = bounds.left + bounds.width * columnBoundary / gridSize;
      group.add(createLine(
        [
          new THREE.Vector3(x, bounds.top - 0.01, GUIDE_FAR_Z),
          new THREE.Vector3(x, bounds.top - 0.01, GUIDE_NEAR_Z),
        ],
        lineMaterial,
        `player-${playerIndex + 1}-rhythm-ceiling-column-${columnBoundary}`
      ));
    }

    if (playerCount > 1) {
      group.traverse((child) => child.layers.set(playerIndex + 1));
    }
    scene.add(group);
    groups.push(group);
  }

  return () => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    groups.forEach((group) => {
      scene.remove(group);
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line)) return;
        const renderable = child as THREE.Object3D & {
          geometry: THREE.BufferGeometry;
          material: THREE.Material | THREE.Material[];
        };
        geometries.add(renderable.geometry);
        const childMaterials = Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material];
        childMaterials.forEach((material) => materials.add(material));
      });
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };
}
