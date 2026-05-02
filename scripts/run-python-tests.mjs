import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const candidates = [
  process.env.PYTHON,
  path.join(root, '.venv', 'Scripts', 'python.exe'),
  path.join(root, '.venv', 'bin', 'python'),
  'python',
].filter(Boolean);

function resolvePython() {
  for (const candidate of candidates) {
    if (candidate === 'python' || existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python';
}

const pythonExec = resolvePython();
const extraArgs = process.argv.slice(2);
const args = ['-m', 'pytest', 'local-whisper/tests', 'local-translate/tests', ...extraArgs];

const child = spawn(pythonExec, args, {
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error(`Failed to launch Python executable (${pythonExec}):`, error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});
