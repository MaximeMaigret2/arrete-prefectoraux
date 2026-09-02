import { describe, expect, it } from 'vitest';
import {
  computeDepartementState,
  computeDepartementStateSegments,
} from '../../../src/services/computeDepartementState.js';
import { loadDataStore } from '../../../src/data/loader.js';
import type { DataStore } from '../../../src/data/loader.js';
import type { Evenement } from '../../../src/models/index.js';

// Mêmes helpers que computeDepartementState.test.ts (fichiers de test
// autonomes dans ce dépôt, cf. convention déjà en place).
function makeEvent(
  overrides: Partial<Evenement> &
    Pick<Evenement, 'id' | 'departement_code' | 'type_evenement' | 'date_debut'>,
): Evenement {
  return {
    date_fin: null,
    reference_arrete: null,
    autorite_signataire: 'Le Préfet de test',
    source_url: null,
    date_saisie: overrides.date_debut,
    connecteur_id: 'test-connecteur',
    methode_collecte: 'manuelle_verifiee',
    ...overrides,
  };
}

function makeStore(events: Evenement[], couverts: string[]): DataStore {
  const byDept = new Map<string, Evenement[]>();
  for (const e of events) {
    const list = byDept.get(e.departement_code) ?? [];
    list.push(e);
    byDept.set(e.departement_code, list);
  }
  for (const list of byDept.values()) {
    list.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
  }
  return {
    departements: couverts.map((code) => ({ code, nom: `Departement ${code}` })),
    departementsByCode: new Map(couverts.map((code) => [code, { code, nom: `Departement ${code}` }])),
    connecteurs: [],
    evenementsByDepartement: byDept,
    departementsCouverts: new Set(couverts),
    derniereMiseAJour: '2026-08-11T00:00:00Z',
    executions: [],
    anomalies: [],
    registreSources: [],
  };
}

describe('computeDepartementStateSegments', () => {
  it('un seul segment couvrant tout l’intervalle quand aucun événement ne change l’état', () => {
    const store = makeStore([], ['13']);
    const segments = computeDepartementStateSegments(store, '13', '2026-01-01', '2026-03-31');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      date_debut: '2026-01-01',
      date_fin: '2026-03-31',
      etat: 'vert',
      evenement_applicable: null,
    });
  });

  it('deux segments contigus, bornes exactes, quand un arrêté change l’état au milieu de l’intervalle', () => {
    const events = [
      makeEvent({
        id: 'evt-77',
        departement_code: '77',
        type_evenement: 'interdiction',
        date_debut: '2026-06-10T00:00:00Z',
        date_fin: '2026-06-20T00:00:00Z',
        reference_arrete: 'AP-2026-0610',
      }),
    ];
    const store = makeStore(events, ['77']);
    const segments = computeDepartementStateSegments(store, '77', '2026-06-01', '2026-06-30');

    // Avant la date du premier événement connu pour ce département,
    // computeDepartementState renvoie 'gris' (§1bis : couverture effective
    // pas encore commencée), pas 'vert' — la fonction de segmentation doit
    // reproduire fidèlement cette règle, jamais la réinterpréter.
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ date_debut: '2026-06-01', date_fin: '2026-06-09', etat: 'gris' });
    expect(segments[1]).toMatchObject({ date_debut: '2026-06-10', date_fin: '2026-06-20', etat: 'rouge' });
    expect(segments[1].evenement_applicable?.id).toBe('evt-77');
    // date_fin de l'arrêté incluse (bornes incluses, data-model.md) : le
    // 21/06 est déjà de nouveau vert, avec l'arrêté désormais résolu comme
    // dernier_arrete_connu (idée n°2 du backlog).
    expect(segments[2]).toMatchObject({ date_debut: '2026-06-21', date_fin: '2026-06-30', etat: 'vert' });
    expect(segments[2].dernier_arrete_connu).toMatchObject({ reference_arrete: 'AP-2026-0610' });
  });

  it('un seul segment pour un intervalle réduit à un seul jour', () => {
    const store = makeStore([], ['13']);
    const segments = computeDepartementStateSegments(store, '13', '2026-05-05', '2026-05-05');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ date_debut: '2026-05-05', date_fin: '2026-05-05' });
  });

  it('comparaison croisée jour par jour avec computeDepartementState — département 13, mai 2026 (données réelles)', async () => {
    // Même fixture que frontend/tests/e2e/slider-history.spec.ts et
    // backend/src/data/events/13.json : interdiction du 2026-05-01 (sans
    // date_fin propre), levée le 2026-05-16 — un seul changement d'état sur
    // le mois, exactement le cas que ce test doit vérifier sans aucun écart
    // toléré (FR-004 de spec.md).
    const store = await loadDataStore();
    const debut = '2026-05-01';
    const fin = '2026-05-31';
    const segments = computeDepartementStateSegments(store, '13', debut, fin);

    let cursor = new Date(Date.UTC(2026, 4, 1));
    const finCursor = new Date(Date.UTC(2026, 4, 31));
    while (cursor.getTime() <= finCursor.getTime()) {
      const yyyy = cursor.getUTCFullYear();
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getUTCDate()).padStart(2, '0');
      const jour = `${yyyy}-${mm}-${dd}`;

      const attendu = computeDepartementState(store, '13', jour);
      const segment = segments.find((s) => s.date_debut <= jour && jour <= s.date_fin);
      expect(segment, `pas de segment pour ${jour}`).toBeDefined();
      expect(segment?.etat).toBe(attendu.etat);
      expect(segment?.evenement_applicable?.id ?? null).toBe(attendu.evenement_applicable?.id ?? null);
      expect(segment?.dernier_arrete_connu ?? null).toEqual(attendu.dernier_arrete_connu ?? null);

      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    // Le motif attendu sur ce mois précis : rouge du 1er au 15, vert à
    // partir du 16 (jour de la levée) — soit exactement 2 segments.
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ date_debut: '2026-05-01', date_fin: '2026-05-15', etat: 'rouge' });
    expect(segments[1]).toMatchObject({ date_debut: '2026-05-16', date_fin: '2026-05-31', etat: 'vert' });
  });
});
