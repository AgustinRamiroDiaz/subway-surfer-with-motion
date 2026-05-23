import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import App from './App';
import { GAME_SELECTION_STORAGE_KEY } from '../game/GameScene';
import { I18nProvider } from './i18n';

vi.mock('../pose-detection/detectorClient', () => ({
  loadDetectorClient: vi.fn(),
}));

const APP_PREFERENCES_STORAGE_KEY = 'motion-runner:detection-preferences:v1';
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

function chooseOption(currentValue: RegExp, optionName: RegExp): void {
  const input = screen.getAllByDisplayValue(currentValue).find((element) => element.getAttribute('role') === 'combobox');
  if (!input) {
    throw new Error(`Unable to find combobox with display value ${currentValue.toString()}`);
  }
  userEvent.click(input);
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
  expect(screen.getByRole('heading', { name: /carrera lateral/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /carrera lateral/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /saltar y agacharse/i })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText(/juego principal/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/vista de cámara/i)).toBeInTheDocument();
  expect(within(screen.getByLabelText(/controles del juego/i)).getByRole('button', { name: /activar cámara/i })).toBeEnabled();
  expect(within(screen.getByLabelText(/controles del juego/i)).getByRole('button', { name: /pausar/i })).toBeDisabled();
  expect(screen.getByDisplayValue('Español')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Cámara frontal')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /espejar cámara/i })).toBeChecked();
  expect(screen.getByRole('switch', { name: /multiplicador de cámara/i })).not.toBeChecked();
  expect(screen.getByRole('slider', { name: /jugadores/i })).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByRole('button', { name: /detener cámara/i })).toBeDisabled();
});

test('defaults to MediaPipe Lite on GPU', () => {
  renderApp();

  fireEvent.click(screen.getByText(/seguimiento avanzado/i));

  expect(screen.getByDisplayValue('MediaPipe · Seguimiento de puntos de pose')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Lite · Seguimiento de pose más rápido')).toBeInTheDocument();
  expect(screen.getByDisplayValue('GPU · Delegado acelerado')).toBeInTheDocument();
});

test('remembers detector decisions across remounts', () => {
  const { unmount } = renderApp();

  fireEvent.click(screen.getByText(/seguimiento avanzado/i));
  chooseOption(/MediaPipe · Seguimiento de puntos de pose/i, /YOLO · Detección de objetos y pose/i);
  chooseOption(/YOLO26n-pose · Pose nano/i, /YOLO26s-pose · Pose pequeña/i);
  chooseOption(/WebGPU · Acelerado por GPU/i, /WASM · Fallback por CPU/i);
  chooseOption(/Cámara frontal/i, /Cámara trasera/i);
  fireEvent.keyDown(screen.getByRole('slider', { name: /jugadores/i }), { key: 'ArrowRight' });
  fireEvent.keyDown(screen.getByRole('slider', { name: /jugadores/i }), { key: 'ArrowRight' });
  userEvent.click(screen.getByRole('switch', { name: /espejar cámara/i }));
  userEvent.click(screen.getByRole('switch', { name: /multiplicador de cámara/i }));

  unmount();
  renderApp();
  fireEvent.click(screen.getByText(/seguimiento avanzado/i));

  expect(screen.getByDisplayValue('YOLO · Detección de objetos y pose')).toBeInTheDocument();
  expect(screen.getByDisplayValue('YOLO26s-pose · Pose pequeña')).toBeInTheDocument();
  expect(screen.getByDisplayValue('WASM · Fallback por CPU')).toBeInTheDocument();
  expect(screen.getByDisplayValue(/UINT8 · WASM cuantizado rápido/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('Cámara trasera')).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: /jugadores/i })).toHaveAttribute('aria-valuenow', '4');
  expect(screen.getByRole('switch', { name: /espejar cámara/i })).not.toBeChecked();
  expect(screen.getByRole('switch', { name: /multiplicador de cámara/i })).toBeChecked();
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"selectedBackendId":"yolo"');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"cameraFacingMode":"environment"');
  expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).toContain('"devCameraMultiplierEnabled":true');
});

test('remembers the selected level across remounts', () => {
  const { unmount } = renderApp();

  fireEvent.click(screen.getByRole('button', { name: /saltar y agacharse/i }));

  expect(screen.getByRole('heading', { name: /saltos y agaches/i })).toBeInTheDocument();
  expect(window.localStorage.getItem(GAME_SELECTION_STORAGE_KEY)).toBe('jump-duck');

  unmount();
  renderApp();

  expect(screen.getByRole('heading', { name: /saltos y agaches/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /saltar y agacharse/i })).toHaveAttribute('aria-pressed', 'true');
});

test('ignores invalid stored levels', () => {
  window.localStorage.setItem(GAME_SELECTION_STORAGE_KEY, 'training-room');

  renderApp();

  expect(screen.getByRole('heading', { name: /carrera lateral/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /carrera lateral/i })).toHaveAttribute('aria-pressed', 'true');
});

test('shows Python WebRTC as a server-backed tracker option', () => {
  renderApp();

  fireEvent.click(screen.getByText(/seguimiento avanzado/i));
  chooseOption(/MediaPipe · Seguimiento de puntos de pose/i, /Python WebRTC · Seguimiento de pose remoto de baja latencia/i);

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

test('renders tracking internals as a dedicated docs page', () => {
  window.history.pushState({}, '', '/docs/tracking-internals');

  renderApp();

  expect(screen.getByLabelText(/documentación interna de seguimiento/i)).toBeInTheDocument();
  expect(screen.getByText(/el navegador posee el permiso de cámara/i)).toBeInTheDocument();
  expect(screen.getByText(/el backend conserva un único espacio/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/juego principal/i)).not.toBeInTheDocument();
});
