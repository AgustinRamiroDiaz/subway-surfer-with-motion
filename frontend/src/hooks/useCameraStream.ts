import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CameraFacingMode } from '../app/appPreferences';

export type CameraDeviceOption = {
  deviceId: string;
  label: string;
};

export type StartCameraOptions = {
  facingMode: CameraFacingMode;
  deviceId: string | null;
  devCameraMultiplierEnabled: boolean;
};

type CameraStreamControls = {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  streamRef: RefObject<MediaStream | null>;
  cameraEnabled: boolean;
  cameraDevices: CameraDeviceOption[];
  syncCanvasSize: () => void;
  clearOverlay: () => void;
  refreshCameraDevices: () => Promise<void>;
  startCamera: (options: StartCameraOptions) => Promise<MediaStream>;
  stopCamera: () => void;
};

function getCameraAccessUnavailableMessage(): string {
  if (!window.isSecureContext) {
    return 'Camera access requires HTTPS on phones. Use localhost on this device or serve the app over HTTPS.';
  }

  return 'This browser does not expose camera access through navigator.mediaDevices.';
}

type StreamPreprocessor = {
  stream: MediaStream;
  cleanup: () => void;
};

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth && video.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleLoadedMetadata = (): void => {
      cleanup();
      resolve();
    };
    const handleError = (): void => {
      cleanup();
      reject(new Error('Unable to read camera metadata for the developer camera multiplier.'));
    };
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function createSideBySideStream(sourceStream: MediaStream): Promise<StreamPreprocessor> {
  const sourceVideo = document.createElement('video');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context || !canvas.captureStream) {
    throw new Error('This browser cannot create a canvas-backed camera stream.');
  }

  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.srcObject = sourceStream;
  try {
    await sourceVideo.play();
    await waitForVideoMetadata(sourceVideo);
  } catch (cause: unknown) {
    sourceStream.getTracks().forEach((track) => track.stop());
    sourceVideo.srcObject = null;
    throw cause;
  }

  canvas.width = sourceVideo.videoWidth * 2;
  canvas.height = sourceVideo.videoHeight;

  let animationFrameId: number | null = null;
  let videoFrameCallbackId: number | null = null;
  let stopped = false;

  const drawFrame = (): void => {
    if (stopped || !sourceVideo.videoWidth || !sourceVideo.videoHeight) {
      return;
    }

    context.drawImage(sourceVideo, 0, 0, sourceVideo.videoWidth, sourceVideo.videoHeight);
    context.drawImage(sourceVideo, sourceVideo.videoWidth, 0, sourceVideo.videoWidth, sourceVideo.videoHeight);
  };

  const scheduleDraw = (): void => {
    if (stopped) {
      return;
    }

    if ('requestVideoFrameCallback' in sourceVideo) {
      videoFrameCallbackId = sourceVideo.requestVideoFrameCallback(() => {
        videoFrameCallbackId = null;
        drawFrame();
        scheduleDraw();
      });
      return;
    }

    animationFrameId = window.requestAnimationFrame(() => {
      animationFrameId = null;
      drawFrame();
      scheduleDraw();
    });
  };

  drawFrame();
  scheduleDraw();

  const outputStream = canvas.captureStream(30);

  return {
    stream: outputStream,
    cleanup: () => {
      stopped = true;
      if (videoFrameCallbackId !== null) {
        sourceVideo.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      outputStream.getTracks().forEach((track) => track.stop());
      sourceStream.getTracks().forEach((track) => track.stop());
      sourceVideo.pause();
      sourceVideo.srcObject = null;
    },
  };
}

export function useCameraStream(): CameraStreamControls {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);

  const syncCanvasSize = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const frame = frameRef.current;
    if (!video || !overlay || !frame || !video.videoWidth || !video.videoHeight) {
      return;
    }

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
  }, []);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraDevices([]);
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices
      .filter((device) => device.kind === 'videoinput' && device.deviceId)
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
    setCameraDevices(videoDevices);
  }, []);

  const refreshCameraDevicesWithoutBlocking = useCallback(() => {
    void refreshCameraDevices().catch(() => {
      setCameraDevices([]);
    });
  }, [refreshCameraDevices]);

  const stopActiveStream = useCallback(() => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async ({ facingMode, deviceId, devCameraMultiplierEnabled }: StartCameraOptions) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(getCameraAccessUnavailableMessage());
    }

    stopActiveStream();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode }),
        width: { ideal: 4096 },
        height: { ideal: 2160 },
      },
      audio: false,
    });

    let activeStream: StreamPreprocessor;
    try {
      activeStream = devCameraMultiplierEnabled
        ? await createSideBySideStream(stream)
        : {
            stream,
            cleanup: () => {
              stream.getTracks().forEach((track) => track.stop());
            },
          };
  } catch (cause: unknown) {
      stream.getTracks().forEach((track) => track.stop());
      throw cause;
    }

    streamRef.current = activeStream.stream;
    streamCleanupRef.current = activeStream.cleanup;
    if (videoRef.current) {
      videoRef.current.srcObject = activeStream.stream;
      await videoRef.current.play();
    }
    setCameraEnabled(true);
    refreshCameraDevicesWithoutBlocking();
    return activeStream.stream;
  }, [refreshCameraDevicesWithoutBlocking, stopActiveStream]);

  const stopCamera = useCallback(() => {
    stopActiveStream();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    clearOverlay();
    setCameraEnabled(false);
  }, [clearOverlay, stopActiveStream]);

  useEffect(() => {
    refreshCameraDevicesWithoutBlocking();

    if (!navigator.mediaDevices) {
      return undefined;
    }

    navigator.mediaDevices.addEventListener?.('devicechange', refreshCameraDevicesWithoutBlocking);
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshCameraDevicesWithoutBlocking);
    };
  }, [refreshCameraDevicesWithoutBlocking]);

  useEffect(() => {
    return () => {
      stopActiveStream();
    };
  }, [stopActiveStream]);

  return {
    videoRef,
    overlayRef,
    frameRef,
    streamRef,
    cameraEnabled,
    cameraDevices,
    syncCanvasSize,
    clearOverlay,
    refreshCameraDevices,
    startCamera,
    stopCamera,
  };
}
