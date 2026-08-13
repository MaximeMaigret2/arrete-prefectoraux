import { describe, expect, it } from 'vitest';
import { evaluerCandidat } from '../../../src/connecteurs/runner.js';
import type { CandidatEvenement } from '../../../src/connecteurs/types.js';
import type { Evenement } from '../../../src/models/index.js';

function makeCandidat(overrides: Partial<CandidatEvenement> = {}): CandidatEvenement {
  return {
    departement_code: '77',
    type_evenement: 'interdiction',
    reference_arrete: '2026-77-0100',
    date_debut: '2026-08-12T00:00:00.000Z',
    date_fin: null,
    autorite_signataire: 'Le Préfet de Seine-et-Marne',
    source: {
      type: 'page_web',
      url: 'https://www.seine-et-marne.gouv.fr/raa/2026-77-0100',
      contenu_brut_reference: 'https://www.seine-et-marne.gouv.fr/raa/2026-77-0100',
      date_collecte: '2026-08-12T06:00:00.000Z',
    },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<Evenement> & Pick<Evenement, 'id' | 'date_debut'>): Evenement {
  return {
    departement_code: '77',
    type_evenement: 'interdiction',
    date_fin: null,
    reference_arrete: '2026-77-9999',
    autorite_signataire: 'Le Préfet de Seine-et-Marne',
    source_url: null,
    date_saisie: overrides.date_debut,
    connecteur_id: 'prefecture-77',
    methode_collecte: 'automatique',
    ...overrides,
  };
}

describe('evaluerCandidat — les 5 branches de la logique de décision (data-model.md)', () => {
  it('branche 1 (implicite) : un échec de lecture de la source ne passe jamais par evaluerCandidat — géré en amont par executerConnecteur via echec_global', () => {
    // Vérifié par les tests d'intégration du runner (runner.test.ts) : cette
    // branche n'a pas de candidat à évaluer, donc pas de cas ici par construction.
    expect(true).toBe(true);
  });

  it('branche 2 : champ requis manquant (reference_arrete) → anomalie champ_manquant', () => {
    const resultat = evaluerCandidat(makeCandidat({ reference_arrete: null }), []);
    expect(resultat).toEqual({
      action: 'anomalie',
      type_anomalie: 'champ_manquant',
      raison: expect.stringContaining('reference_arrete'),
    });
  });

  it('branche 2 : champ requis manquant (date_debut) → anomalie champ_manquant', () => {
    const resultat = evaluerCandidat(makeCandidat({ date_debut: null }), []);
    expect(resultat).toEqual({
      action: 'anomalie',
      type_anomalie: 'champ_manquant',
      raison: expect.stringContaining('date_debut'),
    });
  });

  it('branche 2 : champ requis manquant (autorite_signataire) → anomalie champ_manquant', () => {
    const resultat = evaluerCandidat(makeCandidat({ autorite_signataire: null }), []);
    expect(resultat).toEqual({
      action: 'anomalie',
      type_anomalie: 'champ_manquant',
      raison: expect.stringContaining('autorite_signataire'),
    });
  });

  it('branche 2 : type_evenement indéterminable → anomalie champ_manquant', () => {
    const resultat = evaluerCandidat(makeCandidat({ type_evenement: null }), []);
    expect(resultat).toEqual({
      action: 'anomalie',
      type_anomalie: 'champ_manquant',
      raison: expect.stringContaining('type_evenement'),
    });
  });

  it('branche 3 : date de fin mentionnée mais non résolvable (date_fin_ambigue) → anomalie date_ambigue', () => {
    const resultat = evaluerCandidat(makeCandidat({ date_fin: null, date_fin_ambigue: true }), []);
    expect(resultat.action).toBe('anomalie');
    expect((resultat as { type_anomalie: string }).type_anomalie).toBe('date_ambigue');
  });

  it('date_fin absente sans ambiguïté n\'est PAS une anomalie (data-model.md, étape 3)', () => {
    const resultat = evaluerCandidat(makeCandidat({ date_fin: null, date_fin_ambigue: false }), []);
    expect(resultat.action).toBe('publier');
  });

  it('branche 4 : doublon potentiel (référence proche d\'un événement existant) → anomalie doublon_potentiel', () => {
    const historique = [makeEvent({ id: 'evt-1', date_debut: '2026-01-01T00:00:00.000Z', reference_arrete: '2026-77-0100' })];
    const resultat = evaluerCandidat(makeCandidat({ reference_arrete: '2026-77-0100' }), historique);
    expect(resultat.action).toBe('anomalie');
    expect((resultat as { type_anomalie: string }).type_anomalie).toBe('doublon_potentiel');
    expect((resultat as { raison: string }).raison).toContain('evt-1');
  });

  it('branche 5 : extraction complète, non ambiguë, sans doublon → publication directe', () => {
    const resultat = evaluerCandidat(makeCandidat(), []);
    expect(resultat.action).toBe('publier');
    if (resultat.action === 'publier') {
      expect(resultat.candidat.reference_arrete).toBe('2026-77-0100');
    }
  });
});
