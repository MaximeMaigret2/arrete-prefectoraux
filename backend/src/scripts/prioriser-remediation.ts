/**
 * Priorisation, en lecture seule, du périmètre à rejouer pour la
 * remédiation de l'historique déjà collecté avant le correctif de la
 * feature 007 (US4, FR-017/FR-009).
 *
 * N'écrit rien (ni checkpoint, ni données applicatives, ni aucune collecte
 * réelle) — un opérateur consulte ce rapport pour DÉCIDER du sous-ensemble
 * à réactiver (`reactiver-mois-checkpoint.ts`), jamais un lancement
 * automatique (spec.md, Assumptions : aucun moyen de savoir avec certitude
 * quelles exécutions `succes` passées ont réellement perdu un candidat —
 * seule une priorisation par plausibilité est proposée, jamais une
 * identification certaine).
 *
 * Deux signaux distincts, classés séparément puis combinés :
 * - PREUVE DIRECTE : des anomalies `candidat_non_resolu` déjà présentes
 *   pour ce connecteur (US2) — il a déjà été relancé après le correctif et
 *   a lui-même détecté un cas réel.
 * - PLAUSIBILITÉ (FR-017) : un connecteur `page_web` à `granularite_liste:
 *   'annuelle'` (cf. moteurs/pageWeb/config.schema.ts) dont des exécutions
 *   `backfill` passées se sont soldées par un `succes` à 0 événement publié
 *   — signature exacte du faux succès du Morbihan qui a motivé cette
 *   feature (un candidat perdu, la page annuelle marquée couverte quand
 *   même). Un connecteur SANS `granularite_liste: 'annuelle'` n'a pas ce
 *   risque particulier (chaque mois a sa propre page liste) mais reste
 *   listé si des `candidat_non_resolu` existent déjà pour lui.
 */
import { loadDataStore, type DataStore } from '../data/loader.js';
import { chargerConfigConnecteur } from '../connecteurs/registry.js';
import { PageWebConfigSchema } from '../connecteurs/moteurs/pageWeb/config.schema.js';

/** Une ligne du rapport de priorisation, pour un connecteur donné. */
export interface EntreePrioriteRemediation {
  connecteurId: string;
  departementCode: string;
  granulariteAnnuelle: boolean;
  /**
   * Nombre d'exécutions `backfill` passées, `succes`, à 0 événement publié
   * — signal de plausibilité (FR-017), jamais une preuve certaine.
   */
  nombreExecutionsBackfillSuccesZeroEvenement: number;
  /**
   * Nombre d'anomalies `candidat_non_resolu` actuellement `en_attente`
   * pour ce connecteur (US2) — preuve directe, si le connecteur a déjà été
   * relancé après le correctif.
   */
  candidatsNonResolusActuels: number;
}

/** Dépendances injectables (testabilité, T016 — aucun réseau réel dans la suite automatisée). */
export interface DependancesPrioriteRemediation {
  loadDataStore: () => Promise<Pick<DataStore, 'connecteurs' | 'executions' | 'anomalies'>>;
  chargerConfigConnecteur: (connecteurId: string) => Promise<unknown>;
}

/**
 * Calcule le rapport de priorisation pour l'ensemble des connecteurs
 * `page_web` actifs. Un connecteur sans aucun des deux signaux (ni
 * `granularite_liste: 'annuelle'`, ni `candidat_non_resolu` existant,
 * ni exécution `backfill` `succes` à 0 événement) n'apparaît pas dans le
 * résultat — un rapport centré sur ce qui reste à examiner, même esprit
 * que `/api/v1/admin/anomalies` (FR-009).
 */
export async function prioriserRemediation(
  deps: DependancesPrioriteRemediation,
): Promise<EntreePrioriteRemediation[]> {
  const store = await deps.loadDataStore();
  const resultats: EntreePrioriteRemediation[] = [];

  for (const connecteur of store.connecteurs) {
    if (connecteur.type_connecteur !== 'page_web') continue;

    let granulariteAnnuelle = false;
    try {
      const configBrute = await deps.chargerConfigConnecteur(connecteur.id);
      const config = PageWebConfigSchema.parse(configBrute);
      granulariteAnnuelle = config.granularite_liste === 'annuelle';
    } catch {
      // Config manquante/invalide pour ce connecteur : hors périmètre de ce
      // script en lecture seule, jamais un blocage pour les autres (même
      // esprit que auditerProfondeurs/executerBackfill, FR-009).
      continue;
    }

    const nombreExecutionsBackfillSuccesZeroEvenement = store.executions.filter(
      (e) =>
        e.connecteur_id === connecteur.id &&
        e.declenchement === 'backfill' &&
        e.statut === 'succes' &&
        e.nombre_evenements_publies === 0,
    ).length;

    const candidatsNonResolusActuels = store.anomalies.filter(
      (a) =>
        a.connecteur_id === connecteur.id &&
        a.type_anomalie === 'candidat_non_resolu' &&
        a.statut === 'en_attente',
    ).length;

    if (
      !granulariteAnnuelle &&
      nombreExecutionsBackfillSuccesZeroEvenement === 0 &&
      candidatsNonResolusActuels === 0
    ) {
      continue;
    }

    resultats.push({
      connecteurId: connecteur.id,
      departementCode: connecteur.departements_couverts[0] ?? '',
      granulariteAnnuelle,
      nombreExecutionsBackfillSuccesZeroEvenement,
      candidatsNonResolusActuels,
    });
  }

  // Priorité : preuve directe d'abord (candidatsNonResolusActuels décroissant),
  // puis plausibilité (granularité annuelle avant le reste, puis nombre
  // d'exécutions succes-à-zéro décroissant) — jamais l'inverse, une preuve
  // directe l'emporte toujours sur une simple plausibilité (FR-017).
  resultats.sort((a, b) => {
    if (a.candidatsNonResolusActuels !== b.candidatsNonResolusActuels) {
      return b.candidatsNonResolusActuels - a.candidatsNonResolusActuels;
    }
    if (a.granulariteAnnuelle !== b.granulariteAnnuelle) {
      return a.granulariteAnnuelle ? -1 : 1;
    }
    return b.nombreExecutionsBackfillSuccesZeroEvenement - a.nombreExecutionsBackfillSuccesZeroEvenement;
  });

  return resultats;
}

async function main(): Promise<void> {
  const rapport = await prioriserRemediation({ loadDataStore, chargerConfigConnecteur });
  if (rapport.length === 0) {
    console.log('Aucun connecteur ne présente de signal de priorisation (ni candidat_non_resolu, ni granularité annuelle avec succès à 0 événement).');
    return;
  }
  for (const entree of rapport) {
    const signaux: string[] = [];
    if (entree.candidatsNonResolusActuels > 0) {
      signaux.push(`${entree.candidatsNonResolusActuels} candidat(s) non résolu(s) actuel(s)`);
    }
    if (entree.granulariteAnnuelle) {
      signaux.push(
        `granularité annuelle, ${entree.nombreExecutionsBackfillSuccesZeroEvenement} exécution(s) backfill succès-à-0-événement`,
      );
    } else if (entree.nombreExecutionsBackfillSuccesZeroEvenement > 0) {
      signaux.push(`${entree.nombreExecutionsBackfillSuccesZeroEvenement} exécution(s) backfill succès-à-0-événement`);
    }
    console.log(`${entree.connecteurId} (département ${entree.departementCode}) : ${signaux.join(' ; ')}`);
  }
  console.log(`\n${rapport.length} connecteur(s) à examiner, par priorité décroissante ci-dessus.`);
}

// N'exécute le CLI que si ce fichier est lancé directement — jamais lors
// d'un import par les tests, même correctif Windows que backfill-historique.ts
// (`import.meta.url` vs `process.argv[1]`, cf. son commentaire).
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
