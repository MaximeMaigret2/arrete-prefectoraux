import { describe, expect, it } from 'vitest';
import { resolveEtatDepuisSegments } from '../../src/services/resolveEtatDepuisSegments.js';
import type { DepartementEtatsPeriode } from '../../src/services/apiClient.js';

function makeDept(overrides: Partial<DepartementEtatsPeriode> & Pick<DepartementEtatsPeriode, 'code' | 'segments'>): DepartementEtatsPeriode {
  return {
    nom: `Departement ${overrides.code}`,
    connecteur_id: `prefecture-${overrides.code}`,
    derniere_collecte: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveEtatDepuisSegments', () => {
  it('retrouve le bon segment pour une date au milieu d’un segment', () => {
    const departements: DepartementEtatsPeriode[] = [
      makeDept({
        code: '77',
        segments: [
          { date_debut: '2026-05-01', date_fin: '2026-05-15', etat: 'rouge', evenement_applicable: null, dernier_arrete_connu: null },
          { date_debut: '2026-05-16', date_fin: '2026-05-31', etat: 'vert', evenement_applicable: null, dernier_arrete_connu: null },
        ],
      }),
    ];

    const resultAvant = resolveEtatDepuisSegments(departements, '2026-05-10');
    expect(resultAvant.get('77')?.etat).toBe('rouge');

    const resultApres = resolveEtatDepuisSegments(departements, '2026-05-20');
    expect(resultApres.get('77')?.etat).toBe('vert');
  });

  it('retrouve le bon segment aux bornes exactes (date_debut et date_fin inclusives)', () => {
    const departements: DepartementEtatsPeriode[] = [
      makeDept({
        code: '77',
        segments: [
          { date_debut: '2026-05-01', date_fin: '2026-05-15', etat: 'rouge', evenement_applicable: null, dernier_arrete_connu: null },
          { date_debut: '2026-05-16', date_fin: '2026-05-31', etat: 'vert', evenement_applicable: null, dernier_arrete_connu: null },
        ],
      }),
    ];

    expect(resolveEtatDepuisSegments(departements, '2026-05-01').get('77')?.etat).toBe('rouge');
    expect(resolveEtatDepuisSegments(departements, '2026-05-15').get('77')?.etat).toBe('rouge');
    expect(resolveEtatDepuisSegments(departements, '2026-05-16').get('77')?.etat).toBe('vert');
    expect(resolveEtatDepuisSegments(departements, '2026-05-31').get('77')?.etat).toBe('vert');
  });

  it('reporte connecteur_id/derniere_collecte du département sur le DepartementState retourné, jamais depuis le segment', () => {
    const departements: DepartementEtatsPeriode[] = [
      makeDept({
        code: '13',
        connecteur_id: 'prefecture-13',
        derniere_collecte: '2026-08-20T20:11:35.805Z',
        segments: [
          { date_debut: '2026-05-01', date_fin: '2026-05-31', etat: 'vert', evenement_applicable: null, dernier_arrete_connu: null },
        ],
      }),
    ];

    const result = resolveEtatDepuisSegments(departements, '2026-05-15').get('13');
    expect(result?.connecteur_id).toBe('prefecture-13');
    expect(result?.derniere_collecte).toBe('2026-08-20T20:11:35.805Z');
  });

  it('replie sur un état "gris" neutre si aucun segment ne matche (garde-fou, ne devrait pas arriver)', () => {
    const departements: DepartementEtatsPeriode[] = [
      makeDept({
        code: '2A',
        segments: [
          { date_debut: '2026-05-01', date_fin: '2026-05-15', etat: 'vert', evenement_applicable: null, dernier_arrete_connu: null },
        ],
      }),
    ];

    const result = resolveEtatDepuisSegments(departements, '2026-06-01').get('2A');
    expect(result?.etat).toBe('gris');
    expect(result?.evenement_applicable).toBeNull();
    expect(result?.dernier_arrete_connu).toBeNull();
  });
});
