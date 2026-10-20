import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Chaque fichier de test démarre avec une base D1 locale isolée, migrée et pré-remplie
// avec les deux dossiers de démonstration (D-1000 et D-1001).
await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS);
