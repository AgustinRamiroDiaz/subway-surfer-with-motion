import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(path.join(rootDir, 'frontend/package.json'));
const { chromium } = require('playwright');
const outputDir = path.resolve(rootDir, process.env.PROFILE_OUTPUT_DIR ?? 'profile-results');
const durationMs = Number.parseInt(process.env.PROFILE_DURATION_MS ?? '30000', 10);
const port = Number.parseInt(process.env.PROFILE_PORT ?? '5173', 10);
const baseUrl = process.env.PROFILE_URL ?? `http://127.0.0.1:${port}`;
const headless = process.env.PROFILE_HEADLESS !== 'false';
const videoFile = process.env.PROFILE_VIDEO_FILE;
const serverMode = process.env.PROFILE_SERVER_MODE ?? 'production';
const shouldBuild = serverMode === 'production' && process.env.PROFILE_SKIP_BUILD !== 'true' && !process.env.PROFILE_URL;
const backend = process.env.PROFILE_BACKEND ?? 'mediapipe';
const mediaPipeDelegate = process.env.PROFILE_MEDIAPIPE_DELEGATE ?? 'GPU';
const mediaPipeModel = process.env.PROFILE_MEDIAPIPE_MODEL ?? 'lite';
const runnerGame = process.env.PROFILE_GAME ?? 'sideways';
const playerCount = Number.parseInt(process.env.PROFILE_PLAYERS ?? '1', 10);
const showCameraPreview = process.env.PROFILE_SHOW_CAMERA_PREVIEW === 'true';
const traceCategories = [
  'devtools.timeline',
  'v8',
  'blink',
  'cc',
  'gpu',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-gpu.device',
  'disabled-by-default-gpu.service',
  'disabled-by-default-memory-infra',
  'disabled-by-default-v8.runtime_stats',
].join(',');

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(check, 500);
      });
      request.setTimeout(1000, () => {
        request.destroy();
      });
    };

    check();
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function startDevServer() {
  if (process.env.PROFILE_URL) {
    return null;
  }

  const viteBin = path.join(
    rootDir,
    'frontend',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  );
  const child = spawn(
    viteBin,
    serverMode === 'production'
      ? ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
      : ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: path.join(rootDir, 'frontend'),
      env: { ...process.env, BROWSER: 'none' },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', (error) => {
    console.error(`Unable to start dev server: ${error.message}`);
  });

  return child;
}

function stopDevServer(child) {
  if (!child) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      if (process.platform === 'win32') {
        child.kill('SIGTERM');
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      resolve();
    }
  });
}

function summarizeCpuProfile(profile) {
  const sampleTimeByNodeId = new Map();
  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];

  for (let index = 0; index < samples.length; index += 1) {
    const nodeId = samples[index];
    const deltaUs = timeDeltas[index] ?? 0;
    sampleTimeByNodeId.set(nodeId, (sampleTimeByNodeId.get(nodeId) ?? 0) + deltaUs / 1000);
  }

  return (profile.nodes ?? [])
    .map((node) => {
      const frame = node.callFrame ?? {};
      return {
        functionName: frame.functionName || '(anonymous)',
        url: frame.url || '',
        lineNumber: typeof frame.lineNumber === 'number' ? frame.lineNumber + 1 : null,
        selfMs: sampleTimeByNodeId.get(node.id) ?? 0,
      };
    })
    .filter((entry) => entry.selfMs > 0)
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, 40);
}

function summarizeHeapSampling(profile) {
  const allocations = new Map();

  const visit = (node) => {
    const frame = node.callFrame ?? {};
    const key = `${frame.functionName || '(anonymous)'}\n${frame.url || ''}\n${frame.lineNumber ?? ''}`;
    const current = allocations.get(key) ?? {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url || '',
      lineNumber: typeof frame.lineNumber === 'number' ? frame.lineNumber + 1 : null,
      selfBytes: 0,
    };
    current.selfBytes += node.selfSize ?? 0;
    allocations.set(key, current);

    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  visit(profile.head);
  return [...allocations.values()]
    .filter((entry) => entry.selfBytes > 0)
    .sort((left, right) => right.selfBytes - left.selfBytes)
    .slice(0, 40);
}

async function readTracingStream(client, streamHandle) {
  const chunks = [];

  while (true) {
    const { data, eof } = await client.send('IO.read', { handle: streamHandle });
    chunks.push(data);
    if (eof) {
      break;
    }
  }

  await client.send('IO.close', { handle: streamHandle });
  return chunks.join('');
}

async function stopTracing(client) {
  const tracingComplete = new Promise((resolve) => {
    client.once('Tracing.tracingComplete', resolve);
  });
  await client.send('Tracing.end');
  const event = await tracingComplete;
  return readTracingStream(client, event.stream);
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  if (shouldBuild) {
    await runCommand('pnpm', ['--filter', '@subway-surfer-with-motion/frontend', 'build']);
  }

  const server = startDevServer();
  try {
    await waitForServer(baseUrl);

    const browserArgs = [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,UseSkiaRenderer',
    ];

    if (videoFile) {
      browserArgs.push(`--use-file-for-fake-video-capture=${path.resolve(videoFile)}`);
    }

    const browser = await chromium.launch({
      headless,
      args: browserArgs,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ['camera'],
    });
    await context.grantPermissions(['camera'], { origin: baseUrl });

    const page = await context.newPage();
    const client = await context.newCDPSession(page);

    await page.addInitScript(
      ({ backend, mediaPipeDelegate, mediaPipeModel, playerCount, runnerGame, showCameraPreview }) => {
        window.localStorage.setItem(
          'motion-runner:detection-preferences:v1',
          JSON.stringify({
            selectedRunnerGameId: runnerGame,
            selectedBackendId: backend,
            selectedModelId: 'onnx-community/yolo26n-pose-ONNX',
            selectedRuntimeId: 'webgpu',
            selectedQuantizationId: 'fp16',
            selectedMediaPipeModelId: mediaPipeModel,
            selectedMediaPipeDelegateId: mediaPipeDelegate,
            playerCount,
            threshold: 0.45,
            cameraMirrored: true,
            showCameraPreview,
            cameraFacingMode: 'user',
            cameraDeviceId: null,
            devCameraMultiplier: 1,
          })
        );
      },
      { backend, mediaPipeDelegate, mediaPipeModel, playerCount, runnerGame, showCameraPreview }
    );

    await client.send('Performance.enable');
    await client.send('Profiler.enable');
    await client.send('HeapProfiler.enable');

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, 'profile-start-screen.png'), fullPage: true });
    await page.locator('.primary-action').click({ timeout: 30000 });
    await page.locator('.timing-panel').waitFor({ timeout: 120000 });

    await client.send('Profiler.start');
    await client.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
    await client.send('Tracing.start', {
      categories: traceCategories,
      options: 'sampling-frequency=10000',
      transferMode: 'ReturnAsStream',
    });

    const metrics = [];
    const metricTimer = setInterval(async () => {
      try {
        const snapshot = await client.send('Performance.getMetrics');
        metrics.push({ capturedAt: Date.now(), metrics: snapshot.metrics });
      } catch {
        // The page may be closing while the timer is in flight.
      }
    }, 1000);

    await page.waitForTimeout(durationMs);
    clearInterval(metricTimer);

    const [cpuProfileResult, heapProfileResult, traceJson, finalMetrics] = await Promise.all([
      client.send('Profiler.stop'),
      client.send('HeapProfiler.stopSampling'),
      stopTracing(client),
      client.send('Performance.getMetrics'),
    ]);

    const screenshotPath = path.join(outputDir, 'profile-final-screen.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await writeFile(path.join(outputDir, 'cpu.cpuprofile'), JSON.stringify(cpuProfileResult.profile));
    await writeFile(path.join(outputDir, 'heap.heapsamplingprofile'), JSON.stringify(heapProfileResult.profile));
    await writeFile(path.join(outputDir, 'trace.json'), traceJson);
    await writeFile(path.join(outputDir, 'performance-metrics.json'), JSON.stringify({ metrics, finalMetrics }, null, 2));

    const summary = {
      capturedAt: new Date().toISOString(),
      durationMs,
      baseUrl,
      headless,
      serverMode,
      fakeCamera: videoFile ? { mode: 'file', videoFile: path.resolve(videoFile) } : { mode: 'generated' },
      preferences: {
        backend,
        mediaPipeDelegate,
        mediaPipeModel,
        runnerGame,
        playerCount,
        showCameraPreview,
      },
      topCpuSelfTime: summarizeCpuProfile(cpuProfileResult.profile),
      topHeapSelfBytes: summarizeHeapSampling(heapProfileResult.profile),
      artifacts: {
        cpuProfile: path.join(outputDir, 'cpu.cpuprofile'),
        heapProfile: path.join(outputDir, 'heap.heapsamplingprofile'),
        trace: path.join(outputDir, 'trace.json'),
        performanceMetrics: path.join(outputDir, 'performance-metrics.json'),
        screenshot: screenshotPath,
        startupScreenshot: path.join(outputDir, 'profile-start-screen.png'),
      },
    };

    await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));

    await browser.close();
  } finally {
    await stopDevServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
