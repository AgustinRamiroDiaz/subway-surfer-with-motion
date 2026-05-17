import type { ObjectDetectionOutput } from '@huggingface/transformers';

export const YOLO_MODEL_ID = 'onnx-community/yolo26n-ONNX';

export type Detector = (
  image: HTMLCanvasElement,
  options: { threshold: number; percentage: false }
) => Promise<ObjectDetectionOutput>;

export type Detection = ObjectDetectionOutput[number];

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

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

async function createDetector(device: 'webgpu' | 'wasm', options: DetectorLoadOptions) {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowLocalModels = false;

  const detector = await pipeline('object-detection', YOLO_MODEL_ID, {
    device,
    progress_callback: (progress: LoadProgress) => {
      if (progress.status === 'progress' && typeof progress.progress === 'number') {
        const fileName = progress.file?.split('/').pop() ?? 'model file';
        options.onStatusChange?.({
          message: `Loading ${fileName} ${Math.round(progress.progress)}%`,
        });
      } else if (progress.status) {
        options.onStatusChange?.({ message: progress.status });
      }
    },
  });

  return detector as Detector;
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

export async function loadYoloDetector(options: DetectorLoadOptions = {}): Promise<DetectorLoadResult> {
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
