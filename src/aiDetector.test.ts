import { DEFAULT_YOLO_MODEL_ID, YOLO_MODELS, loadYoloDetector } from './aiDetector';

const mockProcessor = jest.fn();
const mockModel = jest.fn();
const mockFromCanvas = jest.fn();
const mockFromPretrainedProcessor = jest.fn();
const mockFromPretrainedModel = jest.fn();

jest.mock('@huggingface/transformers', () => ({
  env: {
    allowLocalModels: true,
  },
  RawImage: {
    fromCanvas: (...args: unknown[]) => mockFromCanvas(...args),
  },
  AutoImageProcessor: {
    from_pretrained: (...args: unknown[]) => mockFromPretrainedProcessor(...args),
  },
  AutoModelForObjectDetection: {
    from_pretrained: (...args: unknown[]) => mockFromPretrainedModel(...args),
  },
}));

function makePoseLogits() {
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

function makeDetectionOutput() {
  const logits = new Array(80).fill(0.02);
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

describe('loadYoloDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'wasm',
    });
    const result = await detector(canvas, { threshold: 0.5, percentage: false });

    expect(runtime).toBe('WASM');
    expect(mockFromPretrainedModel).toHaveBeenCalledWith(
      DEFAULT_YOLO_MODEL_ID,
      expect.objectContaining({
        device: 'wasm',
        dtype: 'q8',
      })
    );
    expect(mockFromCanvas).toHaveBeenCalledWith(canvas);
    expect(mockProcessor).toHaveBeenCalledWith(expect.objectContaining({ size: [480, 640] }));
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].box).toEqual({
      xmin: 64,
      ymin: 96,
      xmax: 512,
      ymax: 432,
    });
    expect(result.detections[0].keypoints).toHaveLength(17);
    expect(result.timings).toEqual({
      rawImageMs: expect.any(Number),
      preprocessMs: expect.any(Number),
      modelMs: expect.any(Number),
      postprocessMs: expect.any(Number),
      totalMs: expect.any(Number),
    });
  });

  test('uses fp16 when WebGPU is selected', async () => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: jest.fn().mockResolvedValue({}),
      },
    });

    await loadYoloDetector({
      modelId: DEFAULT_YOLO_MODEL_ID,
      runtime: 'webgpu',
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
      modelId: detectionModelId,
      runtime: 'wasm',
    });
    const result = await detector(canvas, { threshold: 0.5, percentage: false });

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
