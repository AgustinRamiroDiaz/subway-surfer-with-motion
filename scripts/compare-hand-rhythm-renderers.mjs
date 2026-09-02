import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const comparisonDirectory = path.resolve(
  rootDirectory,
  process.env.PROFILE_COMPARISON_OUTPUT_DIR ?? 'profile-results-renderers'
);
const renderers = (process.env.PROFILE_RENDERER_ORDER ?? 'three,canvas2d').split(',');
if (renderers.length !== 2 || !renderers.includes('three') || !renderers.includes('canvas2d')) {
  throw new Error('PROFILE_RENDERER_ORDER must contain three and canvas2d exactly once.');
}

function run(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

function metric(summary, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], summary) ?? null;
}

function percentChange(baseline, candidate) {
  return Number.isFinite(baseline) && baseline !== 0 && Number.isFinite(candidate)
    ? (candidate - baseline) / baseline * 100
    : null;
}

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

await mkdir(comparisonDirectory, { recursive: true });
const summaries = {};
for (let index = 0; index < renderers.length; index += 1) {
  const renderer = renderers[index];
  const outputDirectory = path.join(comparisonDirectory, renderer);
  await run(process.execPath, [path.join(scriptDirectory, 'benchmark-hand-rhythm-e2e.mjs')], {
    ...process.env,
    PROFILE_HAND_RHYTHM_RENDERER: renderer,
    PROFILE_OUTPUT_DIR: outputDirectory,
    PROFILE_PORT: String(Number.parseInt(process.env.PROFILE_PORT ?? '5173', 10) + index),
    PROFILE_SKIP_BUILD: index === 0 ? process.env.PROFILE_SKIP_BUILD ?? 'false' : 'true',
  });
  summaries[renderer] = JSON.parse(await readFile(path.join(outputDirectory, 'summary.json'), 'utf8'));
}

const metricDefinitions = [
  ['Detector throughput', ['handRhythmPerformance', 'detectionFramesPerSecond'], 'FPS'],
  ['MediaPipe inference p50', ['handRhythmPerformance', 'stages', 'model', 'p50'], 'ms'],
  ['MediaPipe inference p95', ['handRhythmPerformance', 'stages', 'model', 'p95'], 'ms'],
  ['Input-to-render p50', ['handRhythmPerformance', 'inputToRenderMs', 'p50'], 'ms'],
  ['Input-to-render p95', ['handRhythmPerformance', 'inputToRenderMs', 'p95'], 'ms'],
  ['Render CPU p50', ['handRhythmPerformance', 'stages', 'renderCpu', 'p50'], 'ms'],
  ['Render CPU p95', ['handRhythmPerformance', 'stages', 'renderCpu', 'p95'], 'ms'],
  ['Render interval p50', ['handRhythmPerformance', 'renderFrameIntervalMs', 'p50'], 'ms'],
];

const comparison = metricDefinitions.map(([name, metricPath, unit]) => {
  const three = metric(summaries.three, metricPath);
  const canvas2d = metric(summaries.canvas2d, metricPath);
  return { name, unit, three, canvas2d, canvas2dChangePercent: percentChange(three, canvas2d) };
});
const result = {
  capturedAt: new Date().toISOString(),
  controlledSettings: {
    durationMs: summaries.three.durationMs,
    warmupMs: summaries.three.warmupMs,
    renderFps: summaries.three.preferences.renderFps,
    playerCount: summaries.three.preferences.playerCount,
    mediaPipeModel: summaries.three.preferences.mediaPipeModel,
    mediaPipeDelegate: summaries.three.preferences.mediaPipeDelegate,
    showCameraPreview: summaries.three.preferences.showCameraPreview,
  },
  comparison,
  sourceSummaries: {
    three: path.join(comparisonDirectory, 'three', 'summary.json'),
    canvas2d: path.join(comparisonDirectory, 'canvas2d', 'summary.json'),
  },
};

await writeFile(path.join(comparisonDirectory, 'comparison.json'), JSON.stringify(result, null, 2));
const markdown = [
  '# Hand Rhythm renderer comparison',
  '',
  `Captured ${result.capturedAt} with the same mocked camera, MediaPipe settings, ${result.controlledSettings.renderFps} FPS render cap, ${result.controlledSettings.warmupMs} ms warm-up, and ${result.controlledSettings.durationMs} ms measurement window.`,
  '',
  '| Metric | Three.js 3D | Canvas 2D | Canvas change |',
  '| --- | ---: | ---: | ---: |',
  ...comparison.map((row) => `| ${row.name} | ${format(row.three)} ${row.unit} | ${format(row.canvas2d)} ${row.unit} | ${format(row.canvas2dChangePercent, 1)}% |`),
  '',
  'Negative changes mean Canvas 2D measured lower than Three.js. For latency and CPU metrics, lower is better; for throughput, higher is better.',
  '',
].join('\n');
await writeFile(path.join(comparisonDirectory, 'comparison.md'), markdown);
console.log(markdown);
