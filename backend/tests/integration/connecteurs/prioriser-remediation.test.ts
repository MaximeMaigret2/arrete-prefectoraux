import { describe, expect, it } from 'vitest';
import { prioriserRemediation, type DependancesPrioriteRemediation } from '../../../src/scripts/prioriser-remediation.js';
import type { Connecteur, ExecutionCollecte, AnomalieCollecte } from '../../../src/models/index.js';

/**
 * feature 007 (US4, T016) : `prioriserRemediation` classe, en lecture seule,
 * le périmètre à rejouer par plausibilité — checkpoint/executions/configs
 * entièrement synthétiques (dépendances injectées), aucun réseau réel.
 */

const CONFIG_ANNUELLE = {
  url_liste: 'https://exemple.gouv.fr/Publications/RAA',
  selecteur_publications: '.raa-item',
  selecteur_titre: '.raa-item__titre',
  selecteur_lien_pdf: null,
  autorite_signataire: 'Le Préfet',
  type_evenement_par_defaut: 'interdiction' as const,
  mots_cles_filtrage: ['rave', 'teknival'],
  patterns_dates: { debut: 'x', fin: 'y' },
  pattern_reference: 'z',
  granularite_liste: 'annuelle' as const,
};

const CONFIG_MENSUELLE = { ...CONFIG_ANNUELLE, granularite_liste: 'mensuelle' as const };

function connecteur(id: string, typeConnecteur: 'page_web' | 'pdf' = 'page_web'): Connecteur {
  return {
    id,
    nom: `Connecteur ${id}`,
    departements_couverts: [id.replace('prefecture-', '')],
    actif: true,
    derniere_collecte: null,
    type_connecteur: typeConnecteur,
  };
}

function executionBackfillSucces(connecteurId: string, nombreEvenementsPublies: number): ExecutionCollecte {
  return {
    id: `exec-${Math.random().toString(36).slice(2)}`,
    connecteur_id: connecteurId,
    date_execution: '2026-08-01T00:00:00.000Z',
    declenchement: 'backfill',
    statut: 'succes',
    nombre_evenements_publies: nombreEvenementsPublies,
    nombre_anomalies: 0,
    nombre_candidats_non_resolus: 0,
    message_erreur: null,
  } as ExecutionCollecte;
}

function anomalieNonResolue(connecteurId: string, statut: 'en_attente' | 'confirmee' | 'rejetee' = 'en_attente'): AnomalieCollecte {
  return {
    id: `anom-${Math.random().toString(36).slice(2)}`,
    connecteur_id: connecteurId,
    execution_id: 'exec-quelconque',
    type_anomalie: 'candidat_non_resolu',
    champs_extraits: {},
    source_brute: {
      type: 'pdf',
      url: 'https://exemple.gouv.fr/annexe.pdf',
      contenu_brut_reference: 'https://exemple.gouv.fr/annexe.pdf',
      date_collecte: '2026-08-01T00:00:00.000Z',
    },
    departement_code: connecteurId.replace('prefecture-', ''),
    raison: 'Téléchargement échoué.',
    statut,
    date_creation: '2026-08-01T00:00:00.000Z',
    date_resolution: null,
    evenement_resultant_id: null,
  } as AnomalieCollecte;
}

function deps(overrides: Partial<DependancesPrioriteRemediation>): DependancesPrioriteRemediation {
  return {
    loadDataStore: async () => ({ connecteurs: [], executions: [], anomalies: [] }),
    chargerConfigConnecteur: async () => CONFIG_MENSUELLE,
    ...overrides,
  };
}

describe('prioriserRemediation (US4, FR-017/FR-009)', () => {
  it('un connecteur granularité annuelle avec des exécutions backfill succès-à-0-événement est signalé (plausibilité)', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-56')],
          executions: [
            executionBackfillSucces('prefecture-56', 0),
            executionBackfillSucces('prefecture-56', 0),
            executionBackfillSucces('prefecture-56', 3), // ce mois-ci n'entre pas dans le compte (>0 événement)
          ],
          anomalies: [],
        }),
        chargerConfigConnecteur: async () => CONFIG_ANNUELLE,
      }),
    );

    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({
      connecteurId: 'prefecture-56',
      granulariteAnnuelle: true,
      nombreExecutionsBackfillSuccesZeroEvenement: 2,
      candidatsNonResolusActuels: 0,
    });
  });

  it('un connecteur granularité mensuelle sans aucun signal (ni candidat_non_resolu, ni succès-à-0) est absent du rapport', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-77')],
          executions: [executionBackfillSucces('prefecture-77', 5)],
          anomalies: [],
        }),
        chargerConfigConnecteur: async () => CONFIG_MENSUELLE,
      }),
    );

    expect(resultat).toEqual([]);
  });

  it('un connecteur avec des candidat_non_resolu en_attente actuels est signalé même en granularité mensuelle', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-77')],
          executions: [],
          anomalies: [anomalieNonResolue('prefecture-77'), anomalieNonResolue('prefecture-77')],
        }),
        chargerConfigConnecteur: async () => CONFIG_MENSUELLE,
      }),
    );

    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({
      connecteurId: 'prefecture-77',
      granulariteAnnuelle: false,
      candidatsNonResolusActuels: 2,
    });
  });

  it('une anomalie candidat_non_resolu déjà confirmee/rejetee ne compte pas (seule en_attente est une preuve actionnable)', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-77')],
          executions: [],
          anomalies: [anomalieNonResolue('prefecture-77', 'confirmee'), anomalieNonResolue('prefecture-77', 'rejetee')],
        }),
        chargerConfigConnecteur: async () => CONFIG_MENSUELLE,
      }),
    );

    expect(resultat).toEqual([]);
  });

  it('la preuve directe (candidat_non_resolu actuel) est priorisée avant la simple plausibilité (granularité annuelle)', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-annuel-seul'), connecteur('prefecture-preuve')],
          executions: [
            executionBackfillSucces('prefecture-annuel-seul', 0),
            executionBackfillSucces('prefecture-annuel-seul', 0),
            executionBackfillSucces('prefecture-annuel-seul', 0),
          ],
          anomalies: [anomalieNonResolue('prefecture-preuve')],
        }),
        chargerConfigConnecteur: async (id) => (id === 'prefecture-annuel-seul' ? CONFIG_ANNUELLE : CONFIG_MENSUELLE),
      }),
    );

    expect(resultat.map((r) => r.connecteurId)).toEqual(['prefecture-preuve', 'prefecture-annuel-seul']);
  });

  it('un connecteur de type pdf/rss (pas page_web) est ignoré — ce mécanisme est spécifique au moteur page_web (US1)', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-pdf-only', 'pdf')],
          executions: [executionBackfillSucces('prefecture-pdf-only', 0)],
          anomalies: [anomalieNonResolue('prefecture-pdf-only')],
        }),
      }),
    );

    expect(resultat).toEqual([]);
  });

  it('un connecteur dont la config est introuvable/invalide est ignoré sans bloquer les autres', async () => {
    const resultat = await prioriserRemediation(
      deps({
        loadDataStore: async () => ({
          connecteurs: [connecteur('prefecture-config-cassee'), connecteur('prefecture-ok')],
          executions: [],
          anomalies: [anomalieNonResolue('prefecture-config-cassee'), anomalieNonResolue('prefecture-ok')],
        }),
        chargerConfigConnecteur: async (id) => {
          if (id === 'prefecture-config-cassee') throw new Error('config introuvable');
          return CONFIG_MENSUELLE;
        },
      }),
    );

    expect(resultat.map((r) => r.connecteurId)).toEqual(['prefecture-ok']);
  });
});
