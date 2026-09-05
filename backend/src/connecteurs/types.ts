import type { TypeEvenement } from '../models/index.js';
import type { AnneeMois } from '../services/parisDate.js';

/**
 * Interface commune d'un connecteur (contracts/connecteur-interface.md §1).
 * Seul point de couplage entre un connecteur concret et le cœur applicatif
 * (`runner.ts`) — identique quel que soit le type de source, présent ou futur.
 * Aucun moteur n'accède directement au stockage des événements, à la
 * détection de doublon, ni à la création d'anomalies (règle 1, §5).
 */

/** Origine brute d'un candidat, telle que collectée depuis la source (§1). */
export interface SourceBrute {
  type: 'page_web' | 'pdf' | 'rss';
  url: string;
  /** Chemin de la copie conservée, ou URL si non archivée. */
  contenu_brut_reference: string;
  /** ISO 8601 UTC. */
  date_collecte: string;
}

/**
 * Candidat extrait d'une publication détectée par un moteur, avant toute
 * décision de publication/anomalie (qui appartient exclusivement au
 * `runner`, cf. data-model.md « Logique de décision »).
 *
 * Règle 2 (§5) : un champ indéterminable DOIT être porté à `null`
 * explicitement plutôt qu'omis — c'est ce qui permet au `runner` de produire
 * une anomalie `champ_manquant` avec les champs partiels déjà extraits.
 */
export interface CandidatEvenement {
  departement_code: string;
  /** null si indéterminable. */
  type_evenement: TypeEvenement | null;
  reference_arrete: string | null;
  /** ISO 8601 UTC, null si indéterminable. */
  date_debut: string | null;
  /** ISO 8601 UTC ; absence légitime de fin ≠ indéterminable (cf. data-model.md §4). */
  date_fin: string | null;
  /**
   * `true` si un pattern de date de fin a matché dans le texte source mais
   * que la valeur captée n'a pas pu être résolue en date ISO — distinct
   * d'une absence totale de mention (auquel cas `date_fin` est `null` et
   * ce champ reste `false`/absent). Seul ce cas déclenche l'anomalie
   * `date_ambigue` (data-model.md, « Logique de décision », étape 3) ;
   * ajouté lors de l'implémentation du runner (T015) pour lever
   * l'ambiguïté que `date_fin: string | null` seul ne permet pas de
   * distinguer. Absent (`undefined`) équivaut à `false`.
   */
  date_fin_ambigue?: boolean;
  autorite_signataire: string | null;
  source: SourceBrute;
}

/**
 * Résultat d'une collecte pour un connecteur (§1).
 */
export interface ResultatCollecte {
  /**
   * Un candidat par publication détectée depuis la dernière collecte.
   * Liste vide = aucune nouvelle publication depuis la dernière exécution
   * (US3, Acceptance Scenario 3).
   */
  candidats: CandidatEvenement[];
  /**
   * Années (format `AAAA`) intégralement couvertes par CETTE collecte,
   * au-delà du seul mois cible demandé (feature 005, backfill historique,
   * 2026-09-04) — renseigné uniquement par un moteur dont la source ne
   * découpe pas sa liste par mois (ex. `page_web` avec
   * `PageWebConfig.granularite_liste: 'annuelle'`, cf. son commentaire) :
   * la page récupérée pour satisfaire `cible` contient déjà, de façon
   * certaine, l'intégralité de l'année de `cible`, donc de tout autre mois
   * cible de cette même année. Absent/vide (comportement historique
   * inchangé) : cette collecte ne couvre que le mois explicitement demandé.
   * `backfill-historique.ts` seul consommateur — sans effet sur le cycle
   * planifié ni le déclenchement manuel, qui ignorent ce champ.
   */
  anneesCouvertes?: string[];
  /**
   * Renseigné uniquement si la source elle-même est inaccessible/illisible
   * (distinct d'un candidat individuel mal formé) — déclenche
   * `echec_lecture_source` pour l'ensemble du run de ce connecteur
   * (data-model.md, étape 1). `source` DOIT toujours être fourni par le
   * moteur (contrat §5, règle 4 : url/type connus dès la configuration,
   * `contenu_brut_reference` retombant sur une valeur explicative si rien
   * n'a pu être conservé) — condition de FR-009 (accès à la source depuis
   * l'espace de résolution), y compris pour une anomalie née d'un échec
   * total de lecture. Précisé lors de l'implémentation du runner (T015).
   */
  echec_global?: {
    message: string;
    source: SourceBrute;
    /**
     * `true` si cet échec est un échec réseau bas niveau (coupure, DNS,
     * timeout, fermeture de socket — cf. `fetchAvecEnTetes`), `false` s'il
     * s'agit d'une réponse HTTP propre mais négative (ex. 404 — page
     * introuvable, typiquement des archives distantes qui ne remontent pas
     * aussi loin que le mois cible demandé) ou d'une impossibilité de
     * résolution de `navigation` sans lien correspondant. Absent (`undefined`)
     * pour tout échec dont la nature n'a pas été explicitement déterminée —
     * traité prudemment comme un échec réseau par les consommateurs
     * (feature 005, FR-004/FR-014 : seul un échec réseau bas niveau compte
     * dans le seuil du circuit-breaker de la collecte historique ; une page
     * introuvable est une anomalie de lecture ordinaire, jamais comptée).
     */
    causeReseau?: boolean;
  };
}

/**
 * Interface qu'un connecteur concret (une fois configuré par son moteur)
 * doit satisfaire pour le `runner`. `runner.ts` ne connaît que cette
 * interface — aucune branche conditionnelle sur `type_connecteur` ; c'est
 * `registry.ts` qui absorbe toute la connaissance des types disponibles.
 */
export interface Connecteur {
  /** DOIT correspondre à Connecteur.id dans connecteurs.json. */
  readonly id: string;
  /** DOIT être un sous-ensemble de Connecteur.departements_couverts. */
  readonly departements: string[];
  /**
   * `cible` (feature 005, US1, FR-001/FR-002) : mois calendaire
   * arbitrairement passé à cibler pour la résolution de `navigation` (moteur
   * `page_web` uniquement — sans effet pour un connecteur `pdf`/`rss`, ou
   * `page_web` sans étape de `navigation`, ex. `prefecture-13`, FR-020).
   * Absent (comportement historique, inchangé) : résolution contre le mois
   * courant Europe/Paris, rigoureusement identique à l'existant (FR-002,
   * non-régression du cycle planifié et du déclenchement manuel).
   */
  collecter(cible?: AnneeMois): Promise<ResultatCollecte>;
}
