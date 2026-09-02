import type { HandInput } from '../../../motion-mapping/gameplayInput';
import {
  OBSTACLE_SPAWN_Z,
  PLAYER_COLORS,
  PLAYER_Z,
} from '../../gameConstants';
import {
  GESTURE_TO_EMOJI,
  getHandRhythmCell,
  type HandRhythmGridSize,
} from '../../levels/handRhythmLevel';
import type { HandRhythmCameraOverlayOptions } from '../../handRhythmCameraOverlay';
import {
  HAND_RHYTHM_CAMERA_Z,
  type HandRhythmRenderer,
  type HandRhythmVisualTarget,
} from './handRhythmRendererTypes';

export type CanvasFitRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type TargetRectangleCenter = {
  centerX: number;
  centerY: number;
  cellWidth: number;
  cellHeight: number;
};

export function getContainedCanvasRect(
  width: number,
  height: number,
  aspectRatio: number
): CanvasFitRect {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeAspect = Math.max(0.1, aspectRatio);
  const stageAspect = safeWidth / safeHeight;
  const fitWidth = safeAspect >= stageAspect ? safeWidth : safeHeight * safeAspect;
  const fitHeight = safeAspect >= stageAspect ? safeWidth / safeAspect : safeHeight;
  return {
    left: (safeWidth - fitWidth) / 2,
    top: (safeHeight - fitHeight) / 2,
    width: fitWidth,
    height: fitHeight,
  };
}

export function getCanvasPerspectiveScale(z: number): number {
  const hitPlaneDistance = HAND_RHYTHM_CAMERA_Z - PLAYER_Z;
  const targetDistance = Math.max(0.001, HAND_RHYTHM_CAMERA_Z - z);
  return hitPlaneDistance / targetDistance;
}

export function getCanvasTargetProgress(z: number): number {
  const spawnScale = getCanvasPerspectiveScale(OBSTACLE_SPAWN_Z);
  const perspectiveScale = getCanvasPerspectiveScale(z);
  return Math.min(1.15, Math.max(0, (perspectiveScale - spawnScale) / (1 - spawnScale)));
}

export function getTargetRectangleCenter(
  rect: CanvasFitRect,
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize,
  column: number,
  row: number
): TargetRectangleCenter {
  const panelWidth = rect.width / playerCount;
  const panelLeft = rect.left + panelWidth * playerIndex;
  const cellWidth = panelWidth / gridSize;
  const cellHeight = rect.height / gridSize;
  const centerX = panelLeft + (column + 0.5) * cellWidth;
  const centerY = rect.top + (row + 0.5) * cellHeight;
  return { centerX, centerY, cellWidth, cellHeight };
}

function drawSource(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  rect: CanvasFitRect,
  mirrored: boolean,
  opacity: number
): void {
  context.save();
  context.globalAlpha = opacity;
  if (mirrored) {
    context.translate(rect.left + rect.width, rect.top);
    context.scale(-1, 1);
    context.drawImage(source, 0, 0, rect.width, rect.height);
  } else {
    context.drawImage(source, rect.left, rect.top, rect.width, rect.height);
  }
  context.restore();
}

function drawGridGuides(
  context: CanvasRenderingContext2D,
  rect: CanvasFitRect,
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize,
  showFloor: boolean
): void {
  const panelWidth = rect.width / playerCount;
  const left = rect.left + panelWidth * playerIndex;
  const right = left + panelWidth;
  const top = rect.top;
  const bottom = rect.top + rect.height;
  const cellWidth = panelWidth / gridSize;
  const cellHeight = rect.height / gridSize;
  const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];

  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;

  // Background tint for player viewport panel
  context.globalAlpha = 0.05;
  context.fillRect(left, top, panelWidth, rect.height);

  // Outer border of player viewport panel
  context.globalAlpha = 0.3;
  context.lineWidth = 2;
  context.strokeRect(left, top, panelWidth, rect.height);

  // 2D Grid lines separating cell rectangles
  context.lineWidth = 1;
  for (let col = 1; col < gridSize; col += 1) {
    const x = left + col * cellWidth;
    context.globalAlpha = 0.18;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }

  for (let row = 1; row < gridSize; row += 1) {
    const y = top + row * cellHeight;
    context.globalAlpha = 0.18;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }

  // Subtle floor / ground baseline indicator if enabled
  if (showFloor) {
    context.globalAlpha = 0.25;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(left, bottom - 2);
    context.lineTo(right, bottom - 2);
    context.stroke();
  }

  // Always-present Hit Zone Circle Outline in every cell rectangle
  const baseSize = Math.min(cellWidth, cellHeight);
  const hitZoneRadius = baseSize * 0.38;
  for (let col = 0; col < gridSize; col += 1) {
    for (let row = 0; row < gridSize; row += 1) {
      const cx = left + (col + 0.5) * cellWidth;
      const cy = top + (row + 0.5) * cellHeight;

      // Subtle target zone fill
      context.save();
      context.fillStyle = color;
      context.globalAlpha = 0.05;
      context.beginPath();
      context.arc(cx, cy, hitZoneRadius, 0, Math.PI * 2);
      context.fill();

      // Hit Zone Circle Outline
      context.strokeStyle = color;
      context.globalAlpha = 0.5;
      context.lineWidth = Math.max(2, baseSize * 0.035);
      context.shadowColor = color;
      context.shadowBlur = 4;
      context.beginPath();
      context.arc(cx, cy, hitZoneRadius, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  context.restore();
}

function drawActiveHands(
  context: CanvasRenderingContext2D,
  rect: CanvasFitRect,
  hands: HandInput[],
  playerIndex: number,
  playerCount: number,
  gridSize: HandRhythmGridSize
): void {
  const panelWidth = rect.width / playerCount;
  const panelLeft = rect.left + panelWidth * playerIndex;
  const cellWidth = panelWidth / gridSize;
  const cellHeight = rect.height / gridSize;
  const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];

  hands.forEach((hand) => {
    const cell = getHandRhythmCell(hand, playerIndex, playerCount, gridSize);
    context.save();
    context.fillStyle = color;
    context.globalAlpha = 0.17;
    context.fillRect(
      panelLeft + cell.column * cellWidth,
      rect.top + cell.row * cellHeight,
      cellWidth,
      cellHeight
    );
    context.strokeStyle = '#ffffff';
    context.globalAlpha = 0.92;
    context.lineWidth = 2;
    context.strokeRect(
      panelLeft + cell.column * cellWidth + 2,
      rect.top + cell.row * cellHeight + 2,
      Math.max(1, cellWidth - 4),
      Math.max(1, cellHeight - 4)
    );

    const localX = Math.min(1, Math.max(0, hand.normalizedX * playerCount - playerIndex));
    const x = panelLeft + localX * panelWidth;
    const y = rect.top + Math.min(1, Math.max(0, hand.normalizedY)) * rect.height;
    const size = Math.max(
      30,
      Math.min(
        panelWidth * 0.34,
        Math.max(
          (hand.normalizedWidth ?? 0.15) * rect.width,
          (hand.normalizedHeight ?? 0.15) * rect.height
        )
      )
    );
    context.globalAlpha = 0.72;
    context.font = `${size}px Inter, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.fillText(GESTURE_TO_EMOJI[hand.gesture] ?? GESTURE_TO_EMOJI.None, x, y);
    context.restore();
  });
}

function drawTarget(
  context: CanvasRenderingContext2D,
  rect: CanvasFitRect,
  target: HandRhythmVisualTarget,
  playerCount: number,
  gridSize: HandRhythmGridSize
): void {
  const { centerX, centerY, cellWidth, cellHeight } = getTargetRectangleCenter(
    rect,
    target.targetPlayerIndex,
    playerCount,
    gridSize,
    target.cell.column,
    target.cell.row
  );

  const baseSize = Math.min(cellWidth, cellHeight);
  const targetRadius = baseSize * 0.38;
  const linearProgress = getCanvasTargetProgress(target.z);
  const approachScale = getCanvasPerspectiveScale(target.z);
  const currentRadius = targetRadius * approachScale;
  const passedHitZone = Math.max(0, linearProgress - 1) / 0.15;

  const color = target.result === 'hit'
    ? '#2fffb2'
    : target.result === 'missed'
      ? '#ff4d6d'
      : '#ffd166';

  context.save();
  context.globalAlpha = Math.max(0, 1 - passedHitZone * 0.72);

  // Active Hit Zone Circle Outline (illuminated/highlighted when target is active)
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = target.result !== 'pending' ? 16 : 10;
  context.lineWidth = Math.max(2.5, baseSize * 0.04);
  context.beginPath();
  context.arc(centerX, centerY, targetRadius, 0, Math.PI * 2);
  context.stroke();

  // Subtle interior fill highlight for pending target
  if (target.result === 'pending') {
    context.fillStyle = color;
    context.globalAlpha = 0.06 + Math.min(1, linearProgress) * 0.1;
    context.fill();
    context.globalAlpha = Math.max(0, 1 - passedHitZone * 0.72);
  }

  // Approaching obstacle: centered with rectangle, growing bigger to simulate getting closer
  // Growing obstacle ring
  context.lineWidth = Math.max(2.5, currentRadius * 0.08);
  context.beginPath();
  context.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
  context.stroke();

  // Obstacle interior glow
  context.fillStyle = color;
  context.globalAlpha = 0.14 * Math.min(1, linearProgress);
  context.fill();
  context.globalAlpha = Math.max(0, 1 - passedHitZone * 0.72);

  // Gesture Emoji centered in rectangle, scaled with approach
  context.shadowBlur = 0;
  context.fillStyle = '#ffffff';
  const emojiSize = Math.max(16, currentRadius * 1.25);
  context.font = `${emojiSize}px Inter, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(GESTURE_TO_EMOJI[target.gesture] ?? '❓', centerX, centerY);

  // Result feedback on hit / miss
  if (target.result === 'hit') {
    context.fillStyle = '#2fffb2';
    context.font = `bold ${Math.max(12, baseSize * 0.15)}px Inter, system-ui, sans-serif`;
    context.fillText('PERFECT', centerX, centerY + targetRadius + 14);
  } else if (target.result === 'missed') {
    context.fillStyle = '#ff4d6d';
    context.font = `bold ${Math.max(12, baseSize * 0.15)}px Inter, system-ui, sans-serif`;
    context.fillText('MISS', centerX, centerY + targetRadius + 14);
  }

  context.restore();
}

export function createCanvas2dHandRhythmRenderer(
  mount: HTMLDivElement,
  playerCount: number,
  gridSize: HandRhythmGridSize,
  showFloor: boolean,
  cameraOptions: HandRhythmCameraOverlayOptions
): HandRhythmRenderer {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas hand-rhythm-canvas2d';
  canvas.dataset.renderer = 'canvas2d';
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable.');
  mount.appendChild(canvas);

  let width = 1;
  let height = 1;
  let videoAspectRatio = 16 / 9;

  return {
    render: (state) => {
      const rect = getContainedCanvasRect(width, height, videoAspectRatio);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const pixelRatio = canvas.width / width;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = '#101416';
      context.fillRect(0, 0, width, height);

      if (cameraOptions.showCameraPreview && cameraOptions.video?.readyState && cameraOptions.video.readyState >= 2) {
        drawSource(context, cameraOptions.video, rect, cameraOptions.cameraMirrored, 0.18);
      }
      if (
        cameraOptions.showDetectionOverlay &&
        cameraOptions.detectionCanvas &&
        cameraOptions.detectionCanvas.width > 0 &&
        cameraOptions.detectionCanvas.height > 0
      ) {
        drawSource(context, cameraOptions.detectionCanvas, rect, cameraOptions.cameraMirrored, 0.46);
      }

      for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
        drawGridGuides(context, rect, playerIndex, playerCount, gridSize, showFloor);
        drawActiveHands(
          context,
          rect,
          state.hands[playerIndex] ?? [],
          playerIndex,
          playerCount,
          gridSize
        );
      }
      state.targets.forEach((target) => drawTarget(context, rect, target, playerCount, gridSize));
    },
    resize: (nextWidth, nextHeight, nextVideoAspectRatio) => {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      videoAspectRatio = Math.max(0.1, nextVideoAspectRatio);
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      const rect = getContainedCanvasRect(width, height, videoAspectRatio);
      return {
        left: rect.left / width,
        right: (rect.left + rect.width) / width,
        top: rect.top / height,
        bottom: (rect.top + rect.height) / height,
      };
    },
    dispose: () => canvas.remove(),
  };
}
