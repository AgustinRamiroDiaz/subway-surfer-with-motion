export type CameraFrameImage = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

export type CameraFrameDescriptor = {
  frameId: string;
  capturedAtMs: number;
  width: number;
  height: number;
};

export type CameraFrame = CameraFrameDescriptor & {
  type: 'camera-frame';
  image: CameraFrameImage;
};

export type TransferredCameraFrame = CameraFrameDescriptor & {
  type: 'camera-frame';
  bitmap: ImageBitmap;
};

export type PoseKeypoint = {
  label: string;
  x: number;
  y: number;
  z?: number;
  score: number;
};

export type PoseDetection = {
  id?: number;
  label: 'person';
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  keypoints: PoseKeypoint[];
};

export type HandGestureDetection = {
  id?: number;
  label: 'hand';
  score: number;
  gesture: string;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  keypoints?: PoseKeypoint[];
};

export type PersonDetection = Omit<PoseDetection, 'keypoints'> & {
  id?: number;
  keypoints?: PoseKeypoint[];
};

export type ModelPredictionTimings = {
  rawImageMs: number;
  preprocessMs: number;
  modelMs: number;
  postprocessMs: number;
  totalMs: number;
};

export type ModelPredictionOptions = {
  threshold: number;
  percentage: false;
};

export type ModelPrediction = {
  type: 'model-prediction';
  frame: CameraFrameDescriptor;
  detections: (PersonDetection | HandGestureDetection)[];
  timings: ModelPredictionTimings;
};

export type ModelPredictionService = (
  frame: CameraFrame,
  options: ModelPredictionOptions
) => Promise<ModelPrediction>;

export function createCameraFrame(
  image: CameraFrameImage,
  frameId: string,
  capturedAtMs: number
): CameraFrame {
  return {
    type: 'camera-frame',
    frameId,
    capturedAtMs,
    width: image.width,
    height: image.height,
    image,
  };
}

export function createFrameDescriptor(frame: CameraFrameDescriptor): CameraFrameDescriptor {
  return {
    frameId: frame.frameId,
    capturedAtMs: frame.capturedAtMs,
    width: frame.width,
    height: frame.height,
  };
}
