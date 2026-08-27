import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const sourceImage = path.join(rootDirectory, 'frontend/e2e/fixtures/hand-rhythm-palms.png');
const outputDirectory = process.env.PROFILE_OUTPUT_DIR ?? 'profile-results-hand-rhythm';
const durationMs = process.env.PROFILE_DURATION_MS ?? '15000';
const warmupMs = process.env.PROFILE_WARMUP_MS ?? '5000';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hand-rhythm-e2e-'));
const fakeVideo = path.join(temporaryDirectory, 'hands.y4m');

try {
  const durationSeconds = Math.ceil((Number(durationMs) + Number(warmupMs) + 10_000) / 1_000);
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-loop', '1',
    '-i', sourceImage,
    '-vf', "scale=352:264,crop=320:240:x='16+12*sin(n/24)':y='12+8*cos(n/31)',fps=15,format=yuv420p",
    '-t', String(durationSeconds),
    '-f', 'yuv4mpegpipe',
    '-y', fakeVideo,
  ]);

  await run(process.execPath, [path.join(scriptDirectory, 'profile-e2e.mjs')], {
    env: {
      ...process.env,
      PROFILE_DURATION_MS: durationMs,
      PROFILE_WARMUP_MS: warmupMs,
      PROFILE_OUTPUT_DIR: outputDirectory,
      PROFILE_GAME: 'hand-rhythm',
      PROFILE_PLAYERS: process.env.PROFILE_PLAYERS ?? '1',
      PROFILE_BACKEND: process.env.PROFILE_BACKEND ?? 'mediapipe',
      PROFILE_MEDIAPIPE_DELEGATE: process.env.PROFILE_MEDIAPIPE_DELEGATE ?? 'GPU',
      PROFILE_VIDEO_FILE: fakeVideo,
      PROFILE_PERFORMANCE_PROBE: 'true',
      PROFILE_REQUIRE_HANDS: 'true',
    },
  });
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

