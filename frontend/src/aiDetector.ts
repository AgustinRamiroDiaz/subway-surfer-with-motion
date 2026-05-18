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

export type DetectorLoadOptions = {
  modelId: YoloModelId;
  runtime: DetectorRuntimeId;
  quantization: DetectorQuantizationId;
  onStatusChange?: (state: DetectorLoadState) => void;
};

export type DetectorLoadResult = {
  detector: Detector;
  runtime: DetectorRuntime;
  fallbackReason?: string;
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
