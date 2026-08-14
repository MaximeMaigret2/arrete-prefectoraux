import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `tests/live/**` (Phase 5bis, V006) contient des tests de dérive qui
    // font un VRAI appel réseau vers les sites préfecture — jamais exécutés
    // par `npm test`/`test:unit`/`test:contract`/`test:integration` ni par
    // aucune CI. Seul `vitest.live.config.ts` (`npm run test:live-drift`,
    // déclenchement manuel uniquement) les inclut.
    exclude: [...configDefaults.exclude, 'tests/live/**'],
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
