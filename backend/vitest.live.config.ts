import { defineConfig } from 'vitest/config';

/**
 * Config Vitest séparée pour les tests de dérive (Phase 5bis, V006) —
 * `backend/tests/live/**`. Ces tests font un VRAI appel réseau vers les
 * sites des préfectures pour vérifier que leur structure HTML n'a pas
 * changé depuis la fixture capturée (cf. `tests/fixtures/connecteurs/reel/`).
 *
 * Jamais inclus dans `vitest.config.ts` (voir son `exclude`), jamais lancé
 * par `npm test`/`test:unit`/`test:contract`/`test:integration`, jamais par
 * une CI — uniquement via `npm run test:live-drift`, déclenché à la main
 * par un opérateur (cf. backend/README.md). Ils n'affirment RIEN sur le
 * contenu réel (qui change en permanence et n'est pas sous notre contrôle),
 * seulement sur des propriétés structurelles (sélecteurs présents, lien PDF
 * toujours au bon format, page toujours accessible) — un échec signale une
 * dérive à investiguer, pas un contenu inattendu.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 30_000,
    env: {
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'test-admin-password-not-for-production',
    },
  },
});
