import {
  createFrameDescriptor,
  type CameraFrameImage,
  type HandGestureDetection,
} from './detectionSchema';
import {
  MEDIAPIPE_WASM_BASE_URL,
  type Detector,
  type DetectorLoadOptions,
  type DetectorLoadResult,
} from './detectorConfig';

export type MediaPipeGestureResult = {
  gestures: Array<Array<{ categoryName: string; score: number }>>;
  landmarks: Array<Array<{ x: number; y: number; z: number }>>;
  worldLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
};

export type MediaPipeGestureRecognizer = {
  recognizeForVideo: (image: CameraFrameImage, timestampMs: number) => MediaPipeGestureResult;
  setOptions?: (options: {
    minHandDetectionConfidence?: number;
    minHandPresenceConfidence?: number;
    minTrackingConfidence?: number;
    numHands?: number;
    runningMode?: 'IMAGE' | 'VIDEO';
  }) => Promise<void>;
  close?: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function boxFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
  width: number,
  height: number
): HandGestureDetection['box'] {
  const xs = landmarks.map((l) => l.x * width);
  const ys = landmarks.map((l) => l.y * height);
  const xmin = Math.min(...xs);
  const ymin = Math.min(...ys);
  const xmax = Math.max(...xs);
  const ymax = Math.max(...ys);
  const padding = Math.max(10, Math.max(xmax - xmin, ymax - ymin) * 0.2);

  return {
    xmin: clamp(xmin - padding, 0, width),
    ymin: clamp(ymin - padding, 0, height),
    xmax: clamp(xmax + padding, 0, width),
    ymax: clamp(ymax + padding, 0, height),
  };
}

export async function loadMediaPipeGestureDetector(options: DetectorLoadOptions): Promise<DetectorLoadResult> {
  const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
  const startedAt = performance.now();

  options.onStatusChange?.({ message: 'Loading MediaPipe Gesture runtime' });
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE_URL, true);

  options.onStatusChange?.({ message: 'Loading Gesture Recognizer model' });
  const gestureRecognizer = (await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
      delegate: options.mediaPipeDelegate,
    },
    runningMode: 'VIDEO',
    numHands: options.playerCount,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })) as MediaPipeGestureRecognizer;
  const loadDoneAt = performance.now();

  options.onStatusChange?.({
    message: `Loaded Gesture Recognizer in ${Math.round(loadDoneAt - startedAt)} ms`,
  });

  let appliedThreshold = 0.5;
  const detector: Detector = async (frame, detectorOptions) => {
    const startedAt = performance.now();
    if (detectorOptions.threshold !== appliedThreshold) {
      await gestureRecognizer.setOptions?.({
        minHandDetectionConfidence: detectorOptions.threshold,
        minHandPresenceConfidence: detectorOptions.threshold,
        minTrackingConfidence: detectorOptions.threshold,
        numHands: options.playerCount,
        runningMode: 'VIDEO',
      });
      appliedThreshold = detectorOptions.threshold;
    }
    const preprocessDoneAt = performance.now();
    const result = gestureRecognizer.recognizeForVideo(frame.image, frame.capturedAtMs);
    const modelDoneAt = performance.now();

    const detections: HandGestureDetection[] = result.gestures.map((gestureList, index) => {
      const topGesture = gestureList[0];
      const landmarks = result.landmarks[index] ?? [];
      const score = topGesture?.score ?? 0;
      const gestureName = topGesture?.categoryName ?? 'None';

      return {
        label: 'hand',
        score,
        gesture: gestureName,
        box: boxFromLandmarks(landmarks, frame.width, frame.height),
        keypoints: landmarks.map((l, i) => ({
          label: `hand_kp_${i}`,
          x: l.x * frame.width,
          y: l.y * frame.height,
          score: 1.0,
        })),
      };
    });

    const postprocessDoneAt = performance.now();

    return {
      type: 'model-prediction',
      frame: createFrameDescriptor(frame),
      detections,
      timings: {
        rawImageMs: 0,
        preprocessMs: preprocessDoneAt - startedAt,
        modelMs: modelDoneAt - preprocessDoneAt,
        postprocessMs: postprocessDoneAt - modelDoneAt,
        totalMs: postprocessDoneAt - startedAt,
      },
    };
  };

  return {
    detector,
    runtime: options.mediaPipeDelegate === 'GPU' ? 'MediaPipe GPU' : 'MediaPipe CPU',
    dispose: () => gestureRecognizer.close?.(),
  };
}
