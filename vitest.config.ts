import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // Identité de démonstration activée pour les tests (secret aléatoire à chaque lancement)
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, DEMO_IDENTITY: 'enabled', DEMO_SECRET: randomBytes(24).toString('hex') } },
      }),
    ],
    test: {
      include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
      setupFiles: ['./tests/api/apply-migrations.ts'],
    },
  };
});
