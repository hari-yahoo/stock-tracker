import { spawn } from 'node:child_process';

const processes = [
  ['backend', ['run', 'dev:backend']],
  ['frontend', ['run', 'dev:frontend']],
].map(([name, args]) => ({
  name,
  process: spawn('npm', args, {
    stdio: 'inherit',
    // Give each workspace its own process group so its watcher and children
    // shut down together when the other workspace exits.
    detached: process.platform !== 'win32',
  }),
}));

let shuttingDown = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (child.process.killed || child.process.exitCode !== null) continue;

    if (process.platform === 'win32') {
      child.process.kill(signal);
    } else {
      try {
        process.kill(-child.process.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
}

for (const child of processes) {
  child.process.on('error', (error) => {
    console.error(`Failed to start ${child.name}:`, error);
    process.exitCode = 1;
    shutdown();
  });

  child.process.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`${child.name} exited with ${signal ?? `code ${code}`}.`);
      process.exitCode = code ?? 1;
    }
    shutdown();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
