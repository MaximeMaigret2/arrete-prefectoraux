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

function executionFausse(
  statut: 'succes' | 'echec' | 'incertain',
  options?: { nombreCandidatsNonResolus?: number },
): ExecutionCollecte {
  // feature 007 (US3) : nombre_candidats_non_resolus par défaut à 1 pour
  // 'incertain' (cohérent avec la règle de ExecutionCollecteSchema),
  // toujours 0 pour 'succes'/'echec' sauf override explicite.
  const nombreCandidatsNonResolus = options?.nombreCandidatsNonResolus ?? (statut === 'incertain' ? 1 : 0);
  return {
    id: `exec-${Math.random().toString(36).slice(2)}`,
    connecteur_id: 'test',
    date_execution: new Date().toISOString(),
    declenchement: 'backfill',
    statut,
    nombre_evenements_publies: 0,
    nombre_anomalies: 0,
    nombre_candidats_non_resolus: nombreCandidatsNonResolus,
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

  // Feature « PDF par PDF » (2026-09-08) : l'orchestration appelle désormais
  // `executerConnecteurPourBackfillIncremental`, jamais plus
  // `executerConnecteurPourBackfill` directement (cf. `executerBackfill`).
  // Par défaut, `executerConnecteurPourBackfillIncremental` délègue tel
  // quel à `executerConnecteurPourBackfill` (lu sur `resultat`, donc APRÈS
  // application d'un éventuel override — un test qui ne fournit qu'un
  // `executerConnecteurPourBackfill` continue de fonctionner sans
  // modification), avec `urlsResoluesCetteExecution: []` (aucun des tests
  // de ce bloc n'exerce le suivi par URL, réservé aux tests dédiés
  // ci-dessous qui overrident `executerConnecteurPourBackfillIncremental`
  // directement).
  function deps(overrides: Partial<DependancesBackfill>): DependancesBackfill {
    const resultat: DependancesBackfill = {
      auditerProfondeurs: async () => [],
      obtenirConnecteur: async (id) => connecteurFactice(id),
      executerConnecteurPourBackfill: async () => ({ execution: executionFausse('succes'), causeReseauSiEchec: null }),
      executerConnecteurPourBackfillIncremental: async (connecteur, cible) => {
        const { execution, causeReseauSiEchec, anneesCouvertes } = await resultat.executerConnecteurPourBackfill(
          connecteur,
          cible,
        );
        return { execution, causeReseauSiEchec, anneesCouvertes: anneesCouvertes ?? null, urlsResoluesCetteExecution: [] };
      },
      attendre: async () => {},
      maintenant: () => MAINTENANT,
      ...overrides,
    };
    return resultat;
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

  it('(a bis) traite les connecteurs en round-robin mois par mois, jamais un connecteur en profondeur avant de passer au suivant', async () => {
    const ordreAppels: string[] = [];

    await executerBackfill(
      { cheminCheckpoint, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 3), profondeur('conn-b', 2)],
        executerConnecteurPourBackfill: async (connecteur, cible) => {
          ordreAppels.push(`${connecteur.id}:${cible.moisNumero}`);
          return { execution: executionFausse('succes'), causeReseauSiEchec: null };
        },
      }),
    );

    // conn-a (3 mois cibles) et conn-b (2 mois cibles) doivent alterner tour
    // par tour - un seul mois tenté par connecteur avant de passer au
    // suivant - plutôt que conn-a épuisant ses 3 mois avant que conn-b ne
    // soit jamais touché (ancien comportement, en profondeur). conn-b
    // s'épuise après le tour 2 (2 mois cibles) ; conn-a poursuit seul au
    // tour 3 pour son 3e et dernier mois.
    expect(ordreAppels).toEqual(['conn-a:07', 'conn-b:07', 'conn-a:06', 'conn-b:06', 'conn-a:05']);
  });

  it("(b) feature 008 (FR-001/FR-002/FR-006) : le circuit-breaker interrompt uniquement le connecteur concerné après SON PROPRE seuil d'échecs réseau consécutifs, sans jamais empêcher les autres connecteurs du même groupe d'être tentés", async () => {
    const appelsMutualise: string[] = [];
    let appelsMoselle = 0;

    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 3), profondeur('conn-b', 3), profondeur('prefecture-57', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          if (connecteur.id === 'prefecture-57') {
            appelsMoselle += 1;
            return { execution: executionFausse('succes'), causeReseauSiEchec: null };
          }
          appelsMutualise.push(connecteur.id);
          if (connecteur.id === 'conn-a') {
            return { execution: executionFausse('echec'), causeReseauSiEchec: true };
          }
          return { execution: executionFausse('succes'), causeReseauSiEchec: null };
        },
      }),
    );

    // conn-a échoue à chaque tentative et atteint son propre seuil (2) au
    // 2e tour — il est alors retiré du round-robin de ce run. conn-b, dans
    // le MÊME groupe d'hébergement, continue pourtant d'être tenté à
    // CHAQUE tour (round-robin) et obtient bien ses 3 succès : l'échec de
    // conn-a n'a jamais empêché conn-b d'être tenté (FR-001).
    expect(appelsMutualise).toEqual(['conn-a', 'conn-b', 'conn-a', 'conn-b', 'conn-b']);
    const rapportMutualise = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportMutualise.moisReussis).toBe(3);
    expect(rapportMutualise.connecteursTraites).toEqual(['conn-a', 'conn-b']);
    // FR-006 : le rapport détaille, par connecteur, chaque interruption due à ce mécanisme.
    expect(rapportMutualise.connecteursInterrompus).toEqual([
      { connecteurId: 'conn-a', moisRestants: 3, raison: 'echecs_reseau_consecutifs' },
    ]);

    // La file Moselle (hébergeur distinct) n'est jamais affectée.
    expect(appelsMoselle).toBe(1);
    const rapportMoselle = rapport.groupes.find((g) => g.groupe === 'moselle')!;
    expect(rapportMoselle.connecteursInterrompus).toEqual([]);
    expect(rapportMoselle.moisReussis).toBe(1);

    // conn-a n'a jamais réussi : ses mois restent au checkpoint pour une reprise ultérieure (FR-003).
    // conn-b a réussi ses 3 mois cibles : plus rien en attente pour lui.
    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(checkpoint.connecteurs['conn-a']?.moisRestants).toHaveLength(3);
    expect(checkpoint.connecteurs['conn-b']?.moisRestants).toHaveLength(0);
  });

  it("(g) feature 008 (FR-003) : après interruption par le circuit-breaker, une reprise retente exactement les mois non résolus, sans perte ni duplication", async () => {
    const appelsParRun: string[][] = [[], []];
    let runCourant = 0;
    let echoueEncore = true;

    const executerConnecteurPourBackfillMock = async (_connecteur: Connecteur, cible: AnneeMois) => {
      appelsParRun[runCourant]!.push(`${cible.annee}-${cible.moisNumero}`);
      if (echoueEncore) return { execution: executionFausse('echec'), causeReseauSiEchec: true };
      return { execution: executionFausse('succes'), causeReseauSiEchec: null };
    };

    const auditerProfondeurs = async () => [profondeur('conn-a', 3)]; // M-1, M-2, M-3 = juillet, juin, mai 2026
    const optionsCommunes = { cheminCheckpoint, espacementMinimumMs: 0, seuilEchecsConnecteur: 2 };

    const rapport1 = await executerBackfill(
      optionsCommunes,
      deps({ auditerProfondeurs, executerConnecteurPourBackfill: executerConnecteurPourBackfillMock }),
    );

    // Run 1 : conn-a échoue à ses 2 premières tentatives (seuil de 2) et est
    // interrompu — son 3e mois cible n'est jamais tenté ce run.
    expect(appelsParRun[0]).toEqual(['2026-07', '2026-06']);
    expect(rapport1.groupes.find((g) => g.groupe === 'mutualise')?.connecteursInterrompus).toEqual([
      { connecteurId: 'conn-a', moisRestants: 3, raison: 'echecs_reseau_consecutifs' },
    ]);

    runCourant = 1;
    echoueEncore = false;
    await executerBackfill(
      optionsCommunes,
      deps({ auditerProfondeurs, executerConnecteurPourBackfill: executerConnecteurPourBackfillMock }),
    );

    // Run 2 : les 3 mois cibles (les 2 déjà tentés en échec + le 3e jamais
    // tenté au run 1) sont retentés — aucun perdu, aucun dupliqué.
    expect(appelsParRun[1]).toEqual(['2026-07', '2026-06', '2026-05']);
    const checkpointFinal = await lireCheckpoint(cheminCheckpoint);
    expect(checkpointFinal.connecteurs['conn-a']?.moisRestants).toEqual([]);
  });

  it("(h) feature 008 (FR-005) : un connecteur qui alterne échec réseau et succès (jamais deux échecs consécutifs) n'est jamais interrompu, quel que soit le total d'échecs non consécutifs", async () => {
    let compteur = 0;
    const appels: string[] = [];

    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 4)],
        executerConnecteurPourBackfill: async (connecteur, cible) => {
          appels.push(`${cible.annee}-${cible.moisNumero}`);
          compteur += 1;
          // Échoue aux tentatives impaires, réussit aux tentatives paires — jamais deux échecs consécutifs.
          const echoue = compteur % 2 === 1;
          return { execution: executionFausse(echoue ? 'echec' : 'succes'), causeReseauSiEchec: echoue ? true : null };
        },
      }),
    );

    // Les 4 mois cibles sont bien tous tentés — jamais interrompu malgré 2 échecs au total (non consécutifs).
    expect(appels).toHaveLength(4);
    const rapportGroupe = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportGroupe.connecteursInterrompus).toEqual([]);
    expect(rapportGroupe.moisReussis).toBe(2);
    expect(rapportGroupe.moisEchecReseau).toBe(2);
  });

  it("(i) US1 Acceptance Scenario 5 : un groupe à un seul connecteur (Moselle) qui dépasse le seuil se comporte comme avant (rien d'autre à préserver dans ce groupe)", async () => {
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('prefecture-57', 3)],
        executerConnecteurPourBackfill: async () => ({ execution: executionFausse('echec'), causeReseauSiEchec: true }),
      }),
    );

    const rapportMoselle = rapport.groupes.find((g) => g.groupe === 'moselle')!;
    expect(rapportMoselle.connecteursInterrompus).toEqual([
      { connecteurId: 'prefecture-57', moisRestants: 3, raison: 'echecs_reseau_consecutifs' },
    ]);
    expect(rapportMoselle.moisReussis).toBe(0);
    // Note : aucun succès n'est survenu de tout le run (groupe à un seul
    // connecteur, échec systématique) - `ecrireCheckpoint` n'est donc jamais
    // appelé (il ne l'est qu'après un succès, cf. runner) et le fichier de
    // checkpoint reste absent. C'est le rapport, pas le fichier, qui porte
    // l'information dans ce cas dégénéré (couvert plus en détail par le
    // test (j) ci-dessous, avec un groupe à plusieurs connecteurs).
  });

  it("(j) un run où TOUS les connecteurs d'un groupe échouent se termine proprement (pas de boucle infinie), avec un rapport clair", async () => {
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 2), profondeur('conn-b', 2)],
        executerConnecteurPourBackfill: async () => ({ execution: executionFausse('echec'), causeReseauSiEchec: true }),
      }),
    );

    const rapportGroupe = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportGroupe.moisReussis).toBe(0);
    expect(rapportGroupe.connecteursInterrompus).toHaveLength(2);
    expect(rapportGroupe.connecteursInterrompus.map((c) => c.connecteurId).sort()).toEqual(['conn-a', 'conn-b']);
  });

  it("(k) US2/FR-007 : un nombre configurable de connecteurs consécutifs entièrement en échec, sans succès interposé, déclenche le signal de dégradation généralisée — jamais bloquant", async () => {
    const appels: string[] = [];
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 1, seuilDegradationGeneralisee: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 1), profondeur('conn-b', 1), profondeur('conn-c', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          appels.push(connecteur.id);
          if (connecteur.id === 'conn-c') return { execution: executionFausse('succes'), causeReseauSiEchec: null };
          return { execution: executionFausse('echec'), causeReseauSiEchec: true };
        },
      }),
    );

    // conn-a puis conn-b échouent entièrement (0 succès chacun), consécutifs, sans succès interposé.
    // conn-c, 3e du groupe, est malgré tout tenté normalement — ce signal ne bloque jamais rien.
    expect(appels).toEqual(['conn-a', 'conn-b', 'conn-c']);
    const rapportGroupe = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportGroupe.degradationGeneraliseeDetectee).toBe(true);
    expect(rapportGroupe.moisReussis).toBe(1);
  });

  it("(l) US2/FR-007 : le signal de dégradation généralisée ne se déclenche jamais si un succès s'interpose entre les échecs, quel que soit le nombre total de connecteurs en échec", async () => {
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 1, seuilDegradationGeneralisee: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [
          profondeur('conn-a', 1),
          profondeur('conn-b', 1),
          profondeur('conn-c', 1),
          profondeur('conn-d', 1),
        ],
        executerConnecteurPourBackfill: async (connecteur) => {
          // conn-b et conn-d réussissent — jamais deux échecs totaux consécutifs sans succès interposé.
          if (connecteur.id === 'conn-b' || connecteur.id === 'conn-d') {
            return { execution: executionFausse('succes'), causeReseauSiEchec: null };
          }
          return { execution: executionFausse('echec'), causeReseauSiEchec: true };
        },
      }),
    );

    const rapportGroupe = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportGroupe.degradationGeneraliseeDetectee).toBe(false);
  });

  it("(b bis) une page introuvable (archives épuisées) n'ouvre jamais le circuit-breaker, même répétée", async () => {
    let appels = 0;
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
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
    expect(rapportMutualise.connecteursInterrompus).toEqual([]);
    // conn-b, dans la même file, est bien atteint (le circuit-breaker par connecteur n'a jamais été déclenché).
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

    const optionsCommunes = { cheminCheckpoint, espacementMinimumMs: 0, seuilEchecsConnecteur: 10 };
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

  it("(a ter) un connecteur qui signale anneesCouvertes marque d'un coup TOUS les mois restants de cette année (checkpoint ET file du run en cours), feature 005 backfill historique 2026-09-04", async () => {
    const appels: string[] = [];

    const rapport = await executerBackfill(
      { cheminCheckpoint, espacementMinimumMs: 0 },
      deps({
        // conn-a : 4 mois cibles, tous en 2026 (M-1..M-4 depuis août 2026 = juil/juin/mai/avril 2026).
        auditerProfondeurs: async () => [profondeur('conn-a', 4)],
        executerConnecteurPourBackfill: async (connecteur, cible) => {
          appels.push(`${connecteur.id}:${cible.annee}-${cible.moisNumero}`);
          // Le tout premier mois tenté (juillet 2026) réussit et couvre l'année 2026 entière.
          return {
            execution: executionFausse('succes'),
            causeReseauSiEchec: null,
            anneesCouvertes: ['2026'],
          };
        },
      }),
    );

    // Un seul appel réseau : les 3 autres mois cibles de 2026, encore dans
    // la file de ce même run, sont retirés sans jamais être resollicités.
    expect(appels).toEqual(['conn-a:2026-07']);
    // Les 4 mois cibles (tous en 2026) comptent comme résolus par ce seul succès.
    expect(rapport.groupes.find((g) => g.groupe === 'mutualise')?.moisReussis).toBe(4);

    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(checkpoint.connecteurs['conn-a']?.moisRestants).toEqual([]);
  });

  it("(a quater) anneesCouvertes ne retire que les mois de l'année couverte, jamais ceux d'une autre année ni d'un autre connecteur", async () => {
    const appels: string[] = [];

    await executerBackfill(
      { cheminCheckpoint, espacementMinimumMs: 0 },
      deps({
        // conn-a : 14 mois cibles depuis aout 2026 -> remonte jusqu'en 2025 (M-1..M-14).
        auditerProfondeurs: async () => [profondeur('conn-a', 14), profondeur('conn-b', 1)],
        executerConnecteurPourBackfill: async (connecteur, cible) => {
          appels.push(`${connecteur.id}:${cible.annee}-${cible.moisNumero}`);
          if (connecteur.id === 'conn-b') {
            return { execution: executionFausse('succes'), causeReseauSiEchec: null };
          }
          // conn-a couvre 2026 entier dès son tout premier mois cible (juillet 2026) - 2025 doit rester intact.
          return { execution: executionFausse('succes'), causeReseauSiEchec: null, anneesCouvertes: ['2026'] };
        },
      }),
    );

    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    // 2026 entièrement retiré (M-1..M-7 depuis août 2026 = juillet à janvier 2026, 7 mois cibles),
    // 2025 intact (M-8..M-14 = décembre à juin 2025, 7 mois cibles restants).
    const restants = checkpoint.connecteurs['conn-a']?.moisRestants ?? [];
    expect(restants.every((m) => m.annee === '2025')).toBe(true);
    expect(restants).toHaveLength(7);
    // conn-b, non concerné par anneesCouvertes de conn-a, traité normalement.
    expect(checkpoint.connecteurs['conn-b']?.moisRestants).toEqual([]);
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

  it("(e bis) l'ordre donné dans --pilote fait foi, même s'il diffère de l'ordre de l'audit (bug corrigé le 2026-09-05)", async () => {
    const traites: string[] = [];

    await executerBackfill(
      // conn-c en tête du pilote alors que l'audit (simulé ici dans l'ordre
      // alphabétique, comme le fait réellement `auditerProfondeurs`) le
      // liste en dernier - conn-c doit malgré tout être traité en premier.
      { cheminCheckpoint, connecteurIds: ['conn-c', 'conn-a', 'conn-b'], espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 1), profondeur('conn-b', 1), profondeur('conn-c', 1)],
        executerConnecteurPourBackfill: async (connecteur) => {
          traites.push(connecteur.id);
          return { execution: executionFausse('succes'), causeReseauSiEchec: null };
        },
      }),
    );

    expect(traites).toEqual(['conn-c', 'conn-a', 'conn-b']);
  });

  it("(f) feature 007 (US3, FR-011/FR-013) : une exécution incertaine (candidat non résolu) ne retire JAMAIS le mois du checkpoint, ni ne compte dans le circuit-breaker", async () => {
    const appels: string[] = [];

    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
      deps({
        auditerProfondeurs: async () => [profondeur('conn-a', 3)],
        executerConnecteurPourBackfill: async (connecteur, cible) => {
          appels.push(`${connecteur.id}:${cible.moisNumero}`);
          return { execution: executionFausse('incertain'), causeReseauSiEchec: null };
        },
      }),
    );

    // Les 3 mois cibles sont bien tentés (jamais interrompu par le circuit-breaker par connecteur).
    expect(appels).toHaveLength(3);
    const rapportGroupe = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportGroupe.connecteursInterrompus).toEqual([]);
    expect(rapportGroupe.moisReussis).toBe(0);
    expect(rapportGroupe.moisEchecReseau).toBe(0);
    expect(rapportGroupe.moisNonResolus).toBe(3);
    // La reprise effective (aucun mois perdu) est vérifiée par le test (f ter) ci-dessous,
    // qui exerce deux runs successifs — plus fiable qu'une lecture directe du fichier de
    // checkpoint, jamais écrit sur disque ici puisqu'aucun mois n'a réellement changé d'état.
  });

  it('(f bis) une exécution incertaine répétée ne déclenche jamais le circuit-breaker, contrairement à un échec réseau', async () => {
    const rapport = await executerBackfill(
      { cheminCheckpoint, seuilEchecsConnecteur: 2, espacementMinimumMs: 0 },
      deps({
        // 5 mois cibles, largement au-dessus du seuil de 2 — si ce signal
        // comptait comme un échec réseau, ce connecteur serait interrompu avant la fin.
        auditerProfondeurs: async () => [profondeur('conn-a', 5)],
        executerConnecteurPourBackfill: async () => ({ execution: executionFausse('incertain'), causeReseauSiEchec: null }),
      }),
    );

    const rapportGroupe = rapport.groupes.find((g) => g.groupe === 'mutualise')!;
    expect(rapportGroupe.connecteursInterrompus).toEqual([]);
    expect(rapportGroupe.moisNonResolus).toBe(5);
  });

  it('(f ter) une reprise ultérieure retente normalement un mois laissé incertain — comportement identique à un échec réseau du point de vue de la reprise', async () => {
    const appelsParRun: AnneeMois[][] = [[], []];
    let runCourant = 0;

    const executerConnecteurPourBackfillMock = async (_connecteur: Connecteur, cible: AnneeMois) => {
      appelsParRun[runCourant]!.push(cible);
      const estDeuxiemeMois = cible.moisNumero === '06'; // M-2 pour août 2026 = juin
      const incertainCeRun = runCourant === 0 && estDeuxiemeMois;
      return {
        execution: incertainCeRun ? executionFausse('incertain') : executionFausse('succes'),
        causeReseauSiEchec: null,
      };
    };

    const optionsCommunes = { cheminCheckpoint, espacementMinimumMs: 0, seuilEchecsConnecteur: 10 };
    const auditerProfondeurs = async () => [profondeur('conn-a', 3)];

    await executerBackfill(optionsCommunes, deps({ auditerProfondeurs, executerConnecteurPourBackfill: executerConnecteurPourBackfillMock }));
    expect(appelsParRun[0]).toHaveLength(3);

    runCourant = 1;
    await executerBackfill(optionsCommunes, deps({ auditerProfondeurs, executerConnecteurPourBackfill: executerConnecteurPourBackfillMock }));

    // Seul le mois laissé incertain au run 1 (juin 2026) est retenté au run 2.
    expect(appelsParRun[1]).toEqual([{ annee: '2026', moisNumero: '06' }]);
    const checkpoint = await lireCheckpoint(cheminCheckpoint);
    expect(checkpoint.connecteurs['conn-a']?.moisRestants).toEqual([]);
  });

  it(
    "(f quater) feature « PDF par PDF » (2026-09-08) : urlsResoluesParMois du checkpoint est transmis en urlsDejaResolues, " +
      'et onUrlResolue écrit le checkpoint IMMÉDIATEMENT (avant même le retour de executerConnecteurPourBackfillIncremental)',
    async () => {
      // Checkpoint pré-existant (reprise) : conn-a, juin 2026 déjà tenté une
      // première fois, un PDF ("url-x") déjà résolu lors de cette tentative.
      await writeFile(
        cheminCheckpoint,
        JSON.stringify({
          version: 1,
          connecteurs: {
            'conn-a': {
              profondeurCibleMois: 1,
              moisRestants: [{ annee: '2026', moisNumero: '06' }],
              archivesEpuisees: false,
              urlsResoluesParMois: { '2026-06': ['url-x'] },
            },
          },
        }),
        'utf-8',
      );

      let urlsDejaResoluesRecue: ReadonlySet<string> | undefined;
      let checkpointVuDepuisOnUrlResolue: unknown;

      await executerBackfill(
        { cheminCheckpoint, espacementMinimumMs: 0 },
        deps({
          auditerProfondeurs: async () => [profondeur('conn-a', 1)],
          executerConnecteurPourBackfillIncremental: async (_connecteur, _cible, urlsDejaResolues, onUrlResolue) => {
            urlsDejaResoluesRecue = urlsDejaResolues;
            // Résout un NOUVEAU PDF ("url-y") — l'appelant doit écrire le
            // checkpoint tout de suite, sans attendre que cette fonction
            // revienne (simule une interruption juste après, cf. doc de
            // `executerConnecteurPourBackfillIncremental`, runner.ts).
            await onUrlResolue?.('url-y');
            checkpointVuDepuisOnUrlResolue = await lireCheckpoint(cheminCheckpoint);
            return {
              execution: executionFausse('incertain'),
              causeReseauSiEchec: null,
              anneesCouvertes: null,
              urlsResoluesCetteExecution: ['url-x', 'url-y'],
            };
          },
        }),
      );

      expect(Array.from(urlsDejaResoluesRecue ?? []).sort()).toEqual(['url-x']);
      // Déjà visible sur disque AVANT le retour de la fonction mockée.
      expect(
        (checkpointVuDepuisOnUrlResolue as { connecteurs: Record<string, { urlsResoluesParMois?: Record<string, string[]> }> })
          .connecteurs['conn-a']?.urlsResoluesParMois?.['2026-06'],
      ).toEqual(['url-x', 'url-y']);

      const checkpointFinal = await lireCheckpoint(cheminCheckpoint);
      // Mois resté "incertain" : le suivi par URL persiste pour la prochaine reprise.
      expect(checkpointFinal.connecteurs['conn-a']?.urlsResoluesParMois?.['2026-06']).toEqual(['url-x', 'url-y']);
    },
  );

  it(
    '(f quinquies) le suivi urlsResoluesParMois est purgé dès que le mois quitte moisRestants (succès complet)',
    async () => {
      await writeFile(
        cheminCheckpoint,
        JSON.stringify({
          version: 1,
          connecteurs: {
            'conn-a': {
              profondeurCibleMois: 1,
              moisRestants: [{ annee: '2026', moisNumero: '06' }],
              archivesEpuisees: false,
              urlsResoluesParMois: { '2026-06': ['url-x', 'url-y'] },
            },
          },
        }),
        'utf-8',
      );

      await executerBackfill(
        { cheminCheckpoint, espacementMinimumMs: 0 },
        deps({
          auditerProfondeurs: async () => [profondeur('conn-a', 1)],
          executerConnecteurPourBackfillIncremental: async () => ({
            execution: executionFausse('succes'),
            causeReseauSiEchec: null,
            anneesCouvertes: null,
            urlsResoluesCetteExecution: ['url-x', 'url-y'],
          }),
        }),
      );

      const checkpoint = await lireCheckpoint(cheminCheckpoint);
      expect(checkpoint.connecteurs['conn-a']?.moisRestants).toEqual([]);
      // Le mois a réussi intégralement : plus jamais besoin d'être repris,
      // son suivi par URL n'a plus de raison d'être conservé.
      expect(checkpoint.connecteurs['conn-a']?.urlsResoluesParMois?.['2026-06']).toBeUndefined();
    },
  );
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
