import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_MEDIAPIPE_DELEGATE_ID,
  DEFAULT_MEDIAPIPE_MODEL_ID,
  DEFAULT_YOLO_MODEL_ID,
  MEDIAPIPE_MODELS,
  YOLO_MODELS,
  loadMediaPipePoseDetector,
  loadYoloDetector,
} from './aiDetector';
import { createCameraFrame } from './detectionSchema';

type RawImageFixture = {
  size: [number, number];
  width: number;
  height: number;
};

type MockInputs = {
  pixel_values: string;
};

type MockLogits = {
  dims: [number, number, number];
  data: number[];
};

type MockDetectionOutput = {
  logits: MockLogits;
  pred_boxes: {
    dims: [number, number, number];
    data: [number, number, number, number];
  };
};

const mockProcessor = vi.fn<(image: RawImageFixture) => Promise<MockInputs>>();
const mockModel = vi.fn<(inputs: MockInputs) => Promise<{ logits: MockLogits } | MockDetectionOutput>>();
const mockFromCanvas = vi.fn<(canvas: HTMLCanvasElement) => RawImageFixture>();
const mockFromPretrainedProcessor = vi.fn<(modelId: string, options: unknown) => Promise<typeof mockProcessor>>();
const mockFromPretrainedModel = vi.fn<(modelId: string, options: unknown) => Promise<typeof mockModel>>();
const mockForVisionTasks = vi.fn<(path: string, useModule?: boolean) => Promise<string>>();
const mockDetect = vi.fn();
const mockDetectForVideo = vi.fn();
const mockSetOptions = vi.fn<(options: unknown) => Promise<void>>();
const mockClose = vi.fn<() => void>();
const mockCreateFromOptions = vi.fn<(vision: unknown, options: unknown) => Promise<unknown>>();

vi.mock('@huggingface/transformers', () => ({
  env: {
    allowLocalModels: true,
  },
  RawImage: {
    fromCanvas: (canvas: HTMLCanvasElement) => mockFromCanvas(canvas),
  },
  AutoImageProcessor: {
    from_pretrained: (modelId: string, options: unknown) => mockFromPretrainedProcessor(modelId, options),
  },
  AutoModelForObjectDetection: {
    from_pretrained: (modelId: string, options: unknown) => mockFromPretrainedModel(modelId, options),
  },
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: (path: string, useModule?: boolean) => mockForVisionTasks(path, useModule),
  },
  PoseLandmarker: {
    createFromOptions: (vision: unknown, options: unknown) => mockCreateFromOptions(vision, options),
  },
}));

function makePoseLogits(): MockLogits {
  const data = new Array(57).fill(0);
  data[0] = 0.1;
  data[1] = 0.2;
  data[2] = 0.8;
  data[3] = 0.9;
  data[4] = 0.95;
  data[5] = 0;

  for (let index = 0; index < 17; index += 1) {
    const offset = 6 + index * 3;
    data[offset] = 0.2 + index * 0.01;
    data[offset + 1] = 0.3 + index * 0.01;
    data[offset + 2] = 0.9;
  }

  return {
    dims: [1, 1, 57],
    data,
  };
}

function makeDetectionOutput(): MockDetectionOutput {
  const logits = Array.from({ length: 80 }, () => 0.02);
  logits[0] = 0.92;

  return {
    logits: {
      dims: [1, 1, 80],
      data: logits,
    },
    pred_boxes: {
      dims: [1, 1, 4],
      data: [0.5, 0.55, 0.4, 0.5],
    },
  };
}

function makeMediaPipeLandmarks(visibility: number): Array<{ x: number; y: number; visibility: number }> {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility,
  }));
  const mappedIndices = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

  mappedIndices.forEach((landmarkIndex, keypointIndex) => {
    landmarks[landmarkIndex] = {
      x: 0.2 + keypointIndex * 0.0375,
      y: 0.3 + keypointIndex * 0.0375,
      visibility,
    };
  });

  return landmarks;
}

describe('loadYoloDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFromCanvas.mockReturnValue({
      size: [480, 640],
      width: 640,
      height: 480,
    });

    mockProcessor.mockImplementation((image) => {
      if (!image.size) {
        throw new Error('processor received a canvas instead of RawImage');
      }

      return Promise.resolve({ pixel_values: 'mock-pixels' });
    });

    mockModel.mockResolvedValue({
      logits: makePoseLogits(),
    });

    mockFromPretrainedProcessor.mockResolvedValue(mockProcessor);
    mockFromPretrainedModel.mockResolvedValue(mockModel);
  });

  test('converts canvas frames to RawImage before preprocessing', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const { detector, runtime } = await loadYoloDetector({
      task: 'pose',
      backend: 'yolo',
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'wasm',
      quantization: 'uint8',
      mediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
      mediaPipeDelegate: DEFAULT_MEDIAPIPE_DELEGATE_ID,
      playerCount: 2,
    });
    const frame = createCameraFrame(canvas, 'test-frame-1', 100);
    const result = await detector(frame, { threshold: 0.5, percentage: false });

    expect(runtime).toBe('WASM');
    expect(mockFromPretrainedModel).toHaveBeenCalledWith(
      DEFAULT_YOLO_MODEL_ID,
      expect.objectContaining({
        device: 'wasm',
        dtype: 'uint8',
      })
    );
    expect(mockFromCanvas).toHaveBeenCalledWith(canvas);
    expect(mockProcessor).toHaveBeenCalledWith(expect.objectContaining({ size: [480, 640] }));
    expect(result.detections).toHaveLength(1);
    expect(result.frame).toEqual({
      frameId: 'test-frame-1',
      capturedAtMs: 100,
      width: 640,
      height: 480,
    });
    expect(result.detections[0].box).toEqual({
      xmin: 64,
      ymin: 96,
      xmax: 512,
      ymax: 432,
    });
    expect(result.detections[0].keypoints).toHaveLength(17);
    expect(typeof result.timings.rawImageMs).toBe('number');
    expect(typeof result.timings.preprocessMs).toBe('number');
    expect(typeof result.timings.modelMs).toBe('number');
    expect(typeof result.timings.postprocessMs).toBe('number');
    expect(typeof result.timings.totalMs).toBe('number');
  });

  test('uses fp16 when WebGPU is selected', async () => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockResolvedValue({}),
      },
    });

    await loadYoloDetector({
      task: 'pose',
      backend: 'yolo',
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'webgpu',
      quantization: 'fp16',
      mediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
      mediaPipeDelegate: DEFAULT_MEDIAPIPE_DELEGATE_ID,
      playerCount: 2,
    });

    expect(mockFromPretrainedModel).toHaveBeenCalledWith(
      DEFAULT_YOLO_MODEL_ID,
      expect.objectContaining({
        device: 'webgpu',
        dtype: 'fp16',
      })
    );
  });

  test('decodes non-pose YOLO models as person boxes without keypoints', async () => {
    const detectionModelId = YOLO_MODELS.find((model) => model.task === 'detection')?.id;
    if (!detectionModelId) {
      throw new Error('Missing detection model fixture');
    }

    mockModel.mockResolvedValue(makeDetectionOutput());

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const { detector } = await loadYoloDetector({
      task: 'pose',
      backend: 'yolo',
      modelId: detectionModelId,
      runtime: 'wasm',
      quantization: 'uint8',
      mediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
      mediaPipeDelegate: DEFAULT_MEDIAPIPE_DELEGATE_ID,
      playerCount: 2,
    });
    const result = await detector(createCameraFrame(canvas, 'test-frame-2', 200), {
      threshold: 0.5,
      percentage: false,
    });

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].label).toBe('person');
    expect(result.detections[0].score).toBe(0.92);
    expect(result.detections[0].keypoints).toBeUndefined();
    expect(result.detections[0].box.xmin).toBeCloseTo(192);
    expect(result.detections[0].box.ymin).toBeCloseTo(144);
    expect(result.detections[0].box.xmax).toBeCloseTo(448);
    expect(result.detections[0].box.ymax).toBeCloseTo(384);
  });
});

describe('loadMediaPipePoseDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockForVisionTasks.mockResolvedValue('mock-vision');
    mockDetect.mockReturnValue({
      landmarks: [makeMediaPipeLandmarks(0.9)],
    });
    mockDetectForVideo.mockReturnValue({
      landmarks: [makeMediaPipeLandmarks(0.9)],
    });
    mockSetOptions.mockResolvedValue(undefined);
    mockCreateFromOptions.mockResolvedValue({
      detect: mockDetect,
      detectForVideo: mockDetectForVideo,
      setOptions: mockSetOptions,
      close: mockClose,
    });
  });

  test('loads the selected MediaPipe model with the selected delegate', async () => {
    await loadMediaPipePoseDetector({
      task: 'pose',
      backend: 'mediapipe',
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'wasm',
      quantization: 'uint8',
      mediaPipeModelId: 'full',
      mediaPipeDelegate: 'CPU',
      playerCount: 4,
    });

    expect(mockForVisionTasks).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
      true
    );
    expect(mockCreateFromOptions).toHaveBeenCalledWith(
      'mock-vision',
      expect.objectContaining({
        baseOptions: {
          modelAssetPath: MEDIAPIPE_MODELS.find((model) => model.id === 'full')?.modelAssetPath,
          delegate: 'CPU',
        },
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        numPoses: 4,
        outputSegmentationMasks: false,
        runningMode: 'VIDEO',
      })
    );
  });

  test('converts MediaPipe landmarks to app pose detections', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const { detector, runtime, dispose } = await loadMediaPipePoseDetector({
      task: 'pose',
      backend: 'mediapipe',
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'wasm',
      quantization: 'uint8',
      mediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
      mediaPipeDelegate: 'GPU',
      playerCount: 2,
    });
    const result = await detector(createCameraFrame(canvas, 'mediapipe-frame-1', 1234), {
      threshold: 0.45,
      percentage: false,
    });

    expect(runtime).toBe('MediaPipe GPU');
    expect(mockSetOptions).toHaveBeenCalledWith({
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      numPoses: 2,
      outputSegmentationMasks: false,
      runningMode: 'VIDEO',
    });
    expect(mockDetect).not.toHaveBeenCalled();
    expect(mockDetectForVideo).toHaveBeenCalledWith(canvas, 1234);
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].score).toBeCloseTo(0.9);
    expect(result.detections[0].keypoints).toHaveLength(17);
    expect(result.detections[0].keypoints?.[0]).toEqual({
      label: 'Nose',
      x: 128,
      y: 144,
      score: 0.9,
    });
    expect(result.detections[0].box.xmin).toBeCloseTo(81.92);
    expect(result.detections[0].box.ymin).toBeCloseTo(97.92);
    expect(result.detections[0].box.xmax).toBeCloseTo(558.08);
    expect(result.detections[0].box.ymax).toBeCloseTo(478.08);

    dispose?.();
    expect(mockClose).toHaveBeenCalled();
  });

  test('converts multiple MediaPipe poses to app pose detections', async () => {
    mockDetectForVideo.mockReturnValue({
      landmarks: [makeMediaPipeLandmarks(0.9), makeMediaPipeLandmarks(0.8)],
    });

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const { detector } = await loadMediaPipePoseDetector({
      task: 'pose',
      backend: 'mediapipe',
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'wasm',
      quantization: 'uint8',
      mediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
      mediaPipeDelegate: DEFAULT_MEDIAPIPE_DELEGATE_ID,
      playerCount: 2,
    });
    const result = await detector(createCameraFrame(canvas, 'mediapipe-frame-2', 2000), {
      threshold: 0.5,
      percentage: false,
    });

    expect(result.detections).toHaveLength(2);
    expect(result.detections[0].score).toBeCloseTo(0.9);
    expect(result.detections[1].score).toBeCloseTo(0.8);
  });

  test('keeps low-confidence MediaPipe poses so multi-person tracking does not drop bodies', async () => {
    mockDetectForVideo.mockReturnValue({
      landmarks: [makeMediaPipeLandmarks(0.2)],
    });

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const { detector } = await loadMediaPipePoseDetector({
      task: 'pose',
      backend: 'mediapipe',
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'wasm',
      quantization: 'uint8',
      mediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
      mediaPipeDelegate: DEFAULT_MEDIAPIPE_DELEGATE_ID,
      playerCount: 2,
    });
    const result = await detector(createCameraFrame(canvas, 'mediapipe-frame-2', 2000), {
      threshold: 0.5,
      percentage: false,
    });

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].score).toBeCloseTo(0.2);
  });
});
