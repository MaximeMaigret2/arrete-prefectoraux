import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
