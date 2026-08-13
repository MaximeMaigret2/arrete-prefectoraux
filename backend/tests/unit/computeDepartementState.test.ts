import { describe, expect, it } from 'vitest';
import { computeDepartementState } from '../../src/services/computeDepartementState.js';
import type { DataStore } from '../../src/data/loader.js';
import type { Evenement } from '../../src/models/index.js';

function makeEvent(overrides: Partial<Evenement> & Pick<Evenement, 'id' | 'departement_code' | 'type_evenement' | 'date_debut'>): Evenement {
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

describe('computeDepartementState', () => {
  it('retourne gris pour un département sans connecteur (absence de couverture)', () => {
    const store = makeStore([], []);
    const result = computeDepartementState(store, '2A', '2026-08-10');
    expect(result.etat).toBe('gris');
    expect(result.evenement_applicable).toBeNull();
  });

  it('retourne vert pour un département couvert sans aucun arrêté', () => {
    const store = makeStore([], ['13']);
    const result = computeDepartementState(store, '13', '2026-08-10');
    expect(result.etat).toBe('vert');
    expect(result.evenement_applicable).toBeNull();
  });

  it('retourne rouge pour un arrêté actif sans date_fin (actif jusqu’à preuve du contraire)', () => {
    const events = [
      makeEvent({
        id: 'evt-77',
        departement_code: '77',
        type_evenement: 'interdiction',
        date_debut: '2026-06-01T00:00:00Z',
        reference_arrete: 'AP-2026-0842',
      }),
    ];
    const store = makeStore(events, ['77']);

    expect(computeDepartementState(store, '77', '2026-06-01').etat).toBe('rouge');
    expect(computeDepartementState(store, '77', '2026-12-31').etat).toBe('rouge');
    const result = computeDepartementState(store, '77', '2026-08-10');
    expect(result.etat).toBe('rouge');
    expect(result.evenement_applicable?.id).toBe('evt-77');
  });

  it('gère un chevauchement de deux arrêtés (prolongation posée avant expiration) sans doublon', () => {
    const events = [
      makeEvent({
        id: 'evt-33-interdiction',
        departement_code: '33',
        type_evenement: 'interdiction',
        date_debut: '2026-07-01T00:00:00Z',
        reference_arrete: 'AP-2026-0701',
      }),
      makeEvent({
        id: 'evt-33-prolongation',
        departement_code: '33',
        type_evenement: 'prolongation',
        date_debut: '2026-07-20T00:00:00Z',
        reference_arrete: 'AP-2026-0715-PROL',
      }),
    ];
    const store = makeStore(events, ['33']);

    const beforeOverlap = computeDepartementState(store, '33', '2026-07-10');
    expect(beforeOverlap.etat).toBe('rouge');
    expect(beforeOverlap.evenement_applicable?.id).toBe('evt-33-interdiction');

    const duringOverlap = computeDepartementState(store, '33', '2026-07-25');
    expect(duringOverlap.etat).toBe('rouge');
    // evenement_applicable = le plus récemment débuté (la prolongation)
    expect(duringOverlap.evenement_applicable?.id).toBe('evt-33-prolongation');
  });

  it('bascule de rouge à vert exactement le lendemain de date_fin (fin exclusive)', () => {
    const events = [
      makeEvent({
        id: 'evt-with-end',
        departement_code: '06',
        type_evenement: 'interdiction',
        date_debut: '2026-03-01T00:00:00Z',
        // 10 mars 2026 est en heure d'hiver (CET, UTC+1) : 23:59:59Z
        // correspond à 00:59:59 le 11 mars en Europe/Paris et ferait donc
        // basculer le jour calendaire retenu au 11 mars au lieu du 10.
        // On utilise T00:00:00Z, comme `date_debut` ailleurs dans ce
        // fichier, puisque seul le jour calendaire (Europe/Paris) de
        // `date_fin` compte pour le calcul (cf. computeDepartementState.ts).
        date_fin: '2026-03-10T00:00:00Z',
        reference_arrete: 'AP-2026-0301',
      }),
    ];
    const store = makeStore(events, ['06']);

    expect(computeDepartementState(store, '06', '2026-03-10').etat).toBe('rouge');
    expect(computeDepartementState(store, '06', '2026-03-11').etat).toBe('vert');
  });

  it('date strictement égale à date_debut : jour inclus en rouge', () => {
    const events = [
      // Événement antérieur déjà résolu, pour garantir que le département a
      // des données connues avant la date testée : sinon la règle "gris
      // avant le premier événement connu du département" (FR-016 / US2.4,
      // voir test ci-dessous) s'appliquerait à la place de la règle de borne
      // vérifiée ici, qui porte spécifiquement sur `date_debut`.
      makeEvent({
        id: 'evt-59-prior-interdiction',
        departement_code: '59',
        type_evenement: 'interdiction',
        date_debut: '2026-01-01T00:00:00Z',
        date_fin: '2026-01-05T00:00:00Z',
        reference_arrete: 'AP-2026-0101',
      }),
      makeEvent({
        id: 'evt-borne',
        departement_code: '59',
        type_evenement: 'interdiction',
        date_debut: '2026-04-05T00:00:00Z',
        reference_arrete: 'AP-2026-0405',
      }),
    ];
    const store = makeStore(events, ['59']);

    expect(computeDepartementState(store, '59', '2026-04-04').etat).toBe('vert');
    expect(computeDepartementState(store, '59', '2026-04-05').etat).toBe('rouge');
  });

  it('interdiction sans date_fin terminée par une levee : le jour de la levée est déjà vert', () => {
    const events = [
      makeEvent({
        id: 'evt-13-interdiction',
        departement_code: '13',
        type_evenement: 'interdiction',
        date_debut: '2026-05-01T00:00:00Z',
        reference_arrete: 'AP-2026-0501',
      }),
      makeEvent({
        id: 'evt-13-levee',
        departement_code: '13',
        type_evenement: 'levee',
        date_debut: '2026-05-16T00:00:00Z',
      }),
    ];
    const store = makeStore(events, ['13']);

    expect(computeDepartementState(store, '13', '2026-05-15').etat).toBe('rouge');
    expect(computeDepartementState(store, '13', '2026-05-16').etat).toBe('vert');
    expect(computeDepartementState(store, '13', '2026-08-10').etat).toBe('vert');
  });

  it('affiche gris (pas vert) pour une date antérieure au premier événement connu du département (FR-016 / US2.4)', () => {
    const events = [
      makeEvent({
        id: 'evt-13-interdiction',
        departement_code: '13',
        type_evenement: 'interdiction',
        date_debut: '2026-05-01T00:00:00Z',
        reference_arrete: 'AP-2026-0501',
      }),
    ];
    const store = makeStore(events, ['13']);

    // Avant toute donnée collectée pour ce département → gris, jamais vert.
    expect(computeDepartementState(store, '13', '2026-01-01').etat).toBe('gris');
    expect(computeDepartementState(store, '13', '2026-04-30').etat).toBe('gris');
    // Le jour du premier événement connu, l'état normal reprend la main.
    expect(computeDepartementState(store, '13', '2026-05-01').etat).toBe('rouge');
  });

  it('un département jamais couvert par aucun connecteur reste gris à toute date, jamais vert par défaut (FR-016)', () => {
    // La temporalité fine de couverture d'un connecteur (ex. désactivé après
    // une période active) est explicitement laissée à l'implémentation par
    // data-model.md (§Règle de couverture) : cette implémentation retient un
    // modèle de couverture statique (un département est "couvert" dès lors
    // qu'un connecteur le référence dans `departements_couverts`, quelle que
    // soit la date). Le test ci-dessous vérifie l'invariant non ambigu et
    // requis par FR-016 : hors de toute couverture, jamais de vert par défaut.
    const store = makeStore([], []);
    expect(computeDepartementState(store, '2A', '2020-01-01').etat).toBe('gris');
    expect(computeDepartementState(store, '2A', '2099-12-31').etat).toBe('gris');
  });
});
