import { randomUUID } from 'node:crypto';
import {
  appendEvenement,
  appendExecution,
  loadDataStore,
  updateConnecteur,
  upsertAnomalie,
} from '../data/loader.js';
import {
  AnomalieCollecteSchema,
  EvenementSchema,
  ExecutionCollecteSchema,
  type AnomalieCollecte,
  type Declenchement,
  type Evenement,
  type ExecutionCollecte,
  type StatutExecution,
  type TypeAnomalie,
} from '../models/index.js';
import { detecterDoublon } from './dedupe.js';
import type { CandidatEvenement, Connecteur, SourceBrute } from './types.js';
import type { AnneeMois } from '../services/parisDate.js';

/**
 * Orchestration collecte → dedupe → publication/anomalie → journalisation
 * (data-model.md, « Logique de décision » ; contracts/connecteur-interface.md
 * §1). Point d'entrée unique, réutilisé identiquement par le cycle
 * planifié (FR-013) et le déclenchement manuel (FR-014, research.md §6) —
 * un seul chemin d'exécution testé. `runner.ts` ne connaît que
 * l'interface `Connecteur` : aucune branche conditionnelle sur
 * `type_connecteur`.
 */

/** Décision produite par `evaluerCandidat` pour un candidat donné (data-model.md). */
export type ResultatEvaluation =
  | { action: 'publier'; candidat: CandidatEvenement }
  | { action: 'anomalie'; type_anomalie: TypeAnomalie; raison: string };

/**
 * Fonction pure : décide, pour un candidat déjà extrait, s'il doit être
 * publié directement ou donner lieu à une anomalie de collecte
 * (data-model.md, « Logique de décision », étapes 2 à 5 — l'étape 1,
 * échec de lecture de la source elle-même, est traitée en amont par
 * `executerConnecteur` via `ResultatCollecte.echec_global`, avant que le
 * moindre candidat n'existe). Ne lit ni n'écrit aucun stockage — c'est
 * `executerConnecteur` qui persiste la décision.
 */
export function evaluerCandidat(
  candidat: CandidatEvenement,
  historiqueDepartement: Evenement[],
): ResultatEvaluation {
  // Étape 2 : champ requis manquant ou illisible (référence, date de
  // début, autorité signataire — FR-008). `type_evenement` est ajouté à
  // cette liste : un événement sans type n'est de toute façon jamais
  // constructible (EvenementSchema), même si data-model.md ne le cite pas
  // explicitement parmi les champs "extraits par regex".
  const champ = trouverChampManquant(candidat);
  if (champ) {
    return {
      action: 'anomalie',
      type_anomalie: 'champ_manquant',
      raison: `Champ requis manquant ou illisible : ${champ}.`,
    };
  }

  // Étape 3 : date de fin mentionnée dans la source mais non résolvable
  // en date ISO — distincte d'une absence totale de mention
  // (`date_fin: null` sans `date_fin_ambigue`), qui n'est PAS une
  // ambiguïté (data-model.md, étape 3 ; cf. `CandidatEvenement.date_fin_ambigue`).
  if (candidat.date_fin_ambigue) {
    return {
      action: 'anomalie',
      type_anomalie: 'date_ambigue',
      raison: "Date de fin mentionnée dans la source mais non résolvable en date ISO.",
    };
  }

  // Étape 4 : détection de doublon (dedupe.ts, FR-010, research.md §5).
  const detection = detecterDoublon(candidat, historiqueDepartement);
  if (detection.doublon) {
    return {
      action: 'anomalie',
      type_anomalie: 'doublon_potentiel',
      raison: detection.evenementConcerne
        ? `Doublon potentiel avec l'événement existant ${detection.evenementConcerne.id} (référence "${detection.evenementConcerne.reference_arrete ?? 'sans référence'}").`
        : 'Doublon potentiel détecté avec un événement déjà publié pour ce département.',
    };
  }

  // Étape 5 : extraction complète et non ambiguë, aucun doublon → publication directe.
  return { action: 'publier', candidat };
}

/** Vérifie les champs requis pour la publication d'un candidat ; retourne le nom du premier champ manquant, ou `null` si tous sont présents. */
function trouverChampManquant(candidat: CandidatEvenement): string | null {
  if (candidat.type_evenement === null) return 'type_evenement';
  if (!candidat.reference_arrete) return 'reference_arrete';
  if (!candidat.date_debut) return 'date_debut';
  if (!candidat.autorite_signataire) return 'autorite_signataire';
  return null;
}

/** Construit l'`Evenement` persistable à partir d'un candidat retenu pour publication automatique (FR-006). */
function construireEvenement(candidat: CandidatEvenement, connecteurId: string): Evenement {
  return EvenementSchema.parse({
    id: randomUUID(),
    departement_code: candidat.departement_code,
    type_evenement: candidat.type_evenement,
    date_debut: candidat.date_debut,
    date_fin: candidat.date_fin,
    reference_arrete: candidat.reference_arrete,
    autorite_signataire: candidat.autorite_signataire,
    source_url: candidat.source.url,
    date_saisie: new Date().toISOString(),
    connecteur_id: connecteurId,
    methode_collecte: 'automatique',
  });
}

/** Construit l'`AnomalieCollecte` correspondant à un candidat évalué comme anomalie (champs partiels conservés, FR-009). */
function construireAnomalieCandidat(params: {
  connecteurId: string;
  executionId: string;
  typeAnomalie: TypeAnomalie;
  raison: string;
  candidat: CandidatEvenement;
}): AnomalieCollecte {
  const { candidat } = params;
  return AnomalieCollecteSchema.parse({
    id: randomUUID(),
    connecteur_id: params.connecteurId,
    execution_id: params.executionId,
    type_anomalie: params.typeAnomalie,
    champs_extraits: {
      departement_code: candidat.departement_code,
      type_evenement: candidat.type_evenement,
      date_debut: candidat.date_debut,
      date_fin: candidat.date_fin,
      reference_arrete: candidat.reference_arrete,
      autorite_signataire: candidat.autorite_signataire,
      source_url: candidat.source.url,
      connecteur_id: params.connecteurId,
      methode_collecte: 'automatique',
    },
    source_brute: candidat.source,
    departement_code: candidat.departement_code,
    raison: params.raison,
    statut: 'en_attente',
    date_creation: new Date().toISOString(),
    date_resolution: null,
    evenement_resultant_id: null,
  });
}

/** Construit l'`AnomalieCollecte` `echec_lecture_source` pour un département couvert par un connecteur dont la source n'a pas pu être lue du tout (data-model.md, étape 1). */
function construireAnomalieEchecLecture(params: {
  connecteurId: string;
  executionId: string;
  departementCode: string;
  message: string;
  source: SourceBrute;
}): AnomalieCollecte {
  return AnomalieCollecteSchema.parse({
    id: randomUUID(),
    connecteur_id: params.connecteurId,
    execution_id: params.executionId,
    type_anomalie: 'echec_lecture_source',
    champs_extraits: {},
    source_brute: params.source,
    departement_code: params.departementCode,
    raison: params.message,
    statut: 'en_attente',
    date_creation: new Date().toISOString(),
    date_resolution: null,
    evenement_resultant_id: null,
  });
}

/**
 * Exécute un connecteur : collecte, évalue chaque candidat, persiste les
 * publications/anomalies, puis journalise l'exécution (FR-011) et met à
 * jour `Connecteur.derniere_collecte` si la collecte n'a pas échoué
 * totalement (T020A : mise à jour "on success", c'est-à-dire dès que la
 * source a pu être lue — succès complet ou partiel — jamais sur `echec`,
 * où rien de nouveau n'a réellement été observé).
 *
 * `cible` (feature 005, US1/US3, FR-001) : mois calendaire arbitrairement
 * passé, transmis tel quel à `connecteur.collecter(cible)` — absent pour le
 * cycle planifié et le déclenchement manuel existants (comportement
 * rigoureusement inchangé, FR-002), fourni uniquement par la collecte
 * historique (`backfill-historique.ts`, via {@link executerConnecteurPourBackfill}
 * ci-dessous).
 */
async function executerConnecteurAvecClassification(
  connecteur: Connecteur,
  declenchement: Declenchement,
  cible?: AnneeMois,
): Promise<{ execution: ExecutionCollecte; causeReseauSiEchec: boolean | null; anneesCouvertes: string[] | null }> {
  const executionId = randomUUID();
  const dateExecution = new Date().toISOString();

  const store = await loadDataStore();
  // Copie de travail locale de l'historique par département : les
  // publications décidées pendant CE run doivent être visibles par la
  // détection de doublon des candidats suivants du même run, sans
  // dépendre du cache (invalidé à chaque écriture par `data/loader.ts`).
  const historiqueParDepartement = new Map<string, Evenement[]>();
  for (const [code, evenements] of store.evenementsByDepartement) {
    historiqueParDepartement.set(code, [...evenements]);
  }

  let nombrePublies = 0;
  let nombreAnomalies = 0;
  let messageErreur: string | null = null;
  let causeReseauSiEchec: boolean | null = null;
  let anneesCouvertes: string[] | null = null;

  try {
    const resultat = await connecteur.collecter(cible);

    if (resultat.echec_global) {
      messageErreur = resultat.echec_global.message;
      // feature 005 (FR-004/FR-014) : classification exposée telle quelle au
      // consommateur (`executerConnecteurPourBackfill`) — `undefined` (nature
      // non déterminée) est traité prudemment comme un échec réseau.
      causeReseauSiEchec = resultat.echec_global.causeReseau ?? true;
      const departements = connecteur.departements.length > 0 ? connecteur.departements : [];
      for (const departementCode of departements) {
        const anomalie = construireAnomalieEchecLecture({
          connecteurId: connecteur.id,
          executionId,
          departementCode,
          message: resultat.echec_global.message,
          source: resultat.echec_global.source,
        });
        await upsertAnomalie(anomalie);
        nombreAnomalies += 1;
      }
    } else {
      anneesCouvertes = resultat.anneesCouvertes && resultat.anneesCouvertes.length > 0 ? resultat.anneesCouvertes : null;
      for (const candidat of resultat.candidats) {
        const historique = historiqueParDepartement.get(candidat.departement_code) ?? [];
        const evaluation = evaluerCandidat(candidat, historique);

        if (evaluation.action === 'publier') {
          const evenement = construireEvenement(evaluation.candidat, connecteur.id);
          await appendEvenement(evenement);
          historique.push(evenement);
          historiqueParDepartement.set(candidat.departement_code, historique);
          nombrePublies += 1;
        } else {
          const anomalie = construireAnomalieCandidat({
            connecteurId: connecteur.id,
            executionId,
            typeAnomalie: evaluation.type_anomalie,
            raison: evaluation.raison,
            candidat,
          });
          await upsertAnomalie(anomalie);
          nombreAnomalies += 1;
        }
      }
    }
  } catch (err) {
    // Contrat §5, règle 6 : isolation des erreurs — une exception non
    // interceptée de `collecter()` est traitée comme un échec global de
    // CE connecteur uniquement, jamais propagée aux autres (FR-012).
    messageErreur = err instanceof Error ? err.message : String(err);
  }

  const statut = determinerStatut(messageErreur, nombrePublies, nombreAnomalies);

  const execution = ExecutionCollecteSchema.parse({
    id: executionId,
    connecteur_id: connecteur.id,
    date_execution: dateExecution,
    declenchement,
    statut,
    nombre_evenements_publies: nombrePublies,
    nombre_anomalies: nombreAnomalies,
    message_erreur: statut === 'echec' ? messageErreur : null,
  });
  await appendExecution(execution);

  if (statut !== 'echec') {
    await updateConnecteur(connecteur.id, { derniere_collecte: dateExecution });
  }

  return {
    execution,
    causeReseauSiEchec: statut === 'echec' ? causeReseauSiEchec : null,
    anneesCouvertes: statut === 'echec' ? null : anneesCouvertes,
  };
}

/**
 * Point d'entrée public inchangé (cycle planifié FR-013, déclenchement
 * manuel FR-014, `POST /admin/connecteurs/{id}/collecter`) : retourne
 * exactement `ExecutionCollecte` comme avant la feature 005, `cible` restant
 * un paramètre optionnel rétrocompatible sans aucun appelant existant qui le
 * fournisse encore aujourd'hui.
 */
export async function executerConnecteur(
  connecteur: Connecteur,
  declenchement: Declenchement,
  cible?: AnneeMois,
): Promise<ExecutionCollecte> {
  const { execution } = await executerConnecteurAvecClassification(connecteur, declenchement, cible);
  return execution;
}

/**
 * Variante réservée à la collecte historique (`backfill-historique.ts`,
 * feature 005, US3) : comme {@link executerConnecteur} (même persistance,
 * même journalisation, `declenchement` fixé à `'backfill'`), mais expose en
 * plus, quand l'exécution a échoué, si cet échec est de nature réseau bas
 * niveau (FR-004/FR-014) — nécessaire au circuit-breaker de l'orchestration,
 * jamais consommé par le cycle planifié ni l'admin. Expose également,
 * quand l'exécution a réussi, `anneesCouvertes` (feature 005, backfill
 * historique, 2026-09-04, cf. `ResultatCollecte.anneesCouvertes`) : `null`
 * sauf pour un connecteur dont la source ne découpe pas sa liste par mois,
 * auquel cas la liste des années intégralement couvertes par ce seul
 * succès — l'orchestration l'utilise pour éviter de raffraîchir une page
 * déjà en main pour chaque autre mois cible de la même année.
 */
export async function executerConnecteurPourBackfill(
  connecteur: Connecteur,
  cible: AnneeMois,
): Promise<{ execution: ExecutionCollecte; causeReseauSiEchec: boolean | null; anneesCouvertes: string[] | null }> {
  return executerConnecteurAvecClassification(connecteur, 'backfill', cible);
}

/**
 * Détermine le statut global du run (data-model.md, "Entité Exécution de
 * collecte") :
 * - `echec` si la source n'a pas pu être lue du tout ou si `collecter()`
 *   a levé une exception (`messageErreur` renseigné) ;
 * - `partiel` si au moins un événement a été publié ET au moins une
 *   anomalie produite dans le même run ;
 * - `succes` sinon — y compris quand la collecte n'a rien publié ni
 *   signalé (aucune nouvelle publication depuis la dernière exécution,
 *   US3 Acceptance Scenario 3), ou quand toutes les publications
 *   retenues ont donné lieu à une anomalie (0 publiée, N anomalies) : la
 *   source a bien été lue avec succès, ce n'est pas un échec technique du
 *   connecteur.
 */
function determinerStatut(
  messageErreur: string | null,
  nombrePublies: number,
  nombreAnomalies: number,
): StatutExecution {
  if (messageErreur !== null) return 'echec';
  if (nombrePublies > 0 && nombreAnomalies > 0) return 'partiel';
  return 'succes';
}
