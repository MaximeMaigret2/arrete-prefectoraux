import { describe, expect, it } from 'vitest';
import { decalerAnneeMois, parisAnneeMoisCourant, parisAnneeMoisDecale } from '../../src/services/parisDate.js';

/**
 * Feature 005 (US1, T002) : couverture du décalage de mois cible arbitraire
 * (`decalerAnneeMois`/`parisAnneeMoisDecale`) — franchissement d'année,
 * décalage nul (non-régression, FR-002), décalage arbitrairement grand.
 * Les fonctions préexistantes (`parisDayStartUTC`, etc.) ne sont pas
 * concernées par cette feature et restent hors périmètre de ce fichier.
 */
describe('decalerAnneeMois', () => {
  it('décalage nul retourne le même couple année/mois (FR-002, non-régression)', () => {
    expect(decalerAnneeMois({ annee: '2026', moisNumero: '08' }, 0)).toEqual({ annee: '2026', moisNumero: '08' });
  });

  it('décalage simple, sans franchissement d\'année', () => {
    expect(decalerAnneeMois({ annee: '2026', moisNumero: '08' }, 3)).toEqual({ annee: '2026', moisNumero: '05' });
  });

  it('franchit une frontière d\'année', () => {
    expect(decalerAnneeMois({ annee: '2026', moisNumero: '02' }, 3)).toEqual({ annee: '2025', moisNumero: '11' });
  });

  it('franchit plusieurs frontières d\'année (décalage arbitrairement grand)', () => {
    expect(decalerAnneeMois({ annee: '2026', moisNumero: '08' }, 30)).toEqual({ annee: '2024', moisNumero: '02' });
  });

  it('un décalage négatif avance dans le temps (symétrique)', () => {
    expect(decalerAnneeMois({ annee: '2026', moisNumero: '11' }, -3)).toEqual({ annee: '2027', moisNumero: '02' });
  });
});

describe('parisAnneeMoisDecale', () => {
  it('décalage nul équivaut à parisAnneeMoisCourant (FR-002)', () => {
    const maintenant = new Date(Date.UTC(2026, 7, 13, 10, 0, 0));
    expect(parisAnneeMoisDecale(maintenant, 0)).toEqual(parisAnneeMoisCourant(maintenant));
  });

  it('décale correctement depuis un instant UTC de référence, franchissement d\'année inclus', () => {
    const maintenant = new Date(Date.UTC(2026, 1, 10, 10, 0, 0)); // février 2026, Europe/Paris
    expect(parisAnneeMoisDecale(maintenant, 30)).toEqual({ annee: '2023', moisNumero: '08' });
  });
});
