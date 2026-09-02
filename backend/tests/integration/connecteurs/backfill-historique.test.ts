import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirRepertoireDonnees, loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { executerConnecteurPourBackfill } from '../../../src/connecteurs/runner.js';
import { creerConnecteur } from '../../../src/connecteurs/moteurs/pageWeb/moteur.js';
import {
  executerBackfill,
  lireCheckpoint,
  type DependancesBackfill,
} from '../../../src/scripts/backfill-historique.js';
import type { ProfondeurConnecteur } from '../../../src/connecteurs/volumetrie.js';
import type { Connecteur, ResultatCollecte } from '../../../src/connecteurs/types.js';
import type { AnneeMois } from '../../../src/services/parisDate.js';
import type { Connecteur as ConnecteurEntree, ExecutionCollecte } from '../../../src/models/index.js';

/**
 * Feature 005 (US3, T014) : séquencement/groupement/circuit-breaker/checkpoint
 * de `backfill-historique.ts`, connecteurs et hébergeurs entièrement simulés
 * via des dépendances injectées (`DependancesBackfill`) — aucun réseau réel,
 * aucun `attendre()` réel (résolu immédiatement dans les tests).
 *
 * Un second bloc, séparé, réexerce le VRAI `executerConnecteurPourBackfill`
 * (runner + dedupe.ts réels, cf. `idempotence.test.ts`) pour vérifier la
 * non-duplication en cas de resollicitation volontaire d'un couple déjà
 * traité (scénario (d) de T014) — seul ce bloc touche `data/loader.ts` via
 * un répertoire temporaire jetable (Q-006).
 */

const MAINTENANT = new Date(Date.UTC(2026, 7, 13, 10, 0, 0));

function executionFausse(statut: 'succes' | 'echec'): ExecutionCollecte {
  return {
    id: `exec-${Math.random().toString(36).slice(2)}`,
    connecteur_id: 'test',
    date_execution: new Date().toISOString(),
    declenchement: 'backfill',
    statut,
    nombre_evenements_publies: 0,
    nombre_anomalies: 0,
    message_erreur: statut === 'echec' ? 'erreur simulée' : null,
  } as ExecutionCollecte;
}

function connecteurFactice(id: string): Connecteur {
  return {
    id,
    departements: ['99'],
    async collecter(): Promise<ResultatCollecte> {
      return { candidats: [] };
    },
  };
}

function profondeur(connecteurId: string, profondeurCibleMois: number): ProfondeurConnecteur {
  return {
    connecteurId,
    departementCode: '99',
    aPageDetail: false,
    profondeurCibleMois,
    volumeMoyenEchantillon: null,
  };
}

describe('backfill-historique — orchestration (US3, connecteurs/hébergeurs simulés)', () => {
  let tempDir: string;
  let cheminCheckpoint: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-backfill-'));
    cheminCheckpoint = path.join(tempDir, 'checkpoint.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  function deps(overrides: Partial<DependancesBackfill>): DependancesBackfill {
    return {
      auditerProfondeurs: async () => [],
      obtenirConnecteur: async (id) => connecteurFactice(id),
      executerConnecteurPourBackfill: async () => ({ execution: executionFausse('succes'), causeReseauSiEchec: null }),
      attendre: async () => {},
      maintenant: () => MAINTENANT,
      ...overrides,
    };
  }

  it('(a) traite les connecteurs d\'un même groupe strictement séquentiellement, avec un espacement avant chaque requête', async () => {
    const ordreAppels: string[] = [];
    const attendreEspion = vi.fn(async () => {});

    const rapport = await executerBackfill(
      { cheminCheckpoint, espacementMinimumMs: 42 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 1), profondeur('conn-b', 1), profondeur('conn-c', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          ordreAppels.push(connecteur.id);
          return { execution: executionFausse('succes'), causeReseauSiEchec: null };
        },
        attendre: attendreEspion,
      }),
    );

    expect(ordreAppels).toEqual(['conn-a', 'conn-b', 'conn-c']);
    expect(attendreEspion).toHaveBeenCalledTimes(3);
    expect(attendreEspion).toHaveBeenCalledWith(42);
    expect(rapport.groupes.find((g) => g.groupe === 'mutualise')?.moisReussis).toBe(3);
  });

  it('(b) le circuit-breaker interrompt uniquement la file concernée après le seuil d\'échecs réseau consécutifs, sans affecter les autres files', async () => {
    const appelsMutualise: string[] = [];
    let appelsMoselle = 0;

    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilCircuitBreaker: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 3), profondeur('conn-b', 1), profondeur('prefecture-57', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          if (connecteur.id === 'prefecture-57') {
            appelsMoselle += 1;
            return { execution: executionFausse('succes'), causeReseauSiEchec: null };
          }
          appelsMutualise.push(connecteur.id);
          return { execution: executionFausse('echec'), causeReseauSiEchec: true };
        },
      }),
    );

    // 2 échecs réseau consécutifs sur conn-a (seuil=2) ouvrent le circuit
    // AVANT que conn-b ne soit jamais tenté, dans la même file (mutualise).
    expect(appelsMutualise).toEqual(['conn-a', 'conn-a']);
    const rapportMutualise = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportMutualise.circuitOuvert).toBe(true);
    expect(rapportMutualise.connecteursTraites).toEqual(['conn-a']);

    // La file Moselle (hébergeur distinct) n'est jamais affectée.
    expect(appelsMoselle).toBe(1);
    const rapportMoselle = rapport.groupes.find((g) => g.groupe === 'moselle')!;
    expect(rapportMoselle.circuitOuvert).toBe(false);
    expect(rapportMoselle.moisReussis).toBe(1);

    // Aucun des deux mois de conn-a n'a été marqué réussi (les deux ont échoué) : le checkpoint les conserve pour une reprise ultérieure.
    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(checkpoint.connecteurs['conn-a']?.moisRestants).toHaveLength(3);
  });

  it("(b bis) une page introuvable (archives épuisées) n'ouvre jamais le circuit-breaker, même répétée", async () => {
    let appels = 0;
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilCircuitBreaker: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 5), profondeur('conn-b', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          if (connecteur.id === 'conn-a') {
            appels += 1;
            return { execution: executionFausse('echec'), causeReseauSiEchec: false };
          }
          return { execution: executionFausse('succes'), causeReseauSiEchec: null };
        },
      }),
    );

    // Un seul appel pour conn-a : la première page introuvable borne
    // immédiatement ses archives (US1 Edge Case), jamais retentée pour les
    // mois plus anciens dans le même run.
    expect(appels).toBe(1);
    const rapportMutualise = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportMutualise.circuitOuvert).toBe(false);
    // conn-b, dans la même file, est bien atteint (le circuit n'a jamais ouvert).
    expect(rapportMutualise.connecteursTraites).toEqual(['conn-a', 'conn-b']);

    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(checkpoint.connecteurs['conn-a']?.archivesEpuisees).toBe(true);
    expect(checkpoint.connecteurs['conn-a']?.moisRestants).toEqual([]);
  });

  it('(c) une reprise ne resollicite aucun couple (connecteur, mois) déjà traité avec succès', async () => {
    const appelsParRun: AnneeMois[][] = [[], []];
    let runCourant = 0;

    const executerConnecteurPourBackfillMock = async (_connecteur: Connecteur, cible: AnneeMois) => {
      appelsParRun[runCourant]!.push(cible);
      // Le 2e mois (M-2) échoue systématiquement au run 1, réussit au run 2.
      const estDeuxiemeMois = cible.moisNumero === '06'; // M-2 pour août 2026 = juin
      const echoueCeRun = runCourant === 0 && estDeuxiemeMois;
      return {
        execution: executionFausse(echoueCeRun ? 'echec' : 'succes'),
        causeReseauSiEchec: echoueCeRun ? true : null,
      };
    };

    const optionsCommunes = { cheminCheckpoint, espacementMinimumMs: 0, seuilCircuitBreaker: 10 };
    const auditerProfondeurs = async () => [profondeur('conn-a', 3)]; // M-1, M-2, M-3 = juillet, juin, mai 2026

    await executerBackfill(optionsCommunes, deps({ auditerProfondeurs, executerConnecteurPourBackfill: executerConnecteurPourBackfillMock }));
    expect(appelsParRun[0]).toHaveLength(3); // les 3 mois tentés au run 1

    runCourant = 1;
    await executerBackfill(optionsCommunes, deps({ auditerProfondeurs, executerConnecteurPourBackfill: executerConnecteurPourBackfillMock }));

    // Seul le mois échoué au run 1 (juin 2026) est retenté au run 2 — jamais juillet ni mai, déjà réussis.
    expect(appelsParRun[1]).toEqual([{ annee: '2026', moisNumero: '06' }]);

    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(checkpoint.connecteurs['conn-a']?.moisRestants).toEqual([]);
  });

  it('(e) un pilote restreint à un sous-ensemble explicite ne touche que ce sous-ensemble', async () => {
    const traites: string[] = [];

    await executerBackfill(
      { cheminCheckpoint, connecteurIds: ['conn-b'], espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 1), profondeur('conn-b', 1), profondeur('conn-c', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          traites.push(connecteur.id);
          return { execution: executionFausse('succes'), causeReseauSiEchec: null };
        },
      }),
    );

    expect(traites).toEqual(['conn-b']);
    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(Object.keys(checkpoint.connecteurs)).toEqual(['conn-b']);
  });
});

/**
 * (d) Resollicitation volontaire d'un couple déjà traité avec succès : le
 * VRAI runner + la vraie détection de doublon (dedupe.ts) garantissent
 * qu'aucun événement n'est publié en double — même patron que
 * `idempotence.test.ts` (Q-006 : répertoire temporaire jetable, jamais les
 * vrais fichiers de données).
 */
describe('backfill-historique — non-duplication en cas de resollicitation volontaire (US3, T014 scénario d)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const REAL_DATA_DIR = path.join(__dirname, '../../../src/data');
  const FIXTURE_HTML_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');
  const CONNECTEUR_ID = 'test-backfill-dedupe-19';
  const URL_LISTE = 'https://exemple-backfill-dedupe.gouv.fr/Publications/RAA';

  const ENTREE: ConnecteurEntree = {
    id: CONNECTEUR_ID,
    nom: 'Connecteur de test backfill/dedupe (feature 005)',
    departements_couverts: ['19'],
    actif: true,
    derniere_collecte: null,
    type_connecteur: 'page_web',
  };

  const CONFIG = {
    url_liste: URL_LISTE,
    selecteur_publications: '.raa-item',
    selecteur_titre: '.raa-item__titre',
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

  let tempDataDir: string;
  let html: string;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-backfill-dedupe-'));
    await mkdir(path.join(tempDataDir, 'events'), { recursive: true });

    const connecteursReels = (await lireOuAbsent(path.join(REAL_DATA_DIR, 'connecteurs.json'))) ?? '[]\n';
    const reels = JSON.parse(connecteursReels) as Array<Record<string, unknown>>;
    await writeFile(path.join(tempDataDir, 'connecteurs.json'), JSON.stringify([...reels, ENTREE], null, 2), 'utf-8');
    await writeFile(path.join(tempDataDir, 'executions.json'), '[]', 'utf-8');
    await writeFile(path.join(tempDataDir, 'anomalies.json'), '[]', 'utf-8');
    await writeFile(path.join(tempDataDir, 'events', '19.json'), '[]', 'utf-8');

    html = await readFile(FIXTURE_HTML_PATH, 'utf-8');

    definirRepertoireDonnees(tempDataDir);
    resetDataStoreCache();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE) return { ok: true, status: 200, text: async () => html } as unknown as Response;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );
  });

  afterEach(async () => {
    definirRepertoireDonnees(null);
    resetDataStoreCache();
    vi.unstubAllGlobals();
    await rm(tempDataDir, { recursive: true, force: true }).catch(() => {});
  });

  it('resolliciter le même (connecteur, mois cible) ne publie jamais un second événement (dedupe.ts réel)', async () => {
    const connecteur = creerConnecteur(ENTREE, CONFIG);
    const cible: AnneeMois = { annee: '2026', moisNumero: '08' };

    const { execution: executionUn } = await executerConnecteurPourBackfill(connecteur, cible);
    expect(executionUn.declenchement).toBe('backfill');
    expect(executionUn.nombre_evenements_publies).toBe(1);

    // Resollicitation volontaire du MÊME couple (ex. un opérateur relance le script après une reprise mal jugée) :
    const { execution: executionDeux } = await executerConnecteurPourBackfill(connecteur, cible);
    expect(executionDeux.nombre_evenements_publies).toBe(0);

    const store = await loadDataStore(true);
    const evenements19 = store.evenementsByDepartement.get('19') ?? [];
    expect(evenements19.filter((e) => e.reference_arrete === '2026-77-0512')).toHaveLength(1);
  });
});
