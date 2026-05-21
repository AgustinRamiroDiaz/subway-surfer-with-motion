import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import App from './App';

vi.mock('./detectorClient', () => ({
  loadDetectorClient: vi.fn(),
}));

const APP_PREFERENCES_STORAGE_KEY = 'motion-runner:detection-preferences:v1';
let getContextSpy: MockInstance;

beforeEach(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  getContextSpy.mockRestore();
  window.localStorage.clear();
});

test('renders the motion game shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /motion runner/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/main game/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/camera feedback/i)).toBeInTheDocument();
  expect(within(screen.getByLabelText(/game controls/i)).getByRole('button', { name: /enable camera/i })).toBeEnabled();
  expect(within(screen.getByLabelText(/game controls/i)).getByRole('button', { name: /pause/i })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /mirror camera/i })).toBeChecked();
  expect(screen.getByLabelText(/players/i)).toHaveValue('2');
  expect(screen.getByRole('button', { name: /stop camera/i })).toBeDisabled();
});

test('defaults to MediaPipe Lite on GPU', () => {
  render(<App />);

  fireEvent.click(screen.getByText(/advanced tracking/i));

  expect(screen.getByLabelText(/tracker/i)).toHaveValue('mediapipe');
  expect(screen.getByLabelText(/^model$/i)).toHaveValue('lite');
  expect(screen.getByLabelText(/delegate/i)).toHaveValue('GPU');
});

test('remembers detector decisions across remounts', () => {
  const { unmount } = render(<App />);

  fireEvent.click(screen.getByText(/advanced tracking/i));
  fireEvent.change(screen.getByLabelText(/tracker/i), { target: { value: 'yolo' } });
  fireEvent.change(screen.getByLabelText(/^model$/i), {
    target: { value: 'onnx-community/yolo26s-pose-ONNX' },
  });
  fireEvent.change(screen.getByLabelText(/runtime/i), { target: { value: 'wasm' } });
  fireEvent.change(screen.getByLabelText(/quantization/i), { target: { value: 'uint8' } });
  fireEvent.change(screen.getByLabelText(/players/i), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /mirror camera/i }));

  unmount();
  render(<App />);
  fireEvent.click(screen.getByText(/advanced tracking/i));

  expect(screen.getByLabelText(/tracker/i)).toHaveValue('yolo');
  expect(screen.getByLabelText(/^model$/i)).toHaveValue('onnx-community/yolo26s-pose-ONNX');
  expect(screen.getByLabelText(/runtime/i)).toHaveValue('wasm');
  expect(screen.getByLabelText(/quantization/i)).toHaveValue('uint8');
  expect(screen.getByLabelText(/players/i)).toHaveValue('4');
  expect(screen.getByRole('checkbox', { name: /mirror camera/i })).not.toBeChecked();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"yolo"');
});

test('shows Python WebRTC as a server-backed tracker option', () => {
  render(<App />);

  fireEvent.click(screen.getByText(/advanced tracking/i));
  fireEvent.change(screen.getByLabelText(/tracker/i), { target: { value: 'python-webrtc' } });

  expect(screen.getByLabelText(/tracker/i)).toHaveValue('python-webrtc');
  expect(screen.getByText(/signaling url: ws:\/\/127\.0\.0\.1:8765/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/delegate/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/runtime/i)).not.toBeInTheDocument();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"python-webrtc"');
});
