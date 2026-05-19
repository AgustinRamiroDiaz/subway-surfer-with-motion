import {
  type Detector,
  type DetectorLoadOptions,
  type DetectorLoadResult,
  type DetectorResult,
} from './aiDetector';
import { createFrameDescriptor, type CameraFrameImage } from './detectionSchema';

const DEFAULT_POSE_TRACKER_WS_URL = 'ws://127.0.0.1:8765';
const DETECTOR_CONNECT_TIMEOUT_MS = 8_000;
const DETECTOR_REQUEST_TIMEOUT_MS = 10_000;

type PendingDetection = {
  resolve: (value: DetectorResult) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

type PythonTrackerMessage =
  | {
      type: 'result';
      requestId: number;
      result: DetectorResult;
    }
  | {
      type: 'error';
      requestId?: number;
      message: string;
    };

export type PythonWebSocketDetectorLoadResult = DetectorLoadResult & {
  dispose: () => void;
};

function getPoseTrackerUrl(): string {
  return import.meta.env.VITE_POSE_TRACKER_WS_URL ?? DEFAULT_POSE_TRACKER_WS_URL;
}

async function imageToBlob(image: CameraFrameImage): Promise<Blob> {
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      image.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Could not encode camera frame'));
      }, 'image/jpeg', 0.72);
    });
  }

  if (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas) {
    return image.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
  }

  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create canvas context for camera frame encoding');
    }
    context.drawImage(image, 0, 0);
    return imageToBlob(canvas);
  }

  throw new Error('Unsupported camera frame image type');
}

export async function loadPythonWebSocketDetector(
  options: DetectorLoadOptions
): Promise<PythonWebSocketDetectorLoadResult> {
  const url = getPoseTrackerUrl();
  options.onStatusChange?.({ message: `Connecting to ${url}` });

  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const pending = new Map<number, PendingDetection>();
  let requestId = 0;
  let disposed = false;

  const rejectPending = (reason: unknown): void => {
    pending.forEach((request) => {
      window.clearTimeout(request.timeoutId);
      request.reject(reason);
    });
    pending.clear();
  };

  const dispose = (): void => {
    disposed = true;
    rejectPending(new Error('Python WebSocket detector was disposed'));
    socket.close();
  };

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Could not connect to Python pose tracker at ${url}`));
      socket.close();
    }, DETECTOR_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      window.clearTimeout(timeoutId);
      options.onStatusChange?.({ message: `Connected to ${url}` });
      resolve();
    };

    socket.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Python pose tracker connection failed at ${url}`));
    };
  });

  socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
    let message: PythonTrackerMessage;
    try {
      const data = typeof event.data === 'string' 
        ? event.data 
        : new TextDecoder().decode(event.data);
      message = JSON.parse(data) as PythonTrackerMessage;
    } catch {
      rejectPending(new Error('Python pose tracker returned invalid JSON'));
      return;
    }

    if (message.type === 'error' && message.requestId === undefined) {
      rejectPending(new Error(message.message));
      return;
    }

    const responseRequestId = message.requestId;
    if (typeof responseRequestId !== 'number') {
      return;
    }

    const request = pending.get(responseRequestId);
    if (!request) {
      return;
    }

    pending.delete(responseRequestId);
    window.clearTimeout(request.timeoutId);

    if (message.type === 'error') {
      request.reject(new Error(message.message));
      return;
    }

    request.resolve(message.result);
  };

  socket.onerror = () => {
    rejectPending(new Error('Python pose tracker connection failed'));
  };

  socket.onclose = () => {
    if (!disposed) {
      rejectPending(new Error('Python pose tracker disconnected'));
    }
  };

  const detector: Detector = async (cameraFrame, detectorOptions) => {
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error('Python pose tracker is not connected');
    }

    requestId += 1;
    const id = requestId;
    const blob = await imageToBlob(cameraFrame.image);
    const arrayBuffer = await blob.arrayBuffer();

    return new Promise<DetectorResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error('Python pose tracker request timed out'));
      }, DETECTOR_REQUEST_TIMEOUT_MS);

      pending.set(id, {
        resolve,
        reject,
        timeoutId,
      });

      const metadata = JSON.stringify({
        requestId: id,
        frame: createFrameDescriptor(cameraFrame),
        threshold: detectorOptions.threshold,
      });
      const metadataBytes = new TextEncoder().encode(metadata);
      
      const packet = new Uint8Array(4 + metadataBytes.length + arrayBuffer.byteLength);
      const view = new DataView(packet.buffer);
      view.setUint32(0, metadataBytes.length, true);
      packet.set(metadataBytes, 4);
      packet.set(new Uint8Array(arrayBuffer), 4 + metadataBytes.length);

      socket.send(packet);
    });
  };

  return {
    detector,
    runtime: 'Python WebSocket',
    dispose,
  };
}
