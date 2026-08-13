import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { executerConnecteur } from '../../../src/connecteurs/runner.js';
import { creerConnecteur } from '../../../src/connecteurs/moteurs/pageWeb/moteur.js';
import type { Connecteur as ConnecteurEntree } from '../../../src/models/index.js';

/**
 * T046 (US3, Acceptance Scenario US3.3, FR-010) — réexécuter le même
 * connecteur sur une source inchangée ne crée pas de doublon : le second
 * run doit détecter chaque candidat déjà publié au premier run comme
 * doublon potentiel (`dedupe.ts`, via `evaluerCandidat` étape 4) plutôt que
 * de le republier — au lieu d'un connecteur factice (T045, T020A), ce test
 * utilise le vrai moteur `page_web` (`creerConnecteur`) sur la fixture
 * `publication-propre.html` (T036/T028), servie identiquement aux deux
 * appels de `collecter()` (mock `fetch` retournant toujours le même
 * contenu) — c'est le connecteur réel, pas la logique de décision isolée,
 * qui est réexécuté, ce que ne fait aucun test existant.
 *
 * Département de test : '19' (Corrèze), inutilisé par les autres suites
 * (cf. en-têtes de `runner.test.ts`/T045, `ajoutConnecteur.test.ts`/T038,
 * `tests/contract/admin/connecteurs.test.ts`/T039).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_19_PATH = path.join(DATA_DIR, 'events', '19.json');
const FIXTURE_HTML_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');

const CONNECTEUR_ID = 'test-idempotence-connecteur-19';
const URL_LISTE = 'https://exemple-idempotence.gouv.fr/Publications/RAA';

const ENTREE: ConnecteurEntree = {
  id: CONNECTEUR_ID,
  nom: "Connecteur de test idempotence (T046)",
  departements_couverts: ['19'],
  actif: true,
  derniere_collecte: null,
  type_connecteur: 'page_web',
};

const CONFIG = {
  url_liste: URL_LISTE,
  selecteur_publications: '.raa-item',
  selecteur_titre: '.raa-item__titre',
  // PDF joint ignoré volontairement (null) : ce test porte sur l'idempotence
  // de la publication/dedupe, pas sur le suivi de pièce jointe (couvert par
  // T043/T044) — le titre seul suffit à l'extraction du candidat retenu ici.
  selecteur_lien_pdf: null,
  autorite_signataire: 'Le Préfet de la Corrèze',
  type_evenement_par_defaut: 'interdiction' as const,
  mots_cles_filtrage: ['rave', 'teknival'],
  patterns_dates: {
    debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})",
    fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})",
  },
  pattern_reference: 'Arrêté n°\\s*(?<reference>[0-9-]+)',
};

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function restaurer(filePath: string, contenu: string | null): Promise<void> {
  await writeFile(filePath, contenu ?? '[]\n', 'utf-8');
}

let snapshotConnecteurs: string | null;
let snapshotExecutions: string | null;
let snapshotAnomalies: string | null;
let snapshotEvents19: string | null;
let html: string;

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents19 = await lireOuAbsent(EVENTS_19_PATH);
  html = await readFile(FIXTURE_HTML_PATH, 'utf-8');

  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = [...reels, ENTREE];
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');
  await writeFile(EXECUTIONS_PATH, snapshotExecutions ?? '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, snapshotAnomalies ?? '[]\n', 'utf-8');
  await writeFile(EVENTS_19_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();

  // Source inchangée entre les deux runs : `fetch` répond systématiquement
  // avec le même contenu, comme le ferait une source non modifiée depuis la
  // dernière collecte.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_LISTE) return { ok: true, status: 200, text: async () => html } as unknown as Response;
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(async () => {
  await restaurer(CONNECTEURS_PATH, snapshotConnecteurs);
  await restaurer(EXECUTIONS_PATH, snapshotExecutions);
  await restaurer(ANOMALIES_PATH, snapshotAnomalies);
  await restaurer(EVENTS_19_PATH, snapshotEvents19);
  resetDataStoreCache();
  vi.unstubAllGlobals();
});

describe('US3 — idempotence : réexécuter le même connecteur sur une source inchangée (T046)', () => {
  it('le premier run publie le candidat, le second run ne le republie pas (doublon détecté)', async () => {
    const connecteur = creerConnecteur(ENTREE, CONFIG);

    // La fixture `publication-propre.html` (T036) contient 3 publications :
    // '2026-77-0512' (complète, publiée), '2026-77-0498' (filtrée, aucun
    // mot-clé), '2026-77-0520' (mot-clé "teknival" mais sans PDF joint ici
    // — `selecteur_lien_pdf: null` — donc titre seul, `date_debut`
    // manquant → anomalie `champ_manquant`, hors sujet de ce test qui porte
    // sur la non-duplication des ÉVÉNEMENTS PUBLIÉS, pas sur l'idempotence
    // des anomalies elles-mêmes).
    const executionUn = await executerConnecteur(connecteur, 'planifie');
    expect(executionUn.nombre_evenements_publies).toBe(1);
    expect(executionUn.nombre_anomalies).toBe(1);

    const storeApresUn = await loadDataStore(true);
    expect(storeApresUn.evenementsByDepartement.get('19')).toHaveLength(1);
    expect(storeApresUn.evenementsByDepartement.get('19')?.[0].reference_arrete).toBe('2026-77-0512');

    // Deuxième run : source strictement identique (même mock `fetch`).
    const executionDeux = await executerConnecteur(connecteur, 'planifie');
    expect(executionDeux.nombre_evenements_publies).toBe(0);
    expect(executionDeux.nombre_anomalies).toBeGreaterThanOrEqual(1);

    const storeApresDeux = await loadDataStore(true);
    // Aucun doublon : toujours un seul événement publié pour '2026-77-0512'.
    const evenements19 = storeApresDeux.evenementsByDepartement.get('19') ?? [];
    expect(evenements19).toHaveLength(1);
    expect(evenements19.filter((e) => e.reference_arrete === '2026-77-0512')).toHaveLength(1);

    const doublon = storeApresDeux.anomalies.find(
      (a) => a.type_anomalie === 'doublon_potentiel' && a.champs_extraits.reference_arrete === '2026-77-0512',
    );
    expect(doublon).toBeDefined();
    expect(doublon?.statut).toBe('en_attente');
  });

  it('une troisième réexécution reste idempotente (pas de dérive au fil des runs répétés)', async () => {
    const connecteur = creerConnecteur(ENTREE, CONFIG);

    await executerConnecteur(connecteur, 'planifie');
    await executerConnecteur(connecteur, 'planifie');
    await executerConnecteur(connecteur, 'planifie');

    const store = await loadDataStore(true);
    const evenements19 = store.evenementsByDepartement.get('19') ?? [];
    expect(evenements19.filter((e) => e.reference_arrete === '2026-77-0512')).toHaveLength(1);
  });
});
