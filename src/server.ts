import { createApp } from './app.js';
import { env } from './config/env.js';
import { delhiveryBootSummary } from './lib/delhivery/config.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`✅ ODI API running at http://localhost:${env.port} (${env.nodeEnv})`);
  console.log(`   ${delhiveryBootSummary()}`);
});

let shuttingDown = false;

function shutdown(reason: string, exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${reason} received, shutting down…`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out; closing remaining connections');
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close((error) => {
    clearTimeout(forceExitTimer);
    if (error) {
      console.error('Error while closing HTTP server:', error);
      process.exit(1);
    }
    process.exit(exitCode);
  });
}

// Graceful shutdown so in-flight requests finish on deploys/restarts.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => shutdown(signal, 0));
}

process.once('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});

process.once('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection', 1);
});
