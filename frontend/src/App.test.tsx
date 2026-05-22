import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import App from './App';

vi.mock('./detectorClient', () => ({
  loadDetectorClient: vi.fn(),
}));

const APP_PREFERENCES_STORAGE_KEY = 'motion-runner:detection-preferences:v1';
let getContextSpy: MockInstance;

function renderApp(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>
  );
}

function chooseOption(currentValue: RegExp, optionName: RegExp): void {
  userEvent.click(screen.getByDisplayValue(currentValue));
  userEvent.click(screen.getByRole('option', { name: optionName }));
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  getContextSpy.mockRestore();
  window.localStorage.clear();
});

test('renders the motion game shell', () => {
  renderApp();
  expect(screen.getByRole('heading', { name: /motion runner/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/main game/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/camera feedback/i)).toBeInTheDocument();
  expect(within(screen.getByLabelText(/game controls/i)).getByRole('button', { name: /enable camera/i })).toBeEnabled();
  expect(within(screen.getByLabelText(/game controls/i)).getByRole('button', { name: /pause/i })).toBeDisabled();
  expect(screen.getByDisplayValue('Front camera')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /mirror camera/i })).toBeChecked();
  expect(screen.getByRole('slider', { name: /players/i })).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByRole('button', { name: /stop camera/i })).toBeDisabled();
});

test('defaults to MediaPipe Lite on GPU', () => {
  renderApp();

  fireEvent.click(screen.getByText(/advanced tracking/i));

  expect(screen.getByDisplayValue('MediaPipe · Pose landmark tracking')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Lite · Fastest pose tracking')).toBeInTheDocument();
  expect(screen.getByDisplayValue('GPU · Accelerated delegate')).toBeInTheDocument();
});

test('remembers detector decisions across remounts', () => {
  const { unmount } = renderApp();

  fireEvent.click(screen.getByText(/advanced tracking/i));
  chooseOption(/MediaPipe · Pose landmark tracking/i, /YOLO · Object and pose detection/i);
  chooseOption(/YOLO26n-pose · Nano pose/i, /YOLO26s-pose · Small pose/i);
  chooseOption(/WebGPU · GPU accelerated/i, /WASM · CPU fallback/i);
  chooseOption(/Front camera/i, /Back camera/i);
  fireEvent.keyDown(screen.getByRole('slider', { name: /players/i }), { key: 'ArrowRight' });
  fireEvent.keyDown(screen.getByRole('slider', { name: /players/i }), { key: 'ArrowRight' });
  userEvent.click(screen.getByRole('switch', { name: /mirror camera/i }));

  unmount();
  renderApp();
  fireEvent.click(screen.getByText(/advanced tracking/i));

  expect(screen.getByDisplayValue('YOLO · Object and pose detection')).toBeInTheDocument();
  expect(screen.getByDisplayValue('YOLO26s-pose · Small pose')).toBeInTheDocument();
  expect(screen.getByDisplayValue('WASM · CPU fallback')).toBeInTheDocument();
  expect(screen.getByDisplayValue(/UINT8 · Fast WASM quantized/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('Back camera')).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /players/i })).toHaveAttribute('aria-valuenow', '4');
  expect(screen.getByRole('switch', { name: /mirror camera/i })).not.toBeChecked();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"yolo"');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"cameraFacingMode":"environment"');
});

test('shows Python WebRTC as a server-backed tracker option', () => {
  renderApp();

  fireEvent.click(screen.getByText(/advanced tracking/i));
  chooseOption(/MediaPipe · Pose landmark tracking/i, /Python WebRTC · Remote low-latency pose tracking/i);

  expect(screen.getByDisplayValue('Python WebRTC · Remote low-latency pose tracking')).toBeInTheDocument();
  expect(screen.getByText(/signaling url/i)).toBeInTheDocument();
  expect(screen.getByText('ws://127.0.0.1:8765')).toBeInTheDocument();
  expect(screen.queryByLabelText(/delegate/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/runtime/i)).not.toBeInTheDocument();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"python-webrtc"');
});

test('opens tracking internals in the documentation view', () => {
  renderApp();

  expect(screen.getByRole('button', { name: /about confidence/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /about players/i })).toBeInTheDocument();

  const docsLink = screen.getByRole('link', { name: /tracking docs/i });
  expect(docsLink).toHaveAttribute('href', '/docs/tracking-internals');
  expect(docsLink).toHaveAttribute('target', '_blank');
});

test('renders tracking internals as a dedicated docs page', () => {
  window.history.pushState({}, '', '/docs/tracking-internals');

  renderApp();

  expect(screen.getByLabelText(/tracking internals documentation/i)).toBeInTheDocument();
  expect(screen.getByText(/the browser owns the camera/i)).toBeInTheDocument();
  expect(screen.getByText(/the backend keeps one latest-frame slot/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/main game/i)).not.toBeInTheDocument();
});
