/**
 * Entry point - Document Module Auth Service (TypeScript)
 * @file backend/src/index.ts:1
 */
import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`[auth-service] running on port ${env.port} in ${env.nodeEnv} mode`);
});
