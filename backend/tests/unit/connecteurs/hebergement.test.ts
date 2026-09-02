import { describe, expect, it } from 'vitest';
import { groupeHebergement, regrouperParHebergement } from '../../../src/connecteurs/hebergement.js';

/**
 * Feature 005 (US3, T013) : classification par groupe d'hébergement,
 * données figées (pas de résolution DNS réelle dans les tests, cf. plan.md).
 */
describe('groupeHebergement', () => {
  it('classe prefecture-57 (Moselle) dans son propre groupe', () => {
    expect(groupeHebergement('prefecture-57')).toBe('moselle');
  });

  it('classe prefecture-75 (Île-de-France, Cloudflare) dans son propre groupe', () => {
    expect(groupeHebergement('prefecture-75')).toBe('ile-de-france');
  });

  it('classe tout autre connecteur dans le groupe mutualisé par défaut', () => {
    expect(groupeHebergement('prefecture-33')).toBe('mutualise');
    expect(groupeHebergement('prefecture-13')).toBe('mutualise');
    expect(groupeHebergement('un-connecteur-inconnu')).toBe('mutualise');
  });
});

describe('regrouperParHebergement', () => {
  it('répartit une liste de connecteurs en 3 files distinctes, ordre préservé au sein de chaque groupe', () => {
    const groupes = regrouperParHebergement(['prefecture-01', 'prefecture-57', 'prefecture-02', 'prefecture-75', 'prefecture-03']);

    expect(groupes.get('mutualise')).toEqual(['prefecture-01', 'prefecture-02', 'prefecture-03']);
    expect(groupes.get('moselle')).toEqual(['prefecture-57']);
    expect(groupes.get('ile-de-france')).toEqual(['prefecture-75']);
  });

  it('ne crée aucune entrée pour un groupe absent de la liste fournie', () => {
    const groupes = regrouperParHebergement(['prefecture-01']);
    expect(groupes.has('moselle')).toBe(false);
    expect(groupes.has('ile-de-france')).toBe(false);
  });
});
