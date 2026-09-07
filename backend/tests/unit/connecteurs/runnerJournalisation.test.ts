import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { executerConnecteur } from '../../../src/connecteurs/runner.js';
import type { Connecteur, ResultatCollecte } from '../../../src/connecteurs/types.js';

/**
 * Test d'intégration du `runner` (T020A, remediation finding F2) avec un
 * connecteur factice (« fake connector », research.md §9), couvrant les 3
 * chemins du contrat (publication directe, anomalie, échec de lecture) et
 * vérifiant la journalisation (FR-011) : compteurs, `statut`, et mise à
 * jour de `Connecteur.derniere_collecte`.
 *
 * `data/loader.ts` n'expose pas d'indirection testable pour le
 * répertoire de données (Principe 5 — pas de complexité ajoutée sans
 * besoin concret) : ce test écrit donc temporairement dans les vrais
 * fichiers `connecteurs.json`/`executions.json`/`anomalies.json`/
 * `events/2A.json` (département `2A`, inutilisé par les fixtures
 * existantes — cf. T012), et restaure systématiquement l'état d'origine
 * après chaque test, y compris en cas d'échec (`afterEach`). La
 * restauration se fait uniquement par écriture (jamais par suppression de
 * fichier, non permise sur ce point de montage) : `events/2A.json`
 * n'existant pas au départ, il est restauré à `[]` plutôt que supprimé —
 * état fonctionnellement équivalent (aucun événement pour ce département).
 */

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/data');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_2A_PATH = path.join(DATA_DIR, 'events', '2A.json');

const FAKE_CONNECTEUR_ID = 'test-fake-connecteur-runner';

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Restaure `filePath` par écriture (jamais par suppression — non permise sur ce point de montage). `null` = fichier absent à l'origine → restauré à `[]`, équivalent fonctionnel. */
async function restaurer(filePath: string, contenu: string | null): Promise<void> {
  await writeFile(filePath, contenu ?? '[]\n', 'utf-8');
}

let snapshotConnecteurs: string | null;
let snapshotExecutions: string | null;
let snapshotAnomalies: string | null;
let snapshotEvents2A: string | null;

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents2A = await lireOuAbsent(EVENTS_2A_PATH);

  // connecteurs.json réel n'a pas encore `type_connecteur` (bug préexistant,
  // documenté en T005A, à corriger par T032/T033/T034 — hors périmètre
  // ici) : on l'ajoute temporairement, avec un connecteur factice
  // supplémentaire pour le département de test '2A', pour permettre à
  // `loadDataStore()`/`updateConnecteur()` de fonctionner le temps du test.
  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = reels.map((c) => ({
    ...c,
    type_connecteur: c.type_connecteur ?? 'page_web',
  }));
  patches.push({
    id: FAKE_CONNECTEUR_ID,
    nom: 'Connecteur factice (test runner)',
    departements_couverts: ['2A'],
    actif: true,
    derniere_collecte: null,
    type_connecteur: 'page_web',
  });
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');
  await writeFile(EXECUTIONS_PATH, '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, '[]\n', 'utf-8');
  await writeFile(EVENTS_2A_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();
});

afterEach(async () => {
  await restaurer(CONNECTEURS_PATH, snapshotConnecteurs);
  await restaurer(EXECUTIONS_PATH, snapshotExecutions);
  await restaurer(ANOMALIES_PATH, snapshotAnomalies);
  await restaurer(EVENTS_2A_PATH, snapshotEvents2A);
  resetDataStoreCache();
});

function makeFakeConnecteur(collecter: () => Promise<ResultatCollecte>): Connecteur {
  return {
    id: FAKE_CONNECTEUR_ID,
    departements: ['2A'],
    collecter,
  };
}

const sourceFactice = {
  type: 'page_web' as const,
  url: 'https://example.org/raa/2a',
  contenu_brut_reference: 'https://example.org/raa/2a',
  date_collecte: '2026-08-12T06:00:00.000Z',
};

describe('executerConnecteur — journalisation (FR-011)', () => {
  it('chemin 1 : publication directe → statut succes, derniere_collecte mise à jour', async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: '2026-2A-0001',
          date_debut: '2026-08-12T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'manuel');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(0);
    expect(execution.message_erreur).toBeNull();

    const store = await loadDataStore(true);
    const connecteurMisAJour = store.connecteurs.find((c) => c.id === FAKE_CONNECTEUR_ID);
    expect(connecteurMisAJour?.derniere_collecte).toBe(execution.date_execution);
    expect(store.evenementsByDepartement.get('2A')?.length).toBe(1);
    expect(store.executions.length).toBe(1);
  });

  it('chemin 2 : candidat en anomalie (champ manquant) → statut succes (0 publié, 1 anomalie), derniere_collecte mise à jour', async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: null, // champ manquant
          date_debut: '2026-08-12T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(0);
    expect(execution.nombre_anomalies).toBe(1);

    const store = await loadDataStore(true);
    expect(store.anomalies).toHaveLength(1);
    expect(store.anomalies[0].type_anomalie).toBe('champ_manquant');
    expect(store.anomalies[0].statut).toBe('en_attente');
    const connecteurMisAJour = store.connecteurs.find((c) => c.id === FAKE_CONNECTEUR_ID);
    expect(connecteurMisAJour?.derniere_collecte).toBe(execution.date_execution);
  });

  it('chemin 3 : échec de lecture de la source → statut echec, message_erreur renseigné, derniere_collecte NON mise à jour', async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [],
      echec_global: { message: 'Source injoignable (HTTP 503)', source: sourceFactice },
    }));

    const execution = await executerConnecteur(connecteur, 'planifie');

    expect(execution.statut).toBe('echec');
    expect(execution.nombre_evenements_publies).toBe(0);
    expect(execution.nombre_anomalies).toBe(1);
    expect(execution.message_erreur).toBe('Source injoignable (HTTP 503)');

    const store = await loadDataStore(true);
    expect(store.anomalies).toHaveLength(1);
    expect(store.anomalies[0].type_anomalie).toBe('echec_lecture_source');
    const connecteurMisAJour = store.connecteurs.find((c) => c.id === FAKE_CONNECTEUR_ID);
    expect(connecteurMisAJour?.derniere_collecte).toBeNull();
  });

  it('une exception levée par collecter() est isolée : traitée comme un échec de ce seul connecteur (contrat §5, règle 6)', async () => {
    const connecteur = makeFakeConnecteur(async () => {
      throw new Error('Erreur réseau inattendue');
    });

    const execution = await executerConnecteur(connecteur, 'manuel');

    expect(execution.statut).toBe('echec');
    expect(execution.message_erreur).toBe('Erreur réseau inattendue');
    expect(execution.nombre_evenements_publies).toBe(0);
    expect(execution.nombre_anomalies).toBe(0);
  });

  it('mix publication + anomalie dans le même run → statut partiel', async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: '2026-2A-0002',
          date_debut: '2026-08-12T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: null,
          date_debut: '2026-08-13T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'manuel');

    expect(execution.statut).toBe('partiel');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(1);

    const store = await loadDataStore(true);
    const connecteurMisAJour = store.connecteurs.find((c) => c.id === FAKE_CONNECTEUR_ID);
    expect(connecteurMisAJour?.derniere_collecte).toBe(execution.date_execution);
  });

  it("liste de candidats vide (aucune nouvelle publication) → statut succes, aucun effet", async () => {
    const connecteur = makeFakeConnecteur(async () => ({ candidats: [] }));

    const execution = await executerConnecteur(connecteur, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(0);
    expect(execution.nombre_anomalies).toBe(0);
  });

  // feature 007 (US2, FR-006) : un candidat dont la pertinence n'a jamais
  // pu être établie (moteur page_web, US1) rend le statut de l'exécution
  // 'incertain' — prioritaire sur 'succes'/'partiel', avec une anomalie
  // candidat_non_resolu persistée par candidat concerné.
  it("candidat non résolu, aucune autre publication → statut incertain, une anomalie candidat_non_resolu persistée", async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [],
      candidatsNonResolus: [
        {
          departement_code: '2A',
          message: 'Téléchargement du PDF "https://example.org/annexe.pdf" échoué : HTTP 503.',
          source: {
            type: 'pdf',
            url: 'https://example.org/annexe.pdf',
            contenu_brut_reference: 'https://example.org/annexe.pdf',
            date_collecte: '2026-08-12T06:00:00.000Z',
          },
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'planifie');

    expect(execution.statut).toBe('incertain');
    expect(execution.nombre_evenements_publies).toBe(0);
    expect(execution.nombre_candidats_non_resolus).toBe(1);
    expect(execution.message_erreur).toBeNull();

    const store = await loadDataStore(true);
    expect(store.anomalies).toHaveLength(1);
    expect(store.anomalies[0].type_anomalie).toBe('candidat_non_resolu');
    expect(store.anomalies[0].statut).toBe('en_attente');
    // La source n'a pas échoué totalement (contrairement au chemin 3) :
    // derniere_collecte est mise à jour, même esprit que succes/partiel.
    const connecteurMisAJour = store.connecteurs.find((c) => c.id === FAKE_CONNECTEUR_ID);
    expect(connecteurMisAJour?.derniere_collecte).toBe(execution.date_execution);
  });

  it("candidat non résolu ET publication réussie dans le même run → statut incertain, prioritaire sur succes (US2 Acceptance Scenario 3)", async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: '2026-2A-0003',
          date_debut: '2026-08-12T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
      ],
      candidatsNonResolus: [
        {
          departement_code: '2A',
          message: 'Page de détail inaccessible.',
          source: { ...sourceFactice, url: 'https://example.org/detail-indisponible' },
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'manuel');

    expect(execution.statut).toBe('incertain');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_candidats_non_resolus).toBe(1);
  });

  it("candidat non résolu, publication ET anomalie ordinaire dans le même run → statut incertain, prioritaire sur partiel", async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: '2026-2A-0004',
          date_debut: '2026-08-12T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
        {
          departement_code: '2A',
          type_evenement: 'interdiction',
          reference_arrete: null, // champ manquant → anomalie ordinaire
          date_debut: '2026-08-13T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet de Corse-du-Sud',
          source: sourceFactice,
        },
      ],
      candidatsNonResolus: [
        {
          departement_code: '2A',
          message: 'Téléchargement du PDF échoué.',
          source: { ...sourceFactice, url: 'https://example.org/pdf-indisponible' },
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'manuel');

    expect(execution.statut).toBe('incertain');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(1);
    expect(execution.nombre_candidats_non_resolus).toBe(1);

    const store = await loadDataStore(true);
    // Les deux anomalies coexistent : une ordinaire (champ_manquant) et une candidat_non_resolu.
    expect(store.anomalies.map((a) => a.type_anomalie).sort()).toEqual(['candidat_non_resolu', 'champ_manquant']);
  });
});
