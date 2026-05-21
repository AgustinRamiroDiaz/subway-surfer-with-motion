import type { ReactElement } from 'react';
import { Button } from '@mantine/core';

const sections = [
  {
    eyebrow: 'Client ownership',
    title: 'The browser is the source of truth',
    body:
      'The browser owns the camera permission, live preview, overlay canvas, player assignment, game state, and stored preferences. Every tracker returns the same prediction shape, so changing backends does not hand away the rest of the experience.',
  },
  {
    eyebrow: 'Local trackers',
    title: 'MediaPipe and YOLO use a browser-native pull loop',
    body:
      'Local detectors run from HTMLVideoElement.requestVideoFrameCallback(). The app waits for an actual camera frame, snapshots the newest pixels, runs inference, draws the overlay, and schedules the next video-frame callback.',
  },
  {
    eyebrow: 'Python WebRTC',
    title: 'Remote tracking still keeps the UI local',
    body:
      'The frontend sends the camera media track to Python over WebRTC. WebSocket is only the setup lane for the offer, answer, and ICE candidates. Detection results return over the detections data channel using the same ModelPrediction structure as local trackers.',
  },
  {
    eyebrow: 'Latency model',
    title: 'Fresh frames beat queued frames',
    body:
      'The backend keeps one latest-frame slot. When inference is busy, newer frames replace stale pending frames. That means the next result is biased toward the freshest camera moment instead of slowly working through old input.',
  },
  {
    eyebrow: 'Privacy boundary',
    title: 'You choose where frames go',
    body:
      'In-browser trackers keep camera frames inside the page. Python WebRTC sends frames only to the signaling host you configure, which is intended for your own machine or LAN during local development.',
  },
];

export function TrackingInternalsDocs(): ReactElement {
  return (
    <div className="docs-view" aria-label="Tracking internals documentation">
      <div className="docs-view-header">
        <div>
          <p className="eyebrow">Documentation</p>
          <h2>Tracking internals</h2>
          <p>
            A deeper map of how camera frames, model predictions, overlay drawing, and player state stay under client
            control.
          </p>
        </div>
        <Button className="secondary-action" component="a" href="/" variant="default">
          Back to app
        </Button>
      </div>

      <div className="docs-sections">
        {sections.map((section) => (
          <section className="docs-section" key={section.eyebrow}>
            <p className="eyebrow">{section.eyebrow}</p>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
