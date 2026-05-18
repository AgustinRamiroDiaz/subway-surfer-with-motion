import {
  loadMediaPipePoseDetector,
  loadYoloDetector,
  type Detector,
  type DetectorLoadOptions,
  type DetectorLoadResult,
  type DetectorResult,
} from './aiDetector';
import { createCameraFrame, type TransferredCameraFrame } from './detectionSchema';

type WorkerLoadMessage = {
  type: 'load';
  requestId: number;
  backend: DetectorLoadOptions['backend'];
  modelId: DetectorLoadOptions['modelId'];
  runtime: DetectorLoadOptions['runtime'];
  quantization: DetectorLoadOptions['quantization'];
  mediaPipeModelId: DetectorLoadOptions['mediaPipeModelId'];
  mediaPipeDelegate: DetectorLoadOptions['mediaPipeDelegate'];
};

type WorkerDetectMessage = {
  type: 'detect';
  requestId: number;
  frame: TransferredCameraFrame;
  threshold: number;
};

type WorkerDisposeMessage = {
  type: 'dispose';
};

type WorkerInboundMessage = WorkerLoadMessage | WorkerDetectMessage | WorkerDisposeMessage;

type WorkerOutboundMessage =
  | {
      type: 'status';
      requestId: number;
      message: string;
    }
  | {
      type: 'loaded';
      requestId: number;
      runtime: DetectorLoadResult['runtime'];
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

let detector: Detector | null = null;
let disposeDetector: (() => void) | null = null;
let frameCanvas: OffscreenCanvas | null = null;
let frameContext: OffscreenCanvasRenderingContext2D | null = null;

function post(message: WorkerOutboundMessage): void {
  self.postMessage(message);
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>): Promise<void> => {
  const message = event.data;

  if (message.type === 'dispose') {
    disposeDetector?.();
    self.close();
    return;
  }

  try {
    if (message.type === 'load') {
      const loadOptions: DetectorLoadOptions = {
        backend: message.backend,
        modelId: message.modelId,
        runtime: message.runtime,
        quantization: message.quantization,
        mediaPipeModelId: message.mediaPipeModelId,
        mediaPipeDelegate: message.mediaPipeDelegate,
        onStatusChange: ({ message: statusMessage }) => {
          post({
            type: 'status',
            requestId: message.requestId,
            message: statusMessage,
          });
        },
      };
      const result: DetectorLoadResult =
        message.backend === 'mediapipe'
          ? await loadMediaPipePoseDetector(loadOptions)
          : await loadYoloDetector(loadOptions);

      disposeDetector?.();
      detector = result.detector;
      disposeDetector = result.dispose ?? null;
      post({
        type: 'loaded',
        requestId: message.requestId,
        runtime: result.runtime,
        fallbackReason: result.fallbackReason,
      });
      return;
    }

    if (!detector) {
      throw new Error('Detector worker received a frame before the model was loaded');
    }

    const { bitmap } = message.frame;
    if (!frameCanvas || frameCanvas.width !== bitmap.width || frameCanvas.height !== bitmap.height) {
      frameCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      frameContext = frameCanvas.getContext('2d');
    }

    if (!frameContext || !frameCanvas) {
      throw new Error('Unable to create an OffscreenCanvas context for detection');
    }

    frameContext.drawImage(bitmap, 0, 0);
    bitmap.close();

    const cameraFrame = createCameraFrame(
      frameCanvas,
      message.frame.frameId,
      message.frame.capturedAtMs
    );
    const result = await detector(cameraFrame, {
      threshold: message.threshold,
      percentage: false,
    });

    post({
      type: 'result',
      requestId: message.requestId,
      result,
    });
  } catch (cause: unknown) {
    if (message.type === 'detect') {
      message.frame.bitmap.close();
    }

    post({
      type: 'error',
      requestId: message.requestId,
      message: getErrorMessage(cause),
    });
  }
};
