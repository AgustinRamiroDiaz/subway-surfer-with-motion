import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import App from './App';
import { I18nProvider } from './i18n';
import { APP_PREFERENCES_STORAGE_KEY } from './appPreferences';

vi.mock('../pose-detection/detectorClient', () => ({
  loadDetectorClient: vi.fn(),
}));

let getContextSpy: MockInstance;

function renderApp(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </MantineProvider>
  );
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

test('renders the motion game shell', async () => {
  renderApp();
  expect(await screen.findByRole('heading', { name: /carrera lateral/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /carrera lateral/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /saltar y agacharse/i })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText(/juego principal/i)).toBeInTheDocument();
  expect(within(screen.getByLabelText(/juego principal/i)).getByLabelText(/vista de cámara/i)).toHaveClass('in-game-camera');
  expect(within(screen.getByLabelText(/menú de minijuegos/i)).getByRole('button', { name: /activar cámara/i })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /^menú$/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/^juego principal$/i)).not.toBeInTheDocument();
  expect(within(screen.getByTestId('stage-actions')).getByRole('button', { name: /ocultar panel/i })).toBeInTheDocument();
  expect(screen.getByDisplayValue('Español')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Cámara frontal')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /espejar cámara/i })).toBeChecked();
  expect(screen.getByRole('switch', { name: /mostrar overlay del nivel/i })).toBeChecked();
  expect(screen.getByRole('switch', { name: /mostrar detección/i })).not.toBeChecked();
  expect(screen.getByText(/ninguno/i)).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /multiplicador de cámara/i })).toHaveAttribute('aria-valuenow', '1');
  expect(screen.getByRole('slider', { name: /fps de renderizado/i })).toHaveAttribute('aria-valuenow', '60');
  expect(screen.getByRole('slider', { name: /jugadores/i })).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByRole('button', { name: /detener cámara/i })).toBeDisabled();
});

test('collapses the controls without leaving a sidebar gutter', () => {
  renderApp();

  fireEvent.click(screen.getByRole('button', { name: /ocultar panel/i }));

  expect(screen.getByRole('button', { name: /mostrar panel/i })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByLabelText(/controles de detección/i)).toHaveClass('collapsed');
});

test('defaults to MediaPipe Lite on GPU', () => {
  renderApp();

  fireEvent.click(screen.getByText(/seguimiento avanzado/i));

  expect(screen.getByDisplayValue('MediaPipe · Seguimiento de puntos de pose')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Lite · Seguimiento de pose más rápido')).toBeInTheDocument();
  expect(screen.getByDisplayValue('GPU · Delegado acelerado')).toBeInTheDocument();
});

test('restores persisted detector decisions', () => {
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    selectedBackendId: 'yolo',
    selectedModelId: 'onnx-community/yolo26s-pose-ONNX',
    selectedRuntimeId: 'wasm',
    selectedQuantizationId: 'uint8',
    cameraFacingMode: 'environment',
    playerCount: 4,
    cameraMirrored: false,
    devCameraMultiplier: 2,
    gameRenderFps: 60,
  }));
  renderApp();

  fireEvent.click(screen.getByText(/seguimiento avanzado/i));

  expect(screen.getByDisplayValue('YOLO · Detección de objetos y pose')).toBeInTheDocument();
  expect(screen.getByDisplayValue('YOLO26s-pose · Pose pequeña')).toBeInTheDocument();
  expect(screen.getByDisplayValue('WASM · Fallback por CPU')).toBeInTheDocument();
  expect(screen.getByDisplayValue(/UINT8 · WASM cuantizado rápido/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('Cámara trasera')).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /jugadores/i })).toHaveAttribute('aria-valuenow', '4');
  expect(screen.getByRole('switch', { name: /espejar cámara/i })).not.toBeChecked();
  expect(screen.getByText(/2x/i)).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /multiplicador de cámara/i })).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByRole('slider', { name: /fps de renderizado/i })).toHaveAttribute('aria-valuenow', '60');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"yolo"');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"cameraFacingMode":"environment"');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"devCameraMultiplier":2');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"gameRenderFps":60');
});

test('remembers the selected level across remounts', async () => {
  const { unmount } = renderApp();

  fireEvent.click(screen.getByRole('button', { name: /saltar y agacharse/i }));

  expect(await screen.findByRole('heading', { name: /saltos y agaches/i })).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedRunnerGameId":"jump-duck"');

  unmount();
  renderApp();

  expect(await screen.findByRole('heading', { name: /saltos y agaches/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /saltar y agacharse/i })).toHaveAttribute('aria-pressed', 'true');
});

test('remembers overlay visibility independently for each level', () => {
  renderApp();

  const overlaySwitch = screen.getByRole('switch', { name: /mostrar overlay del nivel/i });
  fireEvent.click(overlaySwitch);
  expect(overlaySwitch).not.toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: /saltar y agacharse/i }));
  expect(screen.getByRole('switch', { name: /mostrar overlay del nivel/i })).toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: /carrera lateral/i }));
  expect(screen.getByRole('switch', { name: /mostrar overlay del nivel/i })).not.toBeChecked();
});

test('toggles camera and detection overlays independently', () => {
  renderApp();

  const cameraSwitch = screen.getByRole('switch', { name: /mostrar overlay del nivel/i });
  const detectionSwitch = screen.getByRole('switch', { name: /mostrar detección/i });

  expect(detectionSwitch).not.toBeChecked();

  fireEvent.click(cameraSwitch);
  expect(cameraSwitch).not.toBeChecked();
  expect(detectionSwitch).not.toBeChecked();

  fireEvent.click(detectionSwitch);
  expect(cameraSwitch).not.toBeChecked();
  expect(detectionSwitch).toBeChecked();
});

test('uses hand-rhythm guides without pose position markers', () => {
  renderApp();

  fireEvent.click(screen.getByRole('switch', { name: /mostrar detección/i }));
  expect(screen.getAllByTestId('camera-position-marker')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /ritmo de manos/i }));
  fireEvent.click(screen.getByRole('switch', { name: /mostrar detección/i }));

  expect(screen.queryAllByTestId('camera-position-marker')).toHaveLength(0);
  expect(screen.getAllByTestId('camera-hand-grid')).toHaveLength(2);
  expect(within(screen.getByLabelText(/juego principal/i)).getByLabelText(/vista de cámara/i)).toHaveClass('world-texture-source');
  expect(screen.getByTestId('hand-rhythm-player-viewports')).toHaveTextContent('P1');
  expect(screen.getByTestId('hand-rhythm-player-viewports')).toHaveTextContent('P2');
  expect(screen.getByRole('slider', { name: /dos objetivos simultáneos/i })).toHaveAttribute('aria-valuenow', '0.1');
});

test('restores the saved Hand Rhythm renderer choice', () => {
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    selectedRunnerGameId: 'hand-rhythm',
    handRhythmRenderer: 'canvas2d',
  }));

  renderApp();

  expect(screen.getByDisplayValue('Canvas 2D nativo')).toBeInTheDocument();
  expect(screen.getByTestId('hand-rhythm-scene')).toHaveAttribute('data-renderer', 'canvas2d');
});

test('ignores invalid stored levels', async () => {
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    selectedRunnerGameId: 'training-room',
  }));

  renderApp();

  expect(await screen.findByRole('heading', { name: /carrera lateral/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /carrera lateral/i })).toHaveAttribute('aria-pressed', 'true');
});

test('shows Python WebRTC as a server-backed tracker option', () => {
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    selectedBackendId: 'python-webrtc',
  }));
  renderApp();

  fireEvent.click(screen.getByText(/seguimiento avanzado/i));

  expect(screen.getByDisplayValue('Python WebRTC · Seguimiento de pose remoto de baja latencia')).toBeInTheDocument();
  expect(screen.getByText(/url de señalización/i)).toBeInTheDocument();
  expect(screen.getByText('ws://127.0.0.1:8765')).toBeInTheDocument();
  expect(screen.queryByLabelText(/delegado/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/runtime/i)).not.toBeInTheDocument();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"python-webrtc"');
});

test('opens tracking internals in the documentation view', () => {
  renderApp();

  expect(screen.getByRole('button', { name: /acerca de confianza/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /acerca de jugadores/i })).toBeInTheDocument();

  const docsLink = screen.getByRole('link', { name: /docs de seguimiento/i });
  expect(docsLink).toHaveAttribute('href', '/docs/tracking-internals');
  expect(docsLink).toHaveAttribute('target', '_blank');
});

test('renders tracking internals as a dedicated docs page', async () => {
  window.history.pushState({}, '', '/docs/tracking-internals');

  renderApp();

  expect(await screen.findByLabelText(/documentación interna de seguimiento/i)).toBeInTheDocument();
  expect(screen.getByText(/el navegador posee el permiso de cámara/i)).toBeInTheDocument();
  expect(screen.getByText(/el backend conserva un único espacio/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/juego principal/i)).not.toBeInTheDocument();
});
