import {
  loadYoloDetector,
  type Detector,
  type DetectorLoadOptions,
  type DetectorResult,
} from './aiDetector';

type WorkerLoadMessage = {
  type: 'load';
  requestId: number;
  modelId: DetectorLoadOptions['modelId'];
  runtime: DetectorLoadOptions['runtime'];
};

type WorkerDetectMessage = {
  type: 'detect';
  requestId: number;
  bitmap: ImageBitmap;
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

let detector: Detector | null = null;
let frameCanvas: OffscreenCanvas | null = null;
let frameContext: OffscreenCanvasRenderingContext2D | null = null;

function post(message: WorkerOutboundMessage) {
  self.postMessage(message);
}

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === 'dispose') {
    self.close();
    return;
  }

  try {
    if (message.type === 'load') {
      const result = await loadYoloDetector({
        modelId: message.modelId,
        runtime: message.runtime,
        onStatusChange: ({ message: statusMessage }) => {
          post({
            type: 'status',
            requestId: message.requestId,
            message: statusMessage,
          });
        },
      });

      detector = result.detector;
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

    const { bitmap } = message;
    if (!frameCanvas || frameCanvas.width !== bitmap.width || frameCanvas.height !== bitmap.height) {
      frameCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      frameContext = frameCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    }

    if (!frameContext || !frameCanvas) {
      throw new Error('Unable to create an OffscreenCanvas context for detection');
    }

    frameContext.drawImage(bitmap, 0, 0);
    bitmap.close();

    const result = await detector(frameCanvas, {
      threshold: message.threshold,
      percentage: false,
    });

    post({
      type: 'result',
      requestId: message.requestId,
      result,
    });
  } catch (cause) {
    if (message.type === 'detect') {
      message.bitmap.close();
    }

    post({
      type: 'error',
      requestId: message.requestId,
      message: getErrorMessage(cause),
    });
  }
};
