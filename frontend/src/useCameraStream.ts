import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CameraFacingMode } from './appPreferences';

export type CameraDeviceOption = {
  deviceId: string;
  label: string;
};

export type StartCameraOptions = {
  facingMode: CameraFacingMode;
  deviceId: string | null;
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

export function useCameraStream(): CameraStreamControls {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  const startCamera = useCallback(async ({ facingMode, deviceId }: StartCameraOptions) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(getCameraAccessUnavailableMessage());
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode }),
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
    refreshCameraDevicesWithoutBlocking();
    return stream;
  }, [refreshCameraDevicesWithoutBlocking]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    clearOverlay();
    setCameraEnabled(false);
  }, [clearOverlay]);

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
