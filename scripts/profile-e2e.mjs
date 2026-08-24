import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(path.join(rootDir, 'frontend/package.json'));
const { chromium } = require('playwright');
const outputDir = path.resolve(rootDir, process.env.PROFILE_OUTPUT_DIR ?? 'profile-results');
const durationMs = Number.parseInt(process.env.PROFILE_DURATION_MS ?? '30000', 10);
const osSampleIntervalMs = Number.parseInt(process.env.PROFILE_OS_SAMPLE_INTERVAL_MS ?? '500', 10);
const port = Number.parseInt(process.env.PROFILE_PORT ?? '5173', 10);
const baseUrl = process.env.PROFILE_URL ?? `http://127.0.0.1:${port}`;
const useRealGpu = process.env.PROFILE_REAL_GPU === 'true';
const headless = useRealGpu ? process.env.PROFILE_HEADLESS === 'true' : process.env.PROFILE_HEADLESS !== 'false';
const browserChannel = process.env.PROFILE_BROWSER_CHANNEL ?? (useRealGpu ? 'chrome' : undefined);
const glBackend = process.env.PROFILE_GL_BACKEND;
const disableSoftwareRasterizer = process.env.PROFILE_DISABLE_SOFTWARE_RASTERIZER === 'true';
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
const clockTicksPerSecond = Number.parseInt(process.env.PROFILE_CLK_TCK ?? '100', 10);
const pageSizeBytes = Number.parseInt(process.env.PROFILE_PAGE_SIZE_BYTES ?? '4096', 10);

function parseProcStat(stat) {
  const openParenIndex = stat.indexOf('(');
  const closeParenIndex = stat.lastIndexOf(')');

  if (openParenIndex === -1 || closeParenIndex === -1) {
    return null;
  }

  const pid = Number.parseInt(stat.slice(0, openParenIndex).trim(), 10);
  const comm = stat.slice(openParenIndex + 1, closeParenIndex);
  const fields = stat.slice(closeParenIndex + 2).trim().split(/\s+/);

  return {
    pid,
    comm,
    state: fields[0],
    ppid: Number.parseInt(fields[1], 10),
    utimeTicks: Number.parseInt(fields[11], 10),
    stimeTicks: Number.parseInt(fields[12], 10),
    rssBytes: Number.parseInt(fields[21], 10) * pageSizeBytes,
  };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readProcStat(pid, tid = null) {
  const statPath =
    tid === null ? `/proc/${pid}/stat` : `/proc/${pid}/task/${tid}/stat`;
  const stat = await readTextIfExists(statPath);
  return stat ? parseProcStat(stat) : null;
}

async function readCmdline(pid) {
  const cmdline = await readTextIfExists(`/proc/${pid}/cmdline`);
  return cmdline ? cmdline.replaceAll('\0', ' ').trim() : '';
}

async function findChromiumPids() {
  const allPids = await listNumericProcDirs('/proc');
  const chromiumPids = [];

  await Promise.all(
    allPids.map(async (pid) => {
      const cmdline = await readCmdline(pid);
      if (/\b(chrome|chromium)\b/i.test(cmdline) || /\/(chrome|chromium)(\s|$)/i.test(cmdline)) {
        chromiumPids.push(pid);
      }
    })
  );

  return chromiumPids.sort((left, right) => left - right);
}

async function readStatusName(pid, tid = null) {
  const statusPath =
    tid === null ? `/proc/${pid}/status` : `/proc/${pid}/task/${tid}/status`;
  const status = await readTextIfExists(statusPath);
  const name = status?.match(/^Name:\s+(.+)$/m)?.[1];
  return name ?? '';
}

async function readSmapsRollup(pid) {
  const smaps = await readTextIfExists(`/proc/${pid}/smaps_rollup`);

  if (!smaps) {
    return null;
  }

  const getKb = (label) => {
    const match = smaps.match(new RegExp(`^${label}:\\s+(\\d+) kB$`, 'm'));
    return match ? Number.parseInt(match[1], 10) : 0;
  };

  return {
    rssBytes: getKb('Rss') * 1024,
    pssBytes: getKb('Pss') * 1024,
    privateCleanBytes: getKb('Private_Clean') * 1024,
    privateDirtyBytes: getKb('Private_Dirty') * 1024,
    sharedCleanBytes: getKb('Shared_Clean') * 1024,
    sharedDirtyBytes: getKb('Shared_Dirty') * 1024,
  };
}

async function listNumericProcDirs(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number.parseInt(entry.name, 10));
  } catch {
    return [];
  }
}

async function findDescendantPids(rootPid) {
  const allPids = await listNumericProcDirs('/proc');
  const parentByPid = new Map();

  await Promise.all(
    allPids.map(async (pid) => {
      const stat = await readProcStat(pid);
      if (stat) {
        parentByPid.set(pid, stat.ppid);
      }
    })
  );

  const descendants = new Set([rootPid]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const [pid, ppid] of parentByPid) {
      if (!descendants.has(pid) && descendants.has(ppid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }

  return [...descendants].sort((left, right) => left - right);
}

async function captureOsResourceSnapshot(rootPid) {
  const capturedAt = Date.now();
  const pids = await findDescendantPids(rootPid);
  const processes = [];

  for (const pid of pids) {
    const [stat, cmdline, smapsRollup, threadIds] = await Promise.all([
      readProcStat(pid),
      readCmdline(pid),
      readSmapsRollup(pid),
      listNumericProcDirs(`/proc/${pid}/task`),
    ]);

    if (!stat) {
      continue;
    }

    const threads = [];
    for (const tid of threadIds) {
      const [threadStat, threadName] = await Promise.all([readProcStat(pid, tid), readStatusName(pid, tid)]);
      if (threadStat) {
        threads.push({
          tid,
          name: threadName || threadStat.comm,
          state: threadStat.state,
          cpuTimeMs: ((threadStat.utimeTicks + threadStat.stimeTicks) * 1000) / clockTicksPerSecond,
          userTimeMs: (threadStat.utimeTicks * 1000) / clockTicksPerSecond,
          systemTimeMs: (threadStat.stimeTicks * 1000) / clockTicksPerSecond,
        });
      }
    }

    processes.push({
      pid,
      ppid: stat.ppid,
      name: stat.comm,
      cmdline,
      cpuTimeMs: ((stat.utimeTicks + stat.stimeTicks) * 1000) / clockTicksPerSecond,
      userTimeMs: (stat.utimeTicks * 1000) / clockTicksPerSecond,
      systemTimeMs: (stat.stimeTicks * 1000) / clockTicksPerSecond,
      rssBytes: smapsRollup?.rssBytes ?? stat.rssBytes,
      pssBytes: smapsRollup?.pssBytes ?? null,
      memory: smapsRollup,
      threadCount: threads.length,
      threads: threads.sort((left, right) => left.tid - right.tid),
    });
  }

  return { capturedAt, rootPid, processes };
}

async function captureOsResourceSnapshotForRoots(roots) {
  const snapshots = await Promise.all(
    roots.map(async (root) => ({
      ...root,
      snapshot: await captureOsResourceSnapshot(root.pid),
    }))
  );
  const capturedAt = Date.now();
  const processByPid = new Map();

  for (const rootSnapshot of snapshots) {
    for (const processInfo of rootSnapshot.snapshot.processes) {
      const existing = processByPid.get(processInfo.pid);
      if (existing) {
        if (!existing.roots.includes(rootSnapshot.label)) {
          existing.roots.push(rootSnapshot.label);
        }
      } else {
        processByPid.set(processInfo.pid, {
          ...processInfo,
          roots: [rootSnapshot.label],
        });
      }
    }
  }

  return {
    capturedAt,
    roots: roots.map((root) => ({ label: root.label, pid: root.pid })),
    processes: [...processByPid.values()].sort((left, right) => left.pid - right.pid),
  };
}

function summarizeOsResourceSamples(samples) {
  const firstByThread = new Map();
  const lastByThread = new Map();
  const processPeaks = new Map();
  let peakTotalRssBytes = 0;
  let peakTotalPssBytes = 0;
  const sampleDurationMs =
    samples.length > 1 ? samples[samples.length - 1].capturedAt - samples[0].capturedAt : 0;

  for (const sample of samples) {
    let totalRssBytes = 0;
    let totalPssBytes = 0;

    for (const processInfo of sample.processes) {
      totalRssBytes += processInfo.rssBytes ?? 0;
      totalPssBytes += processInfo.pssBytes ?? 0;

      const existingPeak = processPeaks.get(processInfo.pid);
      if (!existingPeak || (processInfo.rssBytes ?? 0) > existingPeak.peakRssBytes) {
        processPeaks.set(processInfo.pid, {
          pid: processInfo.pid,
          roots: processInfo.roots,
          name: processInfo.name,
          cmdline: processInfo.cmdline,
          peakRssBytes: processInfo.rssBytes ?? 0,
          peakPssBytes: processInfo.pssBytes,
          peakThreadCount: processInfo.threadCount,
        });
      }

      for (const thread of processInfo.threads) {
        const key = `${processInfo.pid}:${thread.tid}`;
        const entry = {
          pid: processInfo.pid,
          tid: thread.tid,
          roots: processInfo.roots,
          processName: processInfo.name,
          threadName: thread.name,
          cmdline: processInfo.cmdline,
          cpuTimeMs: thread.cpuTimeMs,
          userTimeMs: thread.userTimeMs,
          systemTimeMs: thread.systemTimeMs,
        };

        if (!firstByThread.has(key)) {
          firstByThread.set(key, entry);
        }
        lastByThread.set(key, entry);
      }
    }

    peakTotalRssBytes = Math.max(peakTotalRssBytes, totalRssBytes);
    peakTotalPssBytes = Math.max(peakTotalPssBytes, totalPssBytes);
  }

  const threads = [];
  for (const [key, last] of lastByThread) {
    const first = firstByThread.get(key);
    if (!first) {
      continue;
    }

    threads.push({
      pid: last.pid,
      tid: last.tid,
      roots: last.roots,
      processName: last.processName,
      threadName: last.threadName,
      cpuMs: Math.max(0, last.cpuTimeMs - first.cpuTimeMs),
      userMs: Math.max(0, last.userTimeMs - first.userTimeMs),
      systemMs: Math.max(0, last.systemTimeMs - first.systemTimeMs),
      averageCpuPercent:
        sampleDurationMs > 0 ? (Math.max(0, last.cpuTimeMs - first.cpuTimeMs) / sampleDurationMs) * 100 : 0,
      cmdline: last.cmdline,
    });
  }

  const totalCpuMs = threads.reduce((sum, thread) => sum + thread.cpuMs, 0);

  return {
    sampleCount: samples.length,
    sampleDurationMs,
    clockTicksPerSecond,
    pageSizeBytes,
    totalThreadCpuMs: totalCpuMs,
    averageCpuCores: sampleDurationMs > 0 ? totalCpuMs / sampleDurationMs : 0,
    peakTotalRssBytes,
    peakTotalPssBytes: peakTotalPssBytes || null,
    topThreadsByCpu: threads.sort((left, right) => right.cpuMs - left.cpuMs).slice(0, 40),
    topProcessesByPeakRss: [...processPeaks.values()].sort((left, right) => right.peakRssBytes - left.peakRssBytes).slice(0, 20),
    note: 'Linux reports CPU time per thread. Memory is reported per process/address space because threads share most mappings.',
  };
}

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

async function collectGpuInfo(browser) {
  if (typeof browser.newBrowserCDPSession !== 'function') {
    return { error: 'Browser-level CDP session is not available.' };
  }

  const browserClient = await browser.newBrowserCDPSession();
  try {
    return await browserClient.send('SystemInfo.getInfo');
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    await browserClient.detach();
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  if (shouldBuild) {
    await runCommand('pnpm', ['--filter', '@webcam-motion-games/frontend', 'build']);
  }

  const server = startDevServer();
  try {
    await waitForServer(baseUrl);

    const browserArgs = [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ];

    if (useRealGpu) {
      browserArgs.push(
        '--ignore-gpu-blocklist',
        '--enable-gpu',
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--enable-accelerated-video-decode',
        '--ozone-platform=x11'
      );
      if (glBackend) {
        browserArgs.push(`--use-gl=${glBackend}`);
      }
      if (disableSoftwareRasterizer) {
        browserArgs.push('--disable-software-rasterizer');
      }
    } else {
      browserArgs.push('--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer');
    }

    if (videoFile) {
      browserArgs.push(`--use-file-for-fake-video-capture=${path.resolve(videoFile)}`);
    }

    const chromiumPidBaseline = new Set(await findChromiumPids());
    const browser = await chromium.launch({
      headless,
      channel: browserChannel,
      args: browserArgs,
    });
    const gpuInfo = await collectGpuInfo(browser);
    const getOsProfileRoots = async () => [
      ...(server ? [{ label: 'vite-preview-server', pid: server.pid }] : []),
      ...(await findChromiumPids())
        .filter((pid) => !chromiumPidBaseline.has(pid))
        .map((pid) => ({ label: 'chromium-browser-tree', pid })),
    ];
    const osResourceSamples = [];
    let osSamplerRunning = false;
    const captureOsSample = async () => {
      const osProfileRoots = await getOsProfileRoots();
      if (osSamplerRunning || osProfileRoots.length === 0) {
        return;
      }

      osSamplerRunning = true;
      try {
        osResourceSamples.push(await captureOsResourceSnapshotForRoots(osProfileRoots));
      } catch (error) {
        osResourceSamples.push({
          capturedAt: Date.now(),
          roots: osProfileRoots,
          error: error instanceof Error ? error.message : String(error),
          processes: [],
        });
      } finally {
        osSamplerRunning = false;
      }
    };
    const osSampleTimer = setInterval(captureOsSample, osSampleIntervalMs);
    await captureOsSample();

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
    clearInterval(osSampleTimer);
    await captureOsSample();

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
    await writeFile(path.join(outputDir, 'gpu-info.json'), JSON.stringify(gpuInfo, null, 2));
    await writeFile(
      path.join(outputDir, 'os-process-thread-samples.json'),
      JSON.stringify(osResourceSamples, null, 2)
    );

    const summary = {
      capturedAt: new Date().toISOString(),
      durationMs,
      baseUrl,
      headless,
      browserChannel,
      useRealGpu,
      glBackend,
      disableSoftwareRasterizer,
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
      gpuInfoSummary: {
        featureStatus: gpuInfo.gpu?.featureStatus ?? null,
        devices: gpuInfo.gpu?.devices?.map((device) => ({
          vendorId: device.vendorId,
          deviceId: device.deviceId,
          vendorString: device.vendorString,
          deviceString: device.deviceString,
          driverVendor: device.driverVendor,
          driverVersion: device.driverVersion,
        })) ?? null,
        auxAttributes: gpuInfo.gpu?.auxAttributes ?? null,
        error: gpuInfo.error,
      },
      osResourceSummary: summarizeOsResourceSamples(osResourceSamples),
      topCpuSelfTime: summarizeCpuProfile(cpuProfileResult.profile),
      topHeapSelfBytes: summarizeHeapSampling(heapProfileResult.profile),
      artifacts: {
        osProcessThreadSamples: path.join(outputDir, 'os-process-thread-samples.json'),
        cpuProfile: path.join(outputDir, 'cpu.cpuprofile'),
        heapProfile: path.join(outputDir, 'heap.heapsamplingprofile'),
        trace: path.join(outputDir, 'trace.json'),
        performanceMetrics: path.join(outputDir, 'performance-metrics.json'),
        gpuInfo: path.join(outputDir, 'gpu-info.json'),
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
