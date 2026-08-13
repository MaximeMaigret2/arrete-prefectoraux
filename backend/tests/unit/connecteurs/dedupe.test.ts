import { describe, expect, it } from 'vitest';
import { detecterDoublon } from '../../../src/connecteurs/dedupe.js';
import type { Evenement } from '../../../src/models/index.js';

function makeEvent(overrides: Partial<Evenement> & Pick<Evenement, 'id' | 'date_debut'>): Evenement {
  return {
    departement_code: '77',
    type_evenement: 'interdiction',
    date_fin: null,
    reference_arrete: '2026-77-0100',
    autorite_signataire: 'Le Préfet de Seine-et-Marne',
    source_url: null,
    date_saisie: overrides.date_debut,
    connecteur_id: 'prefecture-77',
    methode_collecte: 'automatique',
    ...overrides,
  };
}

describe('detecterDoublon — similarité de référence', () => {
  it('détecte une référence strictement identique', () => {
    const historique = [makeEvent({ id: 'e1', date_debut: '2026-01-01T00:00:00.000Z', reference_arrete: '2026-77-0100' })];
    const resultat = detecterDoublon(
      { departement_code: '77', reference_arrete: '2026-77-0100', date_debut: '2027-01-01T00:00:00.000Z', date_fin: null },
      historique,
    );
    expect(resultat.doublon).toBe(true);
    expect(resultat.evenementConcerne?.id).toBe('e1');
  });

  it("détecte une référence proche à une erreur de casse/espace/tiret près", () => {
    const historique = [makeEvent({ id: 'e1', date_debut: '2026-01-01T00:00:00.000Z', reference_arrete: '2026-77-0100' })];
    const resultat = detecterDoublon(
      { departement_code: '77', reference_arrete: '2026 77 0100', date_debut: '2027-01-01T00:00:00.000Z', date_fin: null },
      historique,
    );
    expect(resultat.doublon).toBe(true);
  });

  it('ne détecte pas de doublon pour deux références réellement distinctes sur des périodes disjointes', () => {
    const historique = [
      makeEvent({
        id: 'e1',
        date_debut: '2026-01-01T00:00:00.000Z',
        date_fin: '2026-02-01T00:00:00.000Z',
        reference_arrete: '2026-77-0100',
      }),
    ];
    const resultat = detecterDoublon(
      {
        departement_code: '77',
        reference_arrete: '2026-33-0999',
        date_debut: '2027-01-01T00:00:00.000Z',
        date_fin: '2027-02-01T00:00:00.000Z',
      },
      historique,
    );
    expect(resultat.doublon).toBe(false);
    expect(resultat.evenementConcerne).toBeNull();
  });
});

describe('detecterDoublon — chevauchement de période', () => {
  it('détecte un chevauchement fort (>50%) entre deux intervalles finis', () => {
    const historique = [
      makeEvent({
        id: 'e1',
        date_debut: '2026-01-01T00:00:00.000Z',
        date_fin: '2026-01-11T00:00:00.000Z', // 10 jours
        reference_arrete: '2026-77-AAA',
      }),
    ];
    // candidat de 10 jours, décalé de 2 jours -> chevauchement de 8/10 = 80%
    const resultat = detecterDoublon(
      {
        departement_code: '77',
        reference_arrete: '2026-77-ZZZ',
        date_debut: '2026-01-03T00:00:00.000Z',
        date_fin: '2026-01-13T00:00:00.000Z',
      },
      historique,
    );
    expect(resultat.doublon).toBe(true);
    expect(resultat.evenementConcerne?.id).toBe('e1');
  });

  it('ne détecte pas de doublon pour un chevauchement faible (<=50%)', () => {
    const historique = [
      makeEvent({
        id: 'e1',
        date_debut: '2026-01-01T00:00:00.000Z',
        date_fin: '2026-01-11T00:00:00.000Z', // 10 jours
        reference_arrete: '2026-77-AAA',
      }),
    ];
    // candidat de 10 jours, décalé de 9 jours -> chevauchement de 1/10 = 10%
    const resultat = detecterDoublon(
      {
        departement_code: '77',
        reference_arrete: '2026-77-ZZZ',
        date_debut: '2026-01-10T00:00:00.000Z',
        date_fin: '2026-01-20T00:00:00.000Z',
      },
      historique,
    );
    expect(resultat.doublon).toBe(false);
  });

  it('traite une date_fin absente (null) comme "actif jusqu\'à preuve du contraire" et détecte le chevauchement', () => {
    const historique = [
      makeEvent({
        id: 'e1',
        date_debut: '2026-01-01T00:00:00.000Z',
        date_fin: null,
        reference_arrete: '2026-77-AAA',
      }),
    ];
    const resultat = detecterDoublon(
      {
        departement_code: '77',
        reference_arrete: '2026-77-ZZZ',
        date_debut: '2026-06-01T00:00:00.000Z',
        date_fin: null,
      },
      historique,
    );
    expect(resultat.doublon).toBe(true);
  });

  it('ignore les événements d\'un autre département', () => {
    const historique = [
      makeEvent({
        id: 'e1',
        departement_code: '13',
        date_debut: '2026-01-01T00:00:00.000Z',
        date_fin: '2026-01-11T00:00:00.000Z',
        reference_arrete: '2026-13-AAA',
      }),
    ];
    const resultat = detecterDoublon(
      {
        departement_code: '77',
        reference_arrete: '2026-13-AAA',
        date_debut: '2026-01-03T00:00:00.000Z',
        date_fin: '2026-01-13T00:00:00.000Z',
      },
      historique,
    );
    expect(resultat.doublon).toBe(false);
  });
});
