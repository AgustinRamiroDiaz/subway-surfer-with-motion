import type { PersonDetection, PoseKeypoint } from './aiDetector';
import { formatPercent } from './formatters';

export const DEFAULT_PLAYER_POSITION = 0.5;
export const DEFAULT_PLAYER_POSITIONS = [0.33, 0.67] as const;
export const MAX_PLAYERS = 2;

const PLAYER_COLORS = ['#2fffb2', '#66a3ff'] as const;

const POSE_CONNECTIONS = [
  ['Left Shoulder', 'Right Shoulder'],
  ['Left Shoulder', 'Left Elbow'],
  ['Left Elbow', 'Left Wrist'],
  ['Right Shoulder', 'Right Elbow'],
  ['Right Elbow', 'Right Wrist'],
  ['Left Shoulder', 'Left Hip'],
  ['Right Shoulder', 'Right Hip'],
  ['Left Hip', 'Right Hip'],
  ['Left Hip', 'Left Knee'],
  ['Left Knee', 'Left Ankle'],
  ['Right Hip', 'Right Knee'],
  ['Right Knee', 'Right Ankle'],
  ['Nose', 'Left Eye'],
  ['Nose', 'Right Eye'],
  ['Left Eye', 'Left Ear'],
  ['Right Eye', 'Right Ear'],
] as const;

function clampBox(box: PersonDetection['box'], width: number, height: number): PersonDetection['box'] {
  return {
    xmin: Math.max(0, Math.min(width, box.xmin)),
    ymin: Math.max(0, Math.min(height, box.ymin)),
    xmax: Math.max(0, Math.min(width, box.xmax)),
    ymax: Math.max(0, Math.min(height, box.ymax)),
  };
}

function findKeypoint(keypoints: PoseKeypoint[], label: string): PoseKeypoint | undefined {
  return keypoints.find((keypoint) => keypoint.label === label);
}

export function getPersonPosition(detection: PersonDetection, frameWidth: number): number {
  if (!frameWidth) {
    return DEFAULT_PLAYER_POSITION;
  }

  const nose = detection.keypoints?.find((keypoint) => keypoint.label === 'Nose');
  const referenceX = nose && Number.isFinite(nose.x)
    ? nose.x
    : (detection.box.xmin + detection.box.xmax) / 2;

  return Math.max(0, Math.min(1, referenceX / frameWidth));
}

export function getPlayerPositions(
  detections: PersonDetection[],
  frameWidth: number,
  cameraMirrored: boolean
): number[] {
  if (!detections.length) {
    return [...DEFAULT_PLAYER_POSITIONS];
  }

  const detectedPositions = detections
    .slice(0, MAX_PLAYERS)
    .map((detection) => {
      const position = getPersonPosition(detection, frameWidth);
      return cameraMirrored ? 1 - position : position;
    })
    .sort((left, right) => left - right);

  return DEFAULT_PLAYER_POSITIONS.map((fallbackPosition, index) => detectedPositions[index] ?? fallbackPosition);
}

export function drawDetections(
  canvas: HTMLCanvasElement,
  items: PersonDetection[]
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(3, Math.round(canvas.width / 240));
  context.font = `${Math.max(15, Math.round(canvas.width / 48))}px Inter, system-ui, sans-serif`;
  context.textBaseline = 'top';

  items.forEach((item, index) => {
    const box = clampBox(item.box, canvas.width, canvas.height);
    const width = box.xmax - box.xmin;
    const height = box.ymax - box.ymin;
    const idLabel = item.id !== undefined ? `[ID ${item.id}] ` : '';
    const label = `${idLabel}person ${index + 1} ${formatPercent(item.score)}`;
    const labelWidth = context.measureText(label).width + 16;
    const labelHeight = 28;
    const labelY = box.ymin > labelHeight ? box.ymin - labelHeight : box.ymin;

    context.strokeStyle = PLAYER_COLORS[index % PLAYER_COLORS.length];
    context.fillStyle = index % PLAYER_COLORS.length === 0 ? 'rgba(47, 255, 178, 0.14)' : 'rgba(102, 163, 255, 0.14)';
    context.strokeRect(box.xmin, box.ymin, width, height);
    context.fillRect(box.xmin, box.ymin, width, height);

    context.fillStyle = '#07120f';
    context.fillRect(box.xmin, labelY, labelWidth, labelHeight);
    context.fillStyle = '#dfffee';
    context.fillText(label, box.xmin + 8, labelY + 5);

    if (!item.keypoints?.length) {
      return;
    }

    context.strokeStyle = '#ffcc4d';
    context.lineWidth = Math.max(2, Math.round(canvas.width / 360));
    POSE_CONNECTIONS.forEach(([fromLabel, toLabel]) => {
      const from = findKeypoint(item.keypoints ?? [], fromLabel);
      const to = findKeypoint(item.keypoints ?? [], toLabel);
      if (!from || !to) {
        return;
      }
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    });

    item.keypoints.forEach((keypoint) => {
      context.beginPath();
      context.fillStyle = PLAYER_COLORS[index % PLAYER_COLORS.length];
      context.arc(keypoint.x, keypoint.y, Math.max(4, Math.round(canvas.width / 180)), 0, Math.PI * 2);
      context.fill();
    });
  });
}
