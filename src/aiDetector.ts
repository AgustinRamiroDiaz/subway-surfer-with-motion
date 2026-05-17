export const YOLO_MODELS = [
  {
    id: 'onnx-community/yolo26n-ONNX',
    label: 'YOLO26n',
    description: 'Nano detection',
    task: 'detection',
  },
  {
    id: 'onnx-community/yolo26s-ONNX',
    label: 'YOLO26s',
    description: 'Small detection',
    task: 'detection',
  },
  {
    id: 'onnx-community/yolo26n-pose-ONNX',
    label: 'YOLO26n-pose',
    description: 'Nano pose',
    task: 'pose',
  },
  {
    id: 'onnx-community/yolo26s-pose-ONNX',
    label: 'YOLO26s-pose',
    description: 'Small pose',
    task: 'pose',
  },
] as const;

export type YoloModelId = (typeof YOLO_MODELS)[number]['id'];

export const DEFAULT_YOLO_MODEL_ID: YoloModelId = 'onnx-community/yolo26n-pose-ONNX';

export const DETECTOR_RUNTIMES = [
  {
    id: 'webgpu',
    label: 'WebGPU',
    description: 'fp16',
  },
  {
    id: 'wasm',
    label: 'WASM',
    description: 'q8',
  },
] as const;

export type DetectorRuntimeId = (typeof DETECTOR_RUNTIMES)[number]['id'];

export const DEFAULT_DETECTOR_RUNTIME_ID: DetectorRuntimeId = 'webgpu';

export type PoseKeypoint = {
  label: string;
  x: number;
  y: number;
  score: number;
};

export type PoseDetection = {
  label: 'person';
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  keypoints: PoseKeypoint[];
};

export type PersonDetection = Omit<PoseDetection, 'keypoints'> & {
  keypoints?: PoseKeypoint[];
};

export type DetectorTimings = {
  rawImageMs: number;
  preprocessMs: number;
  modelMs: number;
  postprocessMs: number;
  totalMs: number;
};

export type DetectorResult = {
  detections: PersonDetection[];
  timings: DetectorTimings;
};

export type DetectorImage = HTMLCanvasElement | OffscreenCanvas;

export type Detector = (
  image: DetectorImage,
  options: { threshold: number; percentage: false }
) => Promise<DetectorResult>;

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
  (inputs: unknown): Promise<{
  } & YoloModelOutput>;
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

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function getSelectedModel(modelId: YoloModelId) {
  return YOLO_MODELS.find((model) => model.id === modelId) ?? YOLO_MODELS[0];
}

function toImageBox(
  values: [number, number, number, number],
  image: DetectorImage,
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
  image: DetectorImage,
  threshold: number
) {
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
  image: DetectorImage,
  threshold: number
) {
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

async function createDetector(device: 'webgpu' | 'wasm', options: DetectorLoadOptions) {
  const { AutoImageProcessor, AutoModelForObjectDetection, RawImage, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  const dtype = device === 'webgpu' ? 'fp16' : 'q8';
  const selectedModel = getSelectedModel(options.modelId);

  const progress_callback = (progress: LoadProgress) => {
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

  const poseDetector: Detector = async (image, detectorOptions) => {
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

async function getWebGpuFallbackReason() {
  const nav = navigator as NavigatorWithGpu;

  if (!nav.gpu) {
    return 'navigator.gpu is not available in this browser';
  }

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      return 'no WebGPU adapter was returned for this device/browser';
    }
  } catch (cause) {
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
  } catch (cause) {
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
