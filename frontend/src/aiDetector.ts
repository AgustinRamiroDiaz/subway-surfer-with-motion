import {
  createFrameDescriptor,
  type CameraFrameImage,
  type ModelPrediction,
  type ModelPredictionService,
  type ModelPredictionTimings,
  type PersonDetection,
  type PoseDetection,
} from './detectionSchema';

export const DETECTOR_QUANTIZATIONS = [
  {
    id: 'fp16',
    label: 'FP16',
    description: 'WebGPU half precision',
  },
  {
    id: 'uint8',
    label: 'UINT8',
    description: 'Fast WASM quantized',
  },
  {
    id: 'int8',
    label: 'INT8',
    description: 'Signed 8-bit quantized',
  },
  {
    id: 'q8',
    label: 'Q8',
    description: 'Legacy 8-bit quantized',
  },
  {
    id: 'q4f16',
    label: 'Q4F16',
    description: '4-bit weights with FP16 tensors',
  },
  {
    id: 'q4',
    label: 'Q4',
    description: '4-bit quantized',
  },
  {
    id: 'bnb4',
    label: 'BNB4',
    description: 'BitsAndBytes 4-bit',
  },
] as const;

export type DetectorQuantizationId = (typeof DETECTOR_QUANTIZATIONS)[number]['id'];

export type QuantizedModelFile = {
  dtype: DetectorQuantizationId;
  sizeMb: number;
};

export const DETECTOR_BACKENDS = [
  {
    id: 'yolo',
    label: 'YOLO',
    description: 'Object and pose detection',
  },
  {
    id: 'mediapipe',
    label: 'MediaPipe',
    description: 'Pose landmark tracking',
  },
  {
    id: 'python-webrtc',
    label: 'Python WebRTC',
    description: 'Remote low-latency pose tracking',
  },
] as const;

export type DetectorBackendId = (typeof DETECTOR_BACKENDS)[number]['id'];

export const DEFAULT_DETECTOR_BACKEND_ID: DetectorBackendId = 'mediapipe';

const NANO_DETECTION_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 4.98 },
  { dtype: 'uint8', sizeMb: 2.85 },
  { dtype: 'int8', sizeMb: 2.85 },
  { dtype: 'q8', sizeMb: 2.85 },
  { dtype: 'q4f16', sizeMb: 4.98 },
  { dtype: 'q4', sizeMb: 9.89 },
  { dtype: 'bnb4', sizeMb: 9.89 },
] as const satisfies readonly QuantizedModelFile[];

const SMALL_DETECTION_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 19.2 },
  { dtype: 'uint8', sizeMb: 9.96 },
  { dtype: 'int8', sizeMb: 9.96 },
  { dtype: 'q8', sizeMb: 9.96 },
  { dtype: 'q4f16', sizeMb: 19.2 },
  { dtype: 'q4', sizeMb: 38.2 },
  { dtype: 'bnb4', sizeMb: 38.2 },
] as const satisfies readonly QuantizedModelFile[];

const NANO_POSE_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 6.07 },
  { dtype: 'uint8', sizeMb: 3.51 },
  { dtype: 'int8', sizeMb: 3.51 },
  { dtype: 'q8', sizeMb: 3.51 },
  { dtype: 'q4f16', sizeMb: 6.07 },
  { dtype: 'q4', sizeMb: 12.1 },
  { dtype: 'bnb4', sizeMb: 12.1 },
] as const satisfies readonly QuantizedModelFile[];

const SMALL_POSE_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 20.9 },
  { dtype: 'uint8', sizeMb: 11 },
  { dtype: 'int8', sizeMb: 11 },
  { dtype: 'q8', sizeMb: 11 },
  { dtype: 'q4f16', sizeMb: 20.9 },
  { dtype: 'q4', sizeMb: 41.8 },
  { dtype: 'bnb4', sizeMb: 41.8 },
] as const satisfies readonly QuantizedModelFile[];

export const YOLO_MODELS = [
  {
    id: 'onnx-community/yolo26n-ONNX',
    label: 'YOLO26n',
    description: 'Nano detection',
    task: 'detection',
    quantizations: NANO_DETECTION_QUANTIZATIONS,
  },
  {
    id: 'onnx-community/yolo26s-ONNX',
    label: 'YOLO26s',
    description: 'Small detection',
    task: 'detection',
    quantizations: SMALL_DETECTION_QUANTIZATIONS,
  },
  {
    id: 'onnx-community/yolo26n-pose-ONNX',
    label: 'YOLO26n-pose',
    description: 'Nano pose',
    task: 'pose',
    quantizations: NANO_POSE_QUANTIZATIONS,
  },
  {
    id: 'onnx-community/yolo26s-pose-ONNX',
    label: 'YOLO26s-pose',
    description: 'Small pose',
    task: 'pose',
    quantizations: SMALL_POSE_QUANTIZATIONS,
  },
] as const;

export type YoloModelId = (typeof YOLO_MODELS)[number]['id'];

export const DEFAULT_YOLO_MODEL_ID: YoloModelId = 'onnx-community/yolo26n-pose-ONNX';
export const DEFAULT_WEBGPU_QUANTIZATION_ID: DetectorQuantizationId = 'fp16';
export const DEFAULT_WASM_QUANTIZATION_ID: DetectorQuantizationId = 'uint8';
export const DEFAULT_DETECTOR_QUANTIZATION_ID: DetectorQuantizationId = DEFAULT_WEBGPU_QUANTIZATION_ID;

export const DETECTOR_RUNTIMES = [
  {
    id: 'webgpu',
    label: 'WebGPU',
    description: 'GPU accelerated',
  },
  {
    id: 'wasm',
    label: 'WASM',
    description: 'CPU fallback',
  },
] as const;

export type DetectorRuntimeId = (typeof DETECTOR_RUNTIMES)[number]['id'];

export const DEFAULT_DETECTOR_RUNTIME_ID: DetectorRuntimeId = 'webgpu';

export const MEDIAPIPE_MODELS = [
  {
    id: 'lite',
    label: 'Lite',
    description: 'Fastest pose tracking',
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    id: 'full',
    label: 'Full',
    description: 'Balanced pose tracking',
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
  {
    id: 'heavy',
    label: 'Heavy',
    description: 'Highest accuracy',
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  },
] as const;

export type MediaPipeModelId = (typeof MEDIAPIPE_MODELS)[number]['id'];

export const DEFAULT_MEDIAPIPE_MODEL_ID: MediaPipeModelId = 'lite';

export const MEDIAPIPE_DELEGATES = [
  {
    id: 'GPU',
    label: 'GPU',
    description: 'Accelerated delegate',
  },
  {
    id: 'CPU',
    label: 'CPU',
    description: 'Compatibility delegate',
  },
] as const;

export type MediaPipeDelegateId = (typeof MEDIAPIPE_DELEGATES)[number]['id'];

export const DEFAULT_MEDIAPIPE_DELEGATE_ID: MediaPipeDelegateId = 'GPU';
const MEDIAPIPE_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

export type {
  CameraFrame,
  ModelPrediction,
  ModelPredictionService,
  ModelPredictionTimings,
  PersonDetection,
  PoseKeypoint,
} from './detectionSchema';

export type DetectorImage = CameraFrameImage;
export type DetectorTimings = ModelPredictionTimings;
export type DetectorResult = ModelPrediction;
export type Detector = ModelPredictionService;

export type LoadProgress = {
  status?: string;
  file?: string;
  progress?: number;
};

export type DetectorLoadState = {
  message: string;
};

type DetectorRuntime = 'WebGPU' | 'WASM';
type MediaPipeRuntime = 'MediaPipe GPU' | 'MediaPipe CPU';
type PythonWebRtcRuntime = 'Python WebRTC';

export type DetectorLoadOptions = {
  backend: DetectorBackendId;
  modelId: YoloModelId;
  runtime: DetectorRuntimeId;
  quantization: DetectorQuantizationId;
  mediaPipeModelId: MediaPipeModelId;
  mediaPipeDelegate: MediaPipeDelegateId;
  playerCount: number;
  threshold?: number;
  stream?: MediaStream;
  onStatusChange?: (state: DetectorLoadState) => void;
  onResult?: (result: DetectorResult) => void;
  onError?: (error: Error) => void;
};

export type DetectorLoadResult = {
  detector: Detector;
  runtime: DetectorRuntime | MediaPipeRuntime | PythonWebRtcRuntime;
  mode?: 'pull' | 'stream';
  fallbackReason?: string;
  dispose?: () => void;
};

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<unknown>;
  };
};

type YoloModelOutput = {
  logits: {
    dims: number[];
    data: ArrayLike<number>;
  };
  pred_boxes?: {
    dims: number[];
    data: ArrayLike<number>;
  };
};

type YoloModel = {
  (inputs: unknown): Promise<YoloModelOutput>;
};

type YoloPoseProcessor = (image: unknown) => Promise<unknown>;

function isImageBitmap(image: CameraFrameImage): image is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
}

type MediaPipeLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
};

type MediaPipePoseResult = {
  landmarks?: MediaPipeLandmark[][];
};

type MediaPipePoseLandmarker = {
  detect?: (image: CameraFrameImage) => MediaPipePoseResult;
  detectForVideo: (image: CameraFrameImage, timestampMs: number) => MediaPipePoseResult;
  setOptions?: (options: {
    minPoseDetectionConfidence?: number;
    minPosePresenceConfidence?: number;
    minTrackingConfidence?: number;
    numPoses?: number;
    outputSegmentationMasks?: boolean;
    runningMode?: 'IMAGE' | 'VIDEO';
  }) => Promise<void>;
  close?: () => void;
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

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function getSelectedModel(modelId: YoloModelId): (typeof YOLO_MODELS)[number] {
  return YOLO_MODELS.find((model) => model.id === modelId) ?? YOLO_MODELS[0];
}

function getSelectedMediaPipeModel(modelId: MediaPipeModelId): (typeof MEDIAPIPE_MODELS)[number] {
  return MEDIAPIPE_MODELS.find((model) => model.id === modelId) ?? MEDIAPIPE_MODELS[0];
}

export function getDefaultQuantizationForRuntime(runtime: DetectorRuntimeId): DetectorQuantizationId {
  return runtime === 'webgpu' ? DEFAULT_WEBGPU_QUANTIZATION_ID : DEFAULT_WASM_QUANTIZATION_ID;
}

export function getQuantizationOption(dtype: DetectorQuantizationId): (typeof DETECTOR_QUANTIZATIONS)[number] {
  return DETECTOR_QUANTIZATIONS.find((option) => option.id === dtype) ?? DETECTOR_QUANTIZATIONS[0];
}

export function getAvailableQuantizations(modelId: YoloModelId): readonly QuantizedModelFile[] {
  return getSelectedModel(modelId).quantizations;
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

function decodeYoloDetectionOutput(
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

function decodeYoloPoseOutput(
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

function decodeMediaPipePoseResult(
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

async function createDetector(device: 'webgpu' | 'wasm', options: DetectorLoadOptions): Promise<Detector> {
  const { AutoImageProcessor, AutoModelForObjectDetection, RawImage, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  const dtype = options.quantization;
  const selectedModel = getSelectedModel(options.modelId);

  const progress_callback = (progress: LoadProgress): void => {
    if (progress.status === 'progress' && typeof progress.progress === 'number') {
      const fileName = progress.file?.split('/').pop() ?? 'model file';
      options.onStatusChange?.({
        message: `Loading ${fileName} ${Math.round(progress.progress)}%`,
      });
    } else if (progress.status) {
      options.onStatusChange?.({ message: progress.status });
    }
  };

  const [processor, model] = await Promise.all([
    AutoImageProcessor.from_pretrained(options.modelId, {
      progress_callback,
    }) as Promise<YoloPoseProcessor>,
    AutoModelForObjectDetection.from_pretrained(options.modelId, {
      device,
      dtype,
      progress_callback,
    }) as Promise<YoloModel>,
  ]);

  const poseDetector: Detector = async (frame, detectorOptions) => {
    const image = frame.image;
    if (isImageBitmap(image)) {
      throw new Error('YOLO detector requires a canvas-backed camera frame');
    }

    const startedAt = performance.now();
    const rawImage = RawImage.fromCanvas(image);
    const rawImageDoneAt = performance.now();
    const inputs = await processor(rawImage);
    const preprocessDoneAt = performance.now();
    const output = await model(inputs);
    const modelDoneAt = performance.now();
    const detections =
      selectedModel.task === 'pose'
        ? decodeYoloPoseOutput(output.logits, image, detectorOptions.threshold)
        : decodeYoloDetectionOutput(output, image, detectorOptions.threshold);
    const postprocessDoneAt = performance.now();

    return {
      type: 'model-prediction',
      frame: createFrameDescriptor(frame),
      detections,
      timings: {
        rawImageMs: rawImageDoneAt - startedAt,
        preprocessMs: preprocessDoneAt - rawImageDoneAt,
        modelMs: modelDoneAt - preprocessDoneAt,
        postprocessMs: postprocessDoneAt - modelDoneAt,
        totalMs: postprocessDoneAt - startedAt,
      },
    };
  };

  return poseDetector;
}

export async function loadMediaPipePoseDetector(options: DetectorLoadOptions): Promise<DetectorLoadResult> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const selectedModel = getSelectedMediaPipeModel(options.mediaPipeModelId);
  const startedAt = performance.now();

  options.onStatusChange?.({ message: 'Loading MediaPipe runtime' });
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE_URL, true);

  options.onStatusChange?.({ message: `Loading MediaPipe ${selectedModel.label}` });
  const poseLandmarker = (await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: selectedModel.modelAssetPath,
      delegate: options.mediaPipeDelegate,
    },
    runningMode: 'VIDEO',
    numPoses: options.playerCount,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  })) as MediaPipePoseLandmarker;
  const loadDoneAt = performance.now();

  options.onStatusChange?.({
    message: `Loaded MediaPipe ${selectedModel.label} in ${Math.round(loadDoneAt - startedAt)} ms`,
  });

  let appliedThreshold = 0.5;
  const detector: Detector = async (frame, detectorOptions) => {
    const startedAt = performance.now();
    if (detectorOptions.threshold !== appliedThreshold) {
      await poseLandmarker.setOptions?.({
        minPoseDetectionConfidence: detectorOptions.threshold,
        minPosePresenceConfidence: detectorOptions.threshold,
        minTrackingConfidence: detectorOptions.threshold,
        numPoses: options.playerCount,
        outputSegmentationMasks: false,
        runningMode: 'VIDEO',
      });
      appliedThreshold = detectorOptions.threshold;
    }
    const preprocessDoneAt = performance.now();
    const result = poseLandmarker.detectForVideo(frame.image, frame.capturedAtMs);
    const modelDoneAt = performance.now();
    const detections = decodeMediaPipePoseResult(result, frame.image);
    const postprocessDoneAt = performance.now();

    return {
      type: 'model-prediction',
      frame: createFrameDescriptor(frame),
      detections,
      timings: {
        rawImageMs: 0,
        preprocessMs: preprocessDoneAt - startedAt,
        modelMs: modelDoneAt - preprocessDoneAt,
        postprocessMs: postprocessDoneAt - modelDoneAt,
        totalMs: postprocessDoneAt - startedAt,
      },
    };
  };

  return {
    detector,
    runtime: options.mediaPipeDelegate === 'GPU' ? 'MediaPipe GPU' : 'MediaPipe CPU',
    dispose: () => poseLandmarker.close?.(),
  };
}

async function getWebGpuFallbackReason(): Promise<string | null> {
  const nav = navigator as NavigatorWithGpu;

  if (!nav.gpu) {
    return 'navigator.gpu is not available in this browser';
  }

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return 'no WebGPU adapter was returned for this device/browser';
    }
  } catch (cause: unknown) {
    return `requestAdapter failed: ${getErrorMessage(cause)}`;
  }

  return null;
}

export async function loadYoloDetector(options: DetectorLoadOptions): Promise<DetectorLoadResult> {
  if (options.runtime === 'wasm') {
    options.onStatusChange?.({ message: 'Loading model on WASM' });
    const detector = await createDetector('wasm', options);
    return {
      detector,
      runtime: 'WASM',
    };
  }

  const fallbackReason = await getWebGpuFallbackReason();

  if (fallbackReason) {
    options.onStatusChange?.({ message: `WebGPU unavailable: ${fallbackReason}` });
    const detector = await createDetector('wasm', options);
    return {
      detector,
      runtime: 'WASM',
      fallbackReason,
    };
  }

  try {
    options.onStatusChange?.({ message: 'Loading model on WebGPU' });
    const detector = await createDetector('webgpu', options);
    return {
      detector,
      runtime: 'WebGPU',
    };
  } catch (cause: unknown) {
    const reason = `WebGPU pipeline failed: ${getErrorMessage(cause)}`;
    console.warn(reason);
    options.onStatusChange?.({ message: `${reason}; falling back to WASM` });
    const detector = await createDetector('wasm', options);
    return {
      detector,
      runtime: 'WASM',
      fallbackReason: reason,
    };
  }
}
