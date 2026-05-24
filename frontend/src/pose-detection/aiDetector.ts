import {
  createFrameDescriptor,
  type CameraFrameImage,
} from './detectionSchema';
import {
  decodeMediaPipePoseResult,
  decodeYoloDetectionOutput,
  decodeYoloPoseOutput,
  type MediaPipePoseResult,
  type YoloModelOutput,
} from './detectorDecoders';
import {
  MEDIAPIPE_WASM_BASE_URL,
  getSelectedMediaPipeModel,
  getSelectedModel,
  type Detector,
  type DetectorLoadOptions,
  type DetectorLoadResult,
  type LoadProgress,
} from './detectorConfig';

export {
  DEFAULT_POSE_BACKEND_ID,
  DEFAULT_GESTURE_BACKEND_ID,
  DEFAULT_DETECTOR_QUANTIZATION_ID,
  DEFAULT_DETECTOR_RUNTIME_ID,
  DEFAULT_MEDIAPIPE_DELEGATE_ID,
  DEFAULT_MEDIAPIPE_MODEL_ID,
  DEFAULT_WASM_QUANTIZATION_ID,
  DEFAULT_WEBGPU_QUANTIZATION_ID,
  DEFAULT_YOLO_MODEL_ID,
  POSE_BACKENDS,
  GESTURE_BACKENDS,
  DETECTOR_QUANTIZATIONS,
  DETECTOR_RUNTIMES,
  MEDIAPIPE_DELEGATES,
  MEDIAPIPE_MODELS,
  YOLO_MODELS,
  getAvailableQuantizations,
  getDefaultQuantizationForRuntime,
  getQuantizationOption,
} from './detectorConfig';

export type {
  Detector,
  DetectorBackendId,
  DetectorImage,
  DetectorLoadOptions,
  DetectorLoadResult,
  DetectorLoadState,
  DetectorQuantizationId,
  DetectorResult,
  DetectorRuntimeId,
  DetectorTask,
  DetectorTimings,
  MediaPipeDelegateId,
  MediaPipeModelId,
  QuantizedModelFile,
  YoloModelId,
} from './detectorConfig';

export type {
  CameraFrame,
  ModelPrediction,
  ModelPredictionService,
  ModelPredictionTimings,
  PersonDetection,
  PoseKeypoint,
} from './detectionSchema';

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<unknown>;
  };
};

type YoloModel = {
  (inputs: unknown): Promise<YoloModelOutput>;
};

type YoloPoseProcessor = (image: unknown) => Promise<unknown>;

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

function isImageBitmap(image: CameraFrameImage): image is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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
