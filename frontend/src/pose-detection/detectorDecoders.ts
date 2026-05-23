import type { CameraFrameImage, PersonDetection, PoseDetection } from './detectionSchema';

export type YoloModelOutput = {
  logits: {
    dims: number[];
    data: ArrayLike<number>;
  };
  pred_boxes?: {
    dims: number[];
    data: ArrayLike<number>;
  };
};

const KEYPOINT_LABELS = [
  'Nose',
  'Left Eye',
  'Right Eye',
  'Left Ear',
  'Right Ear',
  'Left Shoulder',
  'Right Shoulder',
  'Left Elbow',
  'Right Elbow',
  'Left Wrist',
  'Right Wrist',
  'Left Hip',
  'Right Hip',
  'Left Knee',
  'Right Knee',
  'Left Ankle',
  'Right Ankle',
] as const;

type MediaPipeLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
};

export type MediaPipePoseResult = {
  landmarks?: MediaPipeLandmark[][];
};

const MEDIAPIPE_KEYPOINT_INDICES = [
  0,
  2,
  5,
  7,
  8,
  11,
  12,
  13,
  14,
  15,
  16,
  23,
  24,
  25,
  26,
  27,
  28,
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toImageBox(
  values: [number, number, number, number],
  image: CameraFrameImage,
  format: 'xyxy' | 'cxcywh'
): PersonDetection['box'] {
  const [a, b, c, d] = values;

  if (format === 'xyxy') {
    return {
      xmin: a * image.width,
      ymin: b * image.height,
      xmax: c * image.width,
      ymax: d * image.height,
    };
  }

  const halfWidth = c / 2;
  const halfHeight = d / 2;
  return {
    xmin: (a - halfWidth) * image.width,
    ymin: (b - halfHeight) * image.height,
    xmax: (a + halfWidth) * image.width,
    ymax: (b + halfHeight) * image.height,
  };
}

export function decodeYoloDetectionOutput(
  output: YoloModelOutput,
  image: CameraFrameImage,
  threshold: number
): PersonDetection[] {
  if (!output.pred_boxes) {
    throw new Error('Detection model did not return pred_boxes');
  }

  const [, candidateCount, classCount] = output.logits.dims;
  const logits = output.logits.data;
  const boxes = output.pred_boxes.data;
  const boxFeatureCount = output.pred_boxes.dims[output.pred_boxes.dims.length - 1] ?? 4;
  const detections: PersonDetection[] = [];

  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    const personScore = Number(logits[candidateIndex * classCount]);

    if (personScore < threshold) {
      continue;
    }

    const boxOffset = candidateIndex * boxFeatureCount;
    detections.push({
      label: 'person',
      score: personScore,
      box: toImageBox(
        [
          Number(boxes[boxOffset]),
          Number(boxes[boxOffset + 1]),
          Number(boxes[boxOffset + 2]),
          Number(boxes[boxOffset + 3]),
        ],
        image,
        'cxcywh'
      ),
    });
  }

  return detections.sort((a, b) => b.score - a.score);
}

export function decodeYoloPoseOutput(
  logits: { dims: number[]; data: ArrayLike<number> },
  image: CameraFrameImage,
  threshold: number
): PoseDetection[] {
  const [, candidateCount, featureCount] = logits.dims;
  const data = logits.data;
  const detections: PoseDetection[] = [];

  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    const offset = candidateIndex * featureCount;
    const score = Number(data[offset + 4]);
    const classId = Math.round(Number(data[offset + 5]));

    if (score < threshold || classId !== 0) {
      continue;
    }

    const keypoints = KEYPOINT_LABELS.map((label, keypointIndex) => {
      const keypointOffset = offset + 6 + keypointIndex * 3;
      return {
        label,
        x: Number(data[keypointOffset]) * image.width,
        y: Number(data[keypointOffset + 1]) * image.height,
        score: Number(data[keypointOffset + 2]),
      };
    });

    detections.push({
      label: 'person',
      score,
      box: toImageBox(
        [
          Number(data[offset]),
          Number(data[offset + 1]),
          Number(data[offset + 2]),
          Number(data[offset + 3]),
        ],
        image,
        'xyxy'
      ),
      keypoints,
    });
  }

  return detections.sort((a, b) => b.score - a.score);
}

function getMediaPipeLandmarkScore(landmark: MediaPipeLandmark | undefined): number {
  if (!landmark) {
    return 0;
  }

  if (typeof landmark.visibility === 'number') {
    return landmark.visibility;
  }

  if (typeof landmark.presence === 'number') {
    return landmark.presence;
  }

  return 1;
}

function boxFromMediaPipeKeypoints(
  keypoints: PoseDetection['keypoints'],
  image: CameraFrameImage
): PoseDetection['box'] {
  const visibleKeypoints = keypoints.filter((keypoint) => keypoint.score > 0);
  const sourceKeypoints = visibleKeypoints.length ? visibleKeypoints : keypoints;
  const xs = sourceKeypoints.map((keypoint) => keypoint.x);
  const ys = sourceKeypoints.map((keypoint) => keypoint.y);
  const xmin = Math.min(...xs);
  const ymin = Math.min(...ys);
  const xmax = Math.max(...xs);
  const ymax = Math.max(...ys);
  const padding = Math.max(8, Math.max(xmax - xmin, ymax - ymin) * 0.12);

  return {
    xmin: clamp(xmin - padding, 0, image.width),
    ymin: clamp(ymin - padding, 0, image.height),
    xmax: clamp(xmax + padding, 0, image.width),
    ymax: clamp(ymax + padding, 0, image.height),
  };
}

export function decodeMediaPipePoseResult(
  result: MediaPipePoseResult,
  image: CameraFrameImage
): PoseDetection[] {
  const landmarksByPose = result.landmarks ?? [];
  const detections: PoseDetection[] = [];

  landmarksByPose.forEach((landmarks) => {
    const keypoints = KEYPOINT_LABELS.map((label, keypointIndex) => {
      const landmark = landmarks[MEDIAPIPE_KEYPOINT_INDICES[keypointIndex]];
      const score = getMediaPipeLandmarkScore(landmark);
      return {
        label,
        x: clamp((landmark?.x ?? 0) * image.width, 0, image.width),
        y: clamp((landmark?.y ?? 0) * image.height, 0, image.height),
        ...(typeof landmark?.z === 'number' ? { z: landmark.z * image.width } : {}),
        score,
      };
    });
    const score = keypoints.reduce((sum, keypoint) => sum + keypoint.score, 0) / keypoints.length;

    detections.push({
      label: 'person',
      score,
      box: boxFromMediaPipeKeypoints(keypoints, image),
      keypoints,
    });
  });

  return detections.sort((a, b) => b.score - a.score);
}
