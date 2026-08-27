import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFakeHandVideo } from './fake-hand-video.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const require = createRequire(path.join(rootDirectory, 'frontend/package.json'));
const { chromium } = require('playwright');
const outputDirectory = path.resolve(rootDirectory, process.env.MEDIAPIPE_PROFILE_OUTPUT_DIR ?? 'profile-results-mediapipe');
const durationMs = Number.parseInt(process.env.MEDIAPIPE_PROFILE_DURATION_MS ?? '15000', 10);
const warmupMs = Number.parseInt(process.env.MEDIAPIPE_PROFILE_WARMUP_MS ?? '5000', 10);
const port = Number.parseInt(process.env.MEDIAPIPE_PROFILE_PORT ?? '5174', 10);
const baseUrl = `http://127.0.0.1:${port}`;
const useRealGpu = process.env.MEDIAPIPE_PROFILE_REAL_GPU === 'true';
const headless = useRealGpu ? process.env.MEDIAPIPE_PROFILE_HEADLESS === 'true' : true;
const browserChannel = useRealGpu ? (process.env.MEDIAPIPE_PROFILE_BROWSER_CHANNEL ?? 'chrome') : undefined;

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

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(check, 250);
      });
      request.setTimeout(1_000, () => request.destroy());
    };
    check();
  });
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function distribution(values) {
  const finite = values.filter(Number.isFinite);
  return {
    count: finite.length,
    mean: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null,
    p50: percentile(finite, 0.5),
    p95: percentile(finite, 0.95),
    p99: percentile(finite, 0.99),
    max: finite.length ? Math.max(...finite) : null,
  };
}

function summarize(snapshot) {
  const completed = snapshot.samples.filter((sample) => sample.drawDoneAtMs !== null);
  const stages = {
    bitmapCapture: distribution(completed.map((sample) => sample.captureDoneAtMs - sample.captureStartedAtMs)),
    modelInference: distribution(completed.map((sample) => sample.inferenceMs)),
    workerAndMessageOverhead: distribution(completed.map((sample) =>
      sample.workerResultAtMs - sample.captureDoneAtMs - sample.inferenceMs
    )),
    landmarkDrawing: distribution(completed.map((sample) => sample.drawDoneAtMs - sample.workerResultAtMs)),
    cameraFrameToDraw: distribution(completed.map((sample) => sample.drawDoneAtMs - sample.captureStartedAtMs)),
  };
  const rankedStages = Object.entries(stages)
    .filter(([name, value]) => name !== 'cameraFrameToDraw' && value.p95 !== null)
    .sort((left, right) => right[1].p95 - left[1].p95)
    .map(([stage, value]) => ({ stage, p50Ms: value.p50, p95Ms: value.p95 }));
  const seconds = Math.max(0.001, (snapshot.capturedAtMs - snapshot.startedAtMs) / 1_000);
  return {
    durationMs: snapshot.capturedAtMs - snapshot.startedAtMs,
    completedFrames: completed.length,
    framesPerSecond: completed.length / seconds,
    framesWithHands: completed.filter((sample) => sample.handCount > 0).length,
    handDetectionRatio: completed.length
      ? completed.filter((sample) => sample.handCount > 0).length / completed.length
      : 0,
    stages,
    rankedStages,
    likelyBottleneck: rankedStages[0] ?? null,
  };
}

function summarizeCpuProfile(profile) {
  const sampleTimeByNode = new Map();
  for (let index = 0; index < (profile.samples ?? []).length; index += 1) {
    const nodeId = profile.samples[index];
    sampleTimeByNode.set(nodeId, (sampleTimeByNode.get(nodeId) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1_000);
  }
  return (profile.nodes ?? [])
    .map((node) => ({
      functionName: node.callFrame?.functionName || '(anonymous)',
      url: node.callFrame?.url || '',
      selfMs: sampleTimeByNode.get(node.id) ?? 0,
    }))
    .filter((entry) => entry.selfMs > 0)
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, 30);
}

await mkdir(outputDirectory, { recursive: true });
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'mediapipe-example-profile-'));
const fakeVideo = path.join(temporaryDirectory, 'hands.y4m');
let server;
let browser;

try {
  await generateFakeHandVideo(fakeVideo, Math.ceil((durationMs + warmupMs + 10_000) / 1_000));
  if (process.env.MEDIAPIPE_PROFILE_SKIP_BUILD !== 'true') {
    await run('pnpm', ['--filter', '@webcam-motion-games/test-mediapipe', 'build']);
  }
  server = spawn('pnpm', [
    '--filter', '@webcam-motion-games/test-mediapipe',
    'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: rootDirectory, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForServer(baseUrl);

  const browserArgs = [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    `--use-file-for-fake-video-capture=${fakeVideo}`,
  ];
  if (useRealGpu) {
    browserArgs.push('--ignore-gpu-blocklist', '--enable-gpu', '--enable-gpu-rasterization', '--enable-zero-copy', '--ozone-platform=x11');
  } else {
    browserArgs.push('--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer');
  }

  browser = await chromium.launch({ headless, channel: browserChannel, args: browserArgs });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
  await context.grantPermissions(['camera'], { origin: baseUrl });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Profiler.enable');
  await page.goto(`${baseUrl}/?profile=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.__mediaPipeGestureProfile?.getSnapshot().samples.some((sample) => (sample.handCount ?? 0) > 0),
    null,
    { timeout: 120_000 }
  );
  if (warmupMs > 0) await page.waitForTimeout(warmupMs);
  await page.evaluate(() => window.__mediaPipeGestureProfile?.reset());
  await client.send('Profiler.start');
  await page.waitForTimeout(durationMs);
  const snapshot = await page.evaluate(() => window.__mediaPipeGestureProfile?.getSnapshot());
  const cpuProfile = (await client.send('Profiler.stop')).profile;
  const profileSummary = summarize(snapshot);
  if (!profileSummary.completedFrames || !profileSummary.framesWithHands) {
    throw new Error('The official MediaPipe sample did not complete inference with detected hands.');
  }

  await page.screenshot({ path: path.join(outputDirectory, 'final-screen.png'), fullPage: true });
  await writeFile(path.join(outputDirectory, 'samples.json'), JSON.stringify(snapshot, null, 2));
  await writeFile(path.join(outputDirectory, 'cpu.cpuprofile'), JSON.stringify(cpuProfile));
  const delegate = await page.locator('#delegate-select').inputValue();
  const fallbackWarning = await page.locator('#fallback-warning').count()
    ? (await page.locator('#fallback-warning').textContent())?.trim() || null
    : null;
  let gpuInfo = null;
  try {
    const browserClient = await browser.newBrowserCDPSession();
    gpuInfo = await browserClient.send('SystemInfo.getInfo');
    await browserClient.detach();
  } catch {
    // Browser-level GPU metadata is optional in some Chromium builds.
  }
  const summary = {
    capturedAt: new Date().toISOString(),
    source: 'google-ai-edge/mediapipe-samples-web Gesture Recognizer',
    durationMs,
    warmupMs,
    useRealGpu,
    headless,
    delegate,
    fallbackWarning,
    gpuDevices: gpuInfo?.gpu?.devices ?? [],
    gpuFeatureStatus: gpuInfo?.gpu?.featureStatus ?? null,
    profile: profileSummary,
    topCpuSelfTime: summarizeCpuProfile(cpuProfile),
    artifacts: {
      samples: path.join(outputDirectory, 'samples.json'),
      cpuProfile: path.join(outputDirectory, 'cpu.cpuprofile'),
      screenshot: path.join(outputDirectory, 'final-screen.png'),
    },
  };
  await writeFile(path.join(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser?.close().catch(() => {});
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
