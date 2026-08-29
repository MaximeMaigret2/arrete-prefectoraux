import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Sans `globals: true` dans vitest.config.ts, @testing-library/react ne
// détecte pas `afterEach` globalement et n'enregistre pas son nettoyage
// automatique du DOM entre tests — chaque `render()` s'accumule alors dans
// le même document jsdom au sein d'un même fichier de test. Invisible tant
// qu'un fichier ne contenait qu'un seul `render()` (Legend.test.tsx),
// révélé par Tooltip.test.tsx (feature 004, plusieurs render() dans le
// même describe). Nettoyage explicite, sans dépendre de `globals`.
afterEach(() => {
  cleanup();
});
