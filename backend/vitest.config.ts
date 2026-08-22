import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Beaucoup de suites (tests/unit/connecteurs, tests/integration/connecteurs) lisent/écrivent
    // les VRAIS fichiers src/data/*.json (connecteurs.json, executions.json, anomalies.json,
    // events/*.json) via un patron snapshot (beforeEach) + restauration (afterEach). Ce patron
    // suppose une exécution séquentielle des fichiers de test : en parallèle, plusieurs suites
    // écrivent en même temps sur les mêmes fichiers réels et se corrompent mutuellement
    // (JSON tronqué / concaténé), faisant échouer des suites sans rapport. Vitest exécutant les
    // fichiers de test en parallèle par défaut, on désactive ce parallélisme ici.
    fileParallelism: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `tests/live/**` (Phase 5bis, V006) contient des tests de dérive qui
    // font un VRAI appel réseau vers les sites préfecture — jamais exécutés
    // par `npm test`/`test:unit`/`test:contract`/`test:integration` ni par
    // aucune CI. Seul `vitest.live.config.ts` (`npm run test:live-drift`,
    // déclenchement manuel uniquement) les inclut.
    exclude: [...configDefaults.exclude, 'tests/live/**', '**/_to_delete/**', '**/_archive/**'],
    // Identifiants admin de test uniquement (research.md §7, FR-015) :
    // `buildApp()` échoue si ADMIN_USERNAME/ADMIN_PASSWORD sont absents
    // (routes/admin/auth.ts) — jamais de valeur par défaut dans le code
    // applicatif lui-même, y compris pour les tests.
    env: {
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'test-admin-password-not-for-production',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
