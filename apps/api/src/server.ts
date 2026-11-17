import { pino } from 'pino';
import { buildApp } from './app';
import { loadConfig } from './config/env';
import { installLocalProxy } from './infra/localProxy';
import { createProductionDeps } from './infra/productionDeps';

/** Long enough for an in-flight estimate (two 12 s attempts) to finish before we give up. */
const SHUTDOWN_GRACE_MS = 30_000;

async function main(): Promise<void> {
  const config = loadConfig();
  // Request logs carry method, path, status and timing. Bodies and headers are never logged.
  const logger = pino({ level: config.logLevel });

  if (installLocalProxy()) logger.info('outbound requests use the local HTTPS proxy');

  const app = await buildApp(createProductionDeps(config, logger));

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => {
      logger.error('shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();
    // Stops accepting connections, waits for in-flight requests, then runs onClose hooks.
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error({ err }, 'error during shutdown');
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  // Config errors name variables only, so this is safe to print.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
