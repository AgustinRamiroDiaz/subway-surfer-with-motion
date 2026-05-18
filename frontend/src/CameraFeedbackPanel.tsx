import type { ReactElement, RefObject } from 'react';

type CameraFeedbackPanelProps = {
  cameraEnabled: boolean;
  cameraMirrored: boolean;
  playerPosition: number;
  selectedTrackerLabel: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  onLoadedMetadata: () => void;
};

export function CameraFeedbackPanel({
  cameraEnabled,
  cameraMirrored,
  playerPosition,
  selectedTrackerLabel,
  videoRef,
  overlayRef,
  frameRef,
  onLoadedMetadata,
}: CameraFeedbackPanelProps): ReactElement {
  return (
    <section className="video-stage sidebar-camera" aria-label="Camera feedback">
      <div className="sidebar-camera-label">
        <p className="eyebrow">Camera</p>
        <strong>{selectedTrackerLabel}</strong>
      </div>
      <video
        ref={videoRef}
        className={`camera-video${cameraMirrored ? ' mirrored-media' : ''}`}
        muted
        playsInline
        onLoadedMetadata={onLoadedMetadata}
      />
      <div className="camera-position-guides" aria-hidden="true">
        <div className="camera-center-line" />
        <div className="camera-position-marker" style={{ left: `${playerPosition * 100}%` }} />
      </div>
      <canvas
        ref={overlayRef}
        className={`detection-overlay${cameraMirrored ? ' mirrored-media' : ''}`}
        aria-hidden="true"
      />
      <canvas ref={frameRef} className="frame-buffer" aria-hidden="true" />

      {!cameraEnabled && (
        <div className="camera-empty-state">
          <p>Camera off</p>
        </div>
      )}
    </section>
  );
}
