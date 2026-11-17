import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Lets `npm test` pick up TEST_DATABASE_URL from the repo's .env without a wrapper script.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The integration suite shares one database, so test files run one at a time.
    fileParallelism: false,
  },
});
