/**
 * Adapted from google-ai-edge/mediapipe-samples-web.
 * This copy keeps only the Gesture Recognizer route and adds opt-in profiling.
 */
import './app_clean.css';
import { setupGestureRecognizer } from './tasks/gesture-recognizer';

const profiling = new URLSearchParams(window.location.search).get('profile') === '1';
if (profiling) {
  localStorage.setItem('mediapipe-running-mode', 'VIDEO');
  localStorage.setItem('mediapipe-webcam-active', 'true');
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <div class="app-container">
    <main class="main-content" aria-label="MediaPipe Gesture Recognizer sample"></main>
  </div>
`;

await setupGestureRecognizer(app.querySelector<HTMLElement>('.main-content')!);
