import {
  type Detector,
  type DetectorLoadOptions,
  type DetectorLoadResult,
  type DetectorResult,
} from './aiDetector';
import { createFrameDescriptor, type TransferredCameraFrame } from './detectionSchema';

type PendingRequest =
  | {
      type: 'load';
      resolve: (value: DetectorLoadResult) => void;
      reject: (reason?: unknown) => void;
    }
  | {
      type: 'detect';
      resolve: (value: DetectorResult) => void;
      reject: (reason?: unknown) => void;
    };

type WorkerMessage =
  | {
      type: 'status';
      requestId: number;
      message: string;
    }
  | {
      type: 'loaded';
      requestId: number;
      runtime: 'WebGPU' | 'WASM';
      fallbackReason?: string;
    }
  | {
      type: 'result';
      requestId: number;
      result: DetectorResult;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    };

export type WorkerDetectorLoadResult = DetectorLoadResult & {
  dispose: () => void;
};

export async function loadYoloDetectorWorker(options: DetectorLoadOptions): Promise<WorkerDetectorLoadResult> {
  const worker = new Worker(new URL('./detector.worker.ts', import.meta.url));
  const pending = new Map<number, PendingRequest>();
  let requestId = 0;

  const nextRequestId = (): number => {
    requestId += 1;
    return requestId;
  };

  const dispose = (): void => {
    pending.forEach((request) => request.reject(new Error('Detector worker was disposed')));
    pending.clear();
    worker.postMessage({ type: 'dispose' });
    worker.terminate();
  };

  const detector: Detector = async (cameraFrame, detectorOptions) => {
    const id = nextRequestId();
    const bitmap = await createImageBitmap(cameraFrame.image);
    const frame: TransferredCameraFrame = {
      type: 'camera-frame',
      ...createFrameDescriptor(cameraFrame),
      bitmap,
    };

    return new Promise<DetectorResult>((resolve, reject) => {
      pending.set(id, {
        type: 'detect',
        resolve,
        reject,
      });

      worker.postMessage(
        {
          type: 'detect',
          requestId: id,
          frame,
          threshold: detectorOptions.threshold,
        },
        [bitmap]
      );
    });
  };

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    if (message.type === 'status') {
      options.onStatusChange?.({ message: message.message });
      return;
    }

    const request = pending.get(message.requestId);
    if (!request) {
      return;
    }

    pending.delete(message.requestId);

    if (message.type === 'error') {
      request.reject(new Error(message.message));
      return;
    }

    if (message.type === 'loaded' && request.type === 'load') {
      request.resolve({
        detector,
        runtime: message.runtime,
        fallbackReason: message.fallbackReason,
      });
      return;
    }

    if (message.type === 'result' && request.type === 'detect') {
      request.resolve(message.result);
      return;
    }

    request.reject(new Error(`Unexpected worker response: ${message.type}`));
  };

  worker.onerror = (event) => {
    pending.forEach((request) => request.reject(new Error(event.message)));
    pending.clear();
  };

  return new Promise<WorkerDetectorLoadResult>((resolve, reject) => {
    const id = nextRequestId();
    pending.set(id, {
      type: 'load',
      resolve: (result) => {
        resolve({
          ...result,
          dispose,
        });
      },
      reject,
    });

    worker.postMessage({
      type: 'load',
      requestId: id,
      modelId: options.modelId,
      runtime: options.runtime,
      quantization: options.quantization,
    });
  });
}
