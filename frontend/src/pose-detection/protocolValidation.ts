import type {
  CameraFrameDescriptor,
  HandGestureDetection,
  ModelPrediction,
  ModelPredictionTimings,
  PersonDetection,
  PoseKeypoint,
} from './detectionSchema';

const MODEL_PREDICTION_PROTOCOL_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`model prediction ${key} must be a string`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`model prediction ${key} must be a finite number`);
  }
  return value;
}

function parseFrame(value: unknown): CameraFrameDescriptor {
  if (!isRecord(value)) {
    throw new Error('model prediction frame must be an object');
  }
  const width = readNumber(value, 'width');
  const height = readNumber(value, 'height');
  if (width <= 0 || height <= 0) {
    throw new Error('model prediction frame dimensions must be positive');
  }
  return {
    frameId: readString(value, 'frameId'),
    capturedAtMs: readNumber(value, 'capturedAtMs'),
    width,
    height,
  };
}

function parseKeypoint(value: unknown): PoseKeypoint {
  if (!isRecord(value)) {
    throw new Error('model prediction keypoint must be an object');
  }
  const z = value.z;
  if (z !== undefined && (typeof z !== 'number' || !Number.isFinite(z))) {
    throw new Error('model prediction keypoint z must be a finite number');
  }
  return {
    label: readString(value, 'label'),
    x: readNumber(value, 'x'),
    y: readNumber(value, 'y'),
    ...(z === undefined ? {} : { z }),
    score: readNumber(value, 'score'),
  };
}

function parseDetection(value: unknown): PersonDetection | HandGestureDetection {
  if (!isRecord(value) || !isRecord(value.box)) {
    throw new Error('model prediction detection and box must be objects');
  }
  const label = value.label;
  if (label !== 'person' && label !== 'hand') {
    throw new Error('model prediction detection label must be person or hand');
  }
  const id = value.id;
  if (id !== undefined && !Number.isInteger(id)) {
    throw new Error('model prediction detection id must be an integer');
  }
  const keypoints = value.keypoints;
  if (keypoints !== undefined && !Array.isArray(keypoints)) {
    throw new Error('model prediction detection keypoints must be an array');
  }
  const common = {
    ...(id === undefined ? {} : { id: id as number }),
    score: readNumber(value, 'score'),
    box: {
      xmin: readNumber(value.box, 'xmin'),
      ymin: readNumber(value.box, 'ymin'),
      xmax: readNumber(value.box, 'xmax'),
      ymax: readNumber(value.box, 'ymax'),
    },
    ...(keypoints === undefined ? {} : { keypoints: keypoints.map(parseKeypoint) }),
  };

  if (label === 'hand') {
    return { ...common, label, gesture: readString(value, 'gesture') };
  }
  return { ...common, label };
}

function parseTimings(value: unknown): ModelPredictionTimings {
  if (!isRecord(value)) {
    throw new Error('model prediction timings must be an object');
  }
  return {
    rawImageMs: readNumber(value, 'rawImageMs'),
    preprocessMs: readNumber(value, 'preprocessMs'),
    modelMs: readNumber(value, 'modelMs'),
    postprocessMs: readNumber(value, 'postprocessMs'),
    totalMs: readNumber(value, 'totalMs'),
  };
}

export function parseModelPrediction(value: unknown): ModelPrediction {
  if (!isRecord(value)) {
    throw new Error('model prediction must be an object');
  }
  if (value.protocolVersion !== MODEL_PREDICTION_PROTOCOL_VERSION) {
    throw new Error(`unsupported model prediction protocol version: ${String(value.protocolVersion)}`);
  }
  if (value.type !== 'model-prediction') {
    throw new Error('model prediction type is invalid');
  }
  if (!Array.isArray(value.detections)) {
    throw new Error('model prediction detections must be an array');
  }

  return {
    protocolVersion: MODEL_PREDICTION_PROTOCOL_VERSION,
    type: 'model-prediction',
    frame: parseFrame(value.frame),
    detections: value.detections.map(parseDetection),
    timings: parseTimings(value.timings),
  };
}
