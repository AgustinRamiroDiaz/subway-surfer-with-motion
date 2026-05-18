import { useCallback, useRef, useState, type RefObject } from 'react';

type CameraStreamControls = {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  streamRef: RefObject<MediaStream | null>;
  cameraEnabled: boolean;
  syncCanvasSize: () => void;
  clearOverlay: () => void;
  startCamera: () => Promise<MediaStream>;
  stopCamera: () => void;
};

export function useCameraStream(): CameraStreamControls {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);

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

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 640, max: 640 },
        height: { ideal: 480, max: 480 },
      },
      audio: false,
    });

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setCameraEnabled(true);
    return stream;
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    clearOverlay();
    setCameraEnabled(false);
  }, [clearOverlay]);

  return {
    videoRef,
    overlayRef,
    frameRef,
    streamRef,
    cameraEnabled,
    syncCanvasSize,
    clearOverlay,
    startCamera,
    stopCamera,
  };
}
