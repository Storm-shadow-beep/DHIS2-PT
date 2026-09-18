/**
 * Entry point - Document Module Auth Service (TypeScript)
 * @file backend/src/index.ts:1
 */
import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { env } from './config/env';
import { seedDefaultAdmin, seedDefaultProjectManager } from './db/seed-default-manager';

void (async () => {
  try {
    if (env.skipSeed) {
      console.log('[auth-service] SKIP_SEED=true, skipping default account seeding');
    } else {
      // Seeding is best-effort: each seeder already skips when the role
      // exists in the DB, and a seeding failure (e.g. transient DB blip)
      // must not prevent the server from starting.
      try {
        await seedDefaultAdmin();
      } catch (error: unknown) {
        console.error('[auth-service] admin seed warning (continuing startup):', error);
      }
      try {
        await seedDefaultProjectManager();
      } catch (error: unknown) {
        console.error('[auth-service] project manager seed warning (continuing startup):', error);
      }
    }
    app.listen(env.port, () => {
      console.log(`[auth-service] running on port ${env.port} in ${env.nodeEnv} mode`);
    });
  } catch (error: unknown) {
    console.error('[auth-service] startup failed:', error);
    process.exitCode = 1;
  }
})();
