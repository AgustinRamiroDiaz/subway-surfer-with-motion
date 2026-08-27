import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const sourceImage = path.join(rootDirectory, 'frontend/e2e/fixtures/hand-rhythm-palms.png');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDirectory, env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

export async function generateFakeHandVideo(outputFile, durationSeconds) {
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-loop', '1',
    '-i', sourceImage,
    '-vf', "scale=352:264,crop=320:240:x='16+12*sin(n/24)':y='12+8*cos(n/31)',fps=15,format=yuv420p",
    '-t', String(durationSeconds),
    '-f', 'yuv4mpegpipe',
    '-y', outputFile,
  ]);
}
