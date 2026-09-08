/**
 * Entry point - Document Module Auth Service (TypeScript)
 * @file backend/src/index.ts:1
 */
import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { env } from './config/env';
import { seedDefaultProjectManager } from './db/seed-default-manager';

void seedDefaultProjectManager()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`[auth-service] running on port ${env.port} in ${env.nodeEnv} mode`);
    });
  })
  .catch((error: unknown) => {
    console.error('[auth-service] startup failed:', error);
    process.exitCode = 1;
  });
