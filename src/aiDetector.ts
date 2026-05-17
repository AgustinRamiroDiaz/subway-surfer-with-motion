export const YOLO_MODELS = [
  {
    id: 'onnx-community/yolo26n-pose-ONNX',
    label: 'YOLO26n-pose',
    description: 'Nano pose',
  },
  {
    id: 'onnx-community/yolo26s-pose-ONNX',
    label: 'YOLO26s-pose',
    description: 'Small pose',
  },
] as const;

export type YoloModelId = (typeof YOLO_MODELS)[number]['id'];

export const DEFAULT_YOLO_MODEL_ID: YoloModelId = YOLO_MODELS[0].id;

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

export type Detector = (
  image: HTMLCanvasElement,
  options: { threshold: number; percentage: false }
) => Promise<PoseDetection[]>;

export type LoadProgress = {
  status?: string;
  file?: string;
  progress?: number;
};

export type DetectorLoadState = {
  message: string;
};

type DetectorRuntime = 'WebGPU' | 'WASM';

type DetectorLoadOptions = {
  modelId: YoloModelId;
  onStatusChange?: (state: DetectorLoadState) => void;
};

type DetectorLoadResult = {
  detector: Detector;
  runtime: DetectorRuntime;
  fallbackReason?: string;
};

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<unknown>;
  };
};

type YoloPoseModel = {
  (inputs: unknown): Promise<{
    logits: {
      dims: number[];
      data: ArrayLike<number>;
    };
  }>;
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

function decodeYoloPoseOutput(
  logits: { dims: number[]; data: ArrayLike<number> },
  image: HTMLCanvasElement,
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
      box: {
        xmin: Number(data[offset]) * image.width,
        ymin: Number(data[offset + 1]) * image.height,
        xmax: Number(data[offset + 2]) * image.width,
        ymax: Number(data[offset + 3]) * image.height,
      },
      keypoints,
    });
  }

  return detections.sort((a, b) => b.score - a.score);
}

async function createDetector(device: 'webgpu' | 'wasm', options: DetectorLoadOptions) {
  const { AutoImageProcessor, AutoModelForObjectDetection, RawImage, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;

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
      progress_callback,
    }) as Promise<YoloPoseModel>,
  ]);

  const poseDetector: Detector = async (image, detectorOptions) => {
    const rawImage = RawImage.fromCanvas(image);
    const inputs = await processor(rawImage);
    const output = await model(inputs);
    return decodeYoloPoseOutput(output.logits, image, detectorOptions.threshold);
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
