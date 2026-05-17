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

type DetectorLoadOptions = {
  onStatusChange?: (state: DetectorLoadState) => void;
};

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

export async function loadYoloDetector(options: DetectorLoadOptions = {}) {
  const preferWebGpu = 'gpu' in navigator;

  if (!preferWebGpu) {
    const detector = await createDetector('wasm', options);
    return {
      detector,
      runtime: 'WASM',
    };
  }

  try {
    const detector = await createDetector('webgpu', options);
    return {
      detector,
      runtime: 'WebGPU',
    };
  } catch {
    options.onStatusChange?.({ message: 'WebGPU unavailable, falling back to WASM' });
    const detector = await createDetector('wasm', options);
    return {
      detector,
      runtime: 'WASM',
    };
  }
}
