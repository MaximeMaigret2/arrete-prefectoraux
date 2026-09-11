/**
 * Orchestration de la collecte historique (feature 005, US3) : lance, pour
 * un sous-ensemble pilote ou l'ensemble des connecteurs concernes, une
 * collecte des mois passes jusqu'a la profondeur cible decidee par
 * `volumetrie.ts` (US2), de facon strictement sequentielle par groupe
 * d'hebergement (`hebergement.ts`, FR-011/FR-013), avec un espacement
 * minimum configurable entre deux requetes consecutives (FR-012), un
 * circuit-breaker PAR CONNECTEUR (feature 008, 2026-09-11 - la portee
 * etait auparavant le groupe d'hebergement entier, cf. paragraphe dedie
 * plus bas) qui n'est jamais declenche par une simple page
 * introuvable (FR-004), et un checkpoint sur disque qui permet
 * d'interrompre et de reprendre sans jamais resolliciter un couple
 * (connecteur, mois) deja traite avec succes (FR-015/FR-016).
 *
 * Outil operationnel en ligne de commande, jamais appele par le cycle
 * planifie (`scheduler.ts`, FR-019) - un lancement explicite d'un
 * operateur, cf. `package.json` (`backfill:audit`, `backfill:historique`).
 *
 * Granularite non-mensuelle (feature 005, backfill historique, 2026-09-04) :
 * un connecteur `page_web` dont la source ne decoupe pas sa liste par mois
 * (config `granularite_liste: 'annuelle'`, cf. `moteurs/pageWeb/config.schema.ts`)
 * peut faire remonter, via `ResultatCollecte.anneesCouvertes`, qu'un seul
 * succes couvre deja toute l'annee du mois cible - cette orchestration
 * retire alors d'un coup tous les autres mois cibles de cette meme annee
 * (checkpoint ET file du run en cours) plutot que de refaire une requete
 * par mois contre une page deja en main.
 *
 * Circuit-breaker par connecteur, pas par groupe (feature 008, 2026-09-11) :
 * jusqu'ici, un seul compteur d'echecs reseau consecutifs etait partage par
 * TOUS les connecteurs d'un meme groupe d'hebergement - un incident sur un
 * seul connecteur en debut de file privait tous les connecteurs suivants du
 * meme groupe de toute tentative pour le run en cours (cause identifiee de
 * la faible couverture reelle observee lors des campagnes de backfill du
 * 2026-09-02, cf. spec.md de cette feature). Le compteur vit desormais sur
 * chaque `FileConnecteur` du round-robin : un connecteur qui atteint son
 * propre seuil (`BACKFILL_SEUIL_CONNECTEUR`) est simplement retire du
 * round-robin de CE run (ses mois restants ne sont jamais retires du
 * checkpoint) - les connecteurs suivants du meme groupe continuent d'etre
 * tentes normalement, jamais interrompus par l'echec d'un autre.
 *
 * Mode d'ordonnancement configurable (feature 008 bis, 2026-09-11 - decision
 * utilisateur) : `MODE_ORDONNANCEMENT_DEFAUT`/`--mode=` choisit, au sein de
 * chaque groupe d'hebergement, entre `round-robin` (par defaut depuis le
 * 2026-09-03 : un mois par connecteur a tour de role, cf. paragraphe
 * ci-dessus) et `sequentiel` (comportement anterieur au 2026-09-03 : la
 * profondeur cible d'un connecteur est epuisee avant de passer au suivant).
 * Les deux modes partagent strictement la meme logique de traitement d'une
 * cible et de finalisation de file (`traiterUneCible`/`finaliserSiTerminee`
 * dans `executerBackfill`) - seul l'ordre dans lequel les cibles sont
 * soumises change.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtenirConnecteur } from '../connecteurs/registry.js';
import { executerConnecteurPourBackfill, executerConnecteurPourBackfillIncremental } from '../connecteurs/runner.js';
import { auditerProfondeurs, type ProfondeurConnecteur } from '../connecteurs/volumetrie.js';
import { regrouperParHebergement, type GroupeHebergement } from '../connecteurs/hebergement.js';
import { decalerAnneeMois, parisAnneeMoisCourant, type AnneeMois } from '../services/parisDate.js';
import type { Connecteur } from '../connecteurs/types.js';
import type { ExecutionCollecte } from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Espacement minimum par defaut (ms) entre deux requetes consecutives d'une meme file (FR-012).
 * Releve de 3000 a 8000 le 2026-09-03 (decision utilisateur), puis de 8000 a 30000 le 2026-09-11
 * (decision utilisateur) : les campagnes des 2026-09-02/03 ont montre un circuit-breaker qui
 * s'ouvre apres seulement 1-3 succes lors des tentatives de reprise, cohere avec un hebergeur
 * mutualise encore fragile sous volume - un espacement plus genereux vise a laisser respirer
 * l'hebergeur entre deux requetes plutot qu'a le solliciter plus.
 */
export const ESPACEMENT_MINIMUM_MS_DEFAUT = Number(process.env.BACKFILL_ESPACEMENT_MS ?? 30000);

/**
 * Mode d'ordonnancement des connecteurs au sein d'un groupe d'hebergement
 * (feature 008 bis, 2026-09-11, decision utilisateur) :
 * - `round-robin` (par defaut, inchange depuis le 2026-09-03) : chaque
 *   connecteur ne tente qu'UN SEUL mois par tour avant de ceder la place au
 *   suivant - maximise le nombre de connecteurs distincts qui progressent
 *   avant qu'un circuit-breaker n'interrompe la file.
 * - `sequentiel` : epuise tous les mois cibles d'un connecteur (jusqu'a
 *   succes de la profondeur voulue, page introuvable, ou son propre
 *   circuit-breaker) avant de passer au connecteur suivant - c'est le mode
 *   qui prevalait avant le 2026-09-03. Reintroduit en option pour
 *   l'operateur qui prefere maximiser la profondeur des premiers
 *   connecteurs traites plutot que repartir l'effort sur tous les
 *   connecteurs du groupe a chaque tour.
 */
export type ModeOrdonnancement = 'round-robin' | 'sequentiel';
export const MODE_ORDONNANCEMENT_DEFAUT: ModeOrdonnancement =
  process.env.BACKFILL_MODE === 'sequentiel' ? 'sequentiel' : 'round-robin';

/**
 * Nombre d'echecs reseau bas niveau CONSECUTIFS, PAR CONNECTEUR, avant que ce
 * connecteur ne soit retire du round-robin pour le reste de CE run (FR-002,
 * feature 008).
 *
 * Remplace, depuis le 2026-09-11 (feature 008), l'ancien `BACKFILL_SEUIL_CIRCUIT`
 * qui s'appliquait a l'echelle du groupe entier - defaut ramene a 3 (valeur
 * d'origine avant le relevement a 6 du 2026-09-03) : ce relevement compensait
 * le fait que les echecs de PLUSIEURS connecteurs differents s'accumulaient
 * dans un seul compteur partage ; une fois le compteur ramene a l'echelle
 * d'un seul connecteur, ce raisonnement ne s'applique plus et 3 redevient le
 * compromis pertinent entre absorber un blip transitoire et ne pas marteler
 * un hote en difficulte.
 */
export const SEUIL_ECHECS_CONNECTEUR_DEFAUT = Number(process.env.BACKFILL_SEUIL_CONNECTEUR ?? 3);

/**
 * Nombre de connecteurs CONSECUTIFS, au sein d'un meme groupe, entierement en
 * echec (aucun mois reussi) SANS AUCUN SUCCES INTERPOSE, avant de signaler une
 * degradation generalisee probable de l'hebergeur dans le rapport de fin de
 * run (FR-007, feature 008, User Story 2). Purement informatif : ne modifie
 * jamais le comportement du script, uniquement son rapport - jamais
 * d'interruption du traitement sur la base de ce signal.
 */
export const SEUIL_DEGRADATION_GENERALISEE_DEFAUT = Number(process.env.BACKFILL_SEUIL_DEGRADATION ?? 8);

/** Chemin par defaut du fichier de checkpoint (genere a l'execution, jamais committe - cf. .gitignore). */
export const CHEMIN_CHECKPOINT_DEFAUT = path.join(__dirname, 'backfill-checkpoint.json');

const VERSION_CHECKPOINT = 1;

/** Etat de progression d'UN connecteur au sein du checkpoint (FR-015). */
export interface EtatConnecteurCheckpoint {
  profondeurCibleMois: number;
  /** Mois cibles encore a traiter, du plus recent au plus ancien - retire des qu'un mois est traite avec succes. */
  moisRestants: AnneeMois[];
  /** `true` des qu'une page introuvable a ete rencontree pour ce connecteur (limite naturelle des archives, US1 Edge Case) - plus rien n'est tente pour lui ensuite. */
  archivesEpuisees: boolean;
  /**
   * Feature « PDF par PDF » (2026-09-08) : URLs de PDF deja resolues (retenu
   * OU ecarte - jamais un echec) pour un mois donne, cle `"${annee}-${moisNumero}"`
   * (ex. `"2026-03"`), ecrit AU FIL DE L'EAU des la resolution de chaque PDF
   * (`executerConnecteurPourBackfillIncremental`, `onUrlResolue`) plutot que
   * seulement a la fin du mois - la persistance des evenements/anomalies
   * elle-meme (`appendEvenement`/`upsertAnomalie`, `runner.ts`) est deja
   * immediate, mais sans ce suivi une interruption en cours de mois faisait
   * retelecharger depuis zero, a la reprise, des PDF deja traites avec
   * succes. Optionnel/retrocompatible (`VERSION_CHECKPOINT` INCHANGE) - un
   * checkpoint existant sans ce champ se comporte comme un ensemble vide.
   * Purge (cle retiree) des qu'un mois quitte `moisRestants` (succes complet
   * ou archives epuisees) - jamais laisse grossir indefiniment.
   */
  urlsResoluesParMois?: Record<string, string[]>;
}

/** Etat de campagne persistant, hors modele de donnees applicatif (plan.md, Complexity Tracking). */
export interface CheckpointBackfill {
  version: number;
  connecteurs: Record<string, EtatConnecteurCheckpoint>;
}

function checkpointVide(): CheckpointBackfill {
  return { version: VERSION_CHECKPOINT, connecteurs: {} };
}

/** Lit le checkpoint sur disque - un fichier absent, illisible ou d'une version inconnue retourne un checkpoint vide plutot que d'echouer (premier lancement, ou format change). */
export async function lireCheckpoint(chemin: string): Promise<CheckpointBackfill> {
  try {
    const brut = await readFile(chemin, 'utf-8');
    const parse = JSON.parse(brut) as CheckpointBackfill;
    if (parse.version !== VERSION_CHECKPOINT || typeof parse.connecteurs !== 'object') return checkpointVide();
    return parse;
  } catch {
    return checkpointVide();
  }
}

/** Ecrit le checkpoint sur disque (T018 : appele apres chaque couple connecteur/mois traite avec succes, jamais apres un echec). */
export async function ecrireCheckpoint(chemin: string, etat: CheckpointBackfill): Promise<void> {
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, JSON.stringify(etat, null, 2), 'utf-8');
}

/**
 * Construit la liste des mois cibles (M-1 a M-profondeur, du plus recent au
 * plus ancien) pour une profondeur donnee - le mois courant (M) reste
 * couvert par le cycle planifie quotidien, jamais resollicite ici (evite un
 * travail redondant avec FR-013/feature 002).
 *
 * Exportee (feature 007, US4) pour reutilisation par `reactiver-mois-checkpoint.ts`,
 * qui a besoin de reconstruire exactement le meme ensemble de mois cibles
 * qu'au tout premier calcul, sans dupliquer cette logique.
 */
export function construireMoisCibles(maintenant: Date, profondeurCibleMois: number): AnneeMois[] {
  const moisCourant = parisAnneeMoisCourant(maintenant);
  const mois: AnneeMois[] = [];
  for (let i = 1; i <= profondeurCibleMois; i++) {
    mois.push(decalerAnneeMois(moisCourant, i));
  }
  return mois;
}

/** Dependances injectables (testabilite, T014 - aucun reseau reel dans la suite automatisee). */
export interface DependancesBackfill {
  auditerProfondeurs: (maintenant: Date) => Promise<ProfondeurConnecteur[]>;
  obtenirConnecteur: (id: string) => Promise<Connecteur | null>;
  executerConnecteurPourBackfill: (
    connecteur: Connecteur,
    cible: AnneeMois,
  ) => Promise<{ execution: ExecutionCollecte; causeReseauSiEchec: boolean | null; anneesCouvertes?: string[] | null }>;
  /**
   * Feature « PDF par PDF » (2026-09-08) : variante incrementale utilisee a
   * la place de `executerConnecteurPourBackfill` ci-dessus pour CHAQUE mois
   * tente - persiste chaque candidat (evenement/anomalie) des sa resolution
   * individuelle plutot qu'a la toute fin du mois, et invoque `onUrlResolue`
   * pour chaque URL de PDF dont le sort vient d'etre acquis (retenu ou
   * ecarte), afin que l'orchestration puisse ecrire son checkpoint
   * IMMEDIATEMENT (cf. `EtatConnecteurCheckpoint.urlsResoluesParMois`).
   */
  executerConnecteurPourBackfillIncremental: (
    connecteur: Connecteur,
    cible: AnneeMois,
    urlsDejaResolues: ReadonlySet<string>,
    onUrlResolue?: (urlPdf: string) => void | Promise<void>,
  ) => Promise<{
    execution: ExecutionCollecte;
    causeReseauSiEchec: boolean | null;
    anneesCouvertes: string[] | null;
    urlsResoluesCetteExecution: string[];
  }>;
  attendre: (ms: number) => Promise<void>;
  maintenant: () => Date;
  /**
   * Journalisation de progression optionnelle (une ligne par etape notable :
   * debut de groupe, debut de connecteur, resultat de chaque mois tente,
   * ouverture du circuit-breaker). Absente par defaut (aucun bruit dans la
   * suite de tests automatisee, T014) - `main()` fournit `console.log` en
   * CLI reel. Deliberement une simple fonction `(message) => void` plutot
   * qu'un logger structure : ce script n'a qu'un seul consommateur (un
   * operateur qui suit un run long dans son terminal), pas besoin de plus.
   */
  log?: (message: string) => void;
}

export interface OptionsBackfill {
  /** Sous-ensemble explicite de connecteurs (pilote, FR-017) - absent = perimetre complet (tous les connecteurs actifs a `navigation`). */
  connecteurIds?: string[];
  espacementMinimumMs?: number;
  /** Mode d'ordonnancement au sein de chaque groupe d'hebergement (feature 008 bis) - absent = `MODE_ORDONNANCEMENT_DEFAUT` (`round-robin`). */
  mode?: ModeOrdonnancement;
  /** Seuil d'echecs reseau consecutifs PAR CONNECTEUR avant retrait du round-robin de ce run (FR-002, feature 008 - anciennement `seuilCircuitBreaker`, a l'echelle du groupe). */
  seuilEchecsConnecteur?: number;
  /** Seuil de connecteurs consecutifs entierement en echec avant signal de degradation generalisee (FR-007, feature 008, purement informatif). */
  seuilDegradationGeneralisee?: number;
  cheminCheckpoint?: string;
}

/** Detail d'un connecteur retire du round-robin de ce run par le circuit-breaker par connecteur (FR-006, feature 008). */
export interface ConnecteurInterrompu {
  connecteurId: string;
  /** Nombre de mois restant en attente pour ce connecteur (checkpoint), non retires - eligibles a une prochaine reprise. */
  moisRestants: number;
  raison: 'echecs_reseau_consecutifs';
}

export interface RapportGroupe {
  groupe: GroupeHebergement;
  connecteursTraites: string[];
  moisReussis: number;
  moisEchecReseau: number;
  moisPageIntrouvable: number;
  /** feature 007 (US3) : mois dont l'execution a produit au moins un candidat non resolu - jamais retire du checkpoint, jamais compte dans le circuit-breaker. */
  moisNonResolus: number;
  /** feature 008 (US1, FR-006) : detail par connecteur des interruptions dues au circuit-breaker par connecteur - remplace l'ancien `circuitOuvert` (bit unique a l'echelle du groupe). */
  connecteursInterrompus: ConnecteurInterrompu[];
  /** feature 008 (US2, FR-007) : signal informatif uniquement, jamais bloquant - cf. `SEUIL_DEGRADATION_GENERALISEE_DEFAUT`. */
  degradationGeneraliseeDetectee: boolean;
}

export interface RapportBackfill {
  groupes: RapportGroupe[];
}

/**
 * Execute une campagne de collecte historique (US3) - une seule invocation
 * traite ce qu'elle peut de chaque groupe d'hebergement avant de s'arreter
 * (circuit-breaker atteint, ou perimetre de ce groupe termine), persiste sa
 * progression a chaque succes, et NE REPREND JAMAIS automatiquement
 * (FR-016) : relancer cette meme fonction plus tard (etalement multi-jours,
 * ou apres un circuit-breaker) reprend exactement la ou le checkpoint s'est
 * arrete, sans resolliciter aucun couple (connecteur, mois) deja reussi.
 */
export async function executerBackfill(
  options: OptionsBackfill,
  deps: DependancesBackfill,
): Promise<RapportBackfill> {
  const espacementMinimumMs = options.espacementMinimumMs ?? ESPACEMENT_MINIMUM_MS_DEFAUT;
  const seuilEchecsConnecteur = options.seuilEchecsConnecteur ?? SEUIL_ECHECS_CONNECTEUR_DEFAUT;
  const seuilDegradationGeneralisee = options.seuilDegradationGeneralisee ?? SEUIL_DEGRADATION_GENERALISEE_DEFAUT;
  const mode = options.mode ?? MODE_ORDONNANCEMENT_DEFAUT;
  const cheminCheckpoint = options.cheminCheckpoint ?? CHEMIN_CHECKPOINT_DEFAUT;
  const log = deps.log ?? (() => {});

  const maintenant = deps.maintenant();
  const checkpoint = await lireCheckpoint(cheminCheckpoint);

  const profondeursAuditees = await deps.auditerProfondeurs(maintenant);
  // FR-017 : quand un sous-ensemble pilote est fourni, l'ORDRE dans lequel ses
  // identifiants sont listes est traite comme une priorite explicite - on ne
  // se contente pas de filtrer `profondeursAuditees` (qui reste dans l'ordre
  // de l'audit, alphabetique par fichier de config), on retrie le resultat
  // selon la position de chaque connecteur dans `options.connecteurIds`.
  // Sans ce tri, un pilote comme `--pilote=prefecture-30,prefecture-56,...`
  // n'obtenait aucune garantie que 30 soit tente avant les autres : au sein
  // d'un meme groupe d'hebergement, `regrouperParHebergement` preserve
  // l'ordre du tableau qu'on lui passe, donc c'est bien cet ordre-ci qui
  // determine qui passe en premier dans le round-robin (bug decouvert et
  // corrige le 2026-09-05, cf. campagne du jour).
  const profondeurs = options.connecteurIds
    ? profondeursAuditees
        .filter((p) => options.connecteurIds!.includes(p.connecteurId))
        .sort(
          (a, b) =>
            options.connecteurIds!.indexOf(a.connecteurId) - options.connecteurIds!.indexOf(b.connecteurId),
        )
    : profondeursAuditees;

  // Initialise l'etat de checkpoint des connecteurs jamais vus jusqu'ici -
  // ceux deja presents (reprise) conservent leur etat tel quel, y compris
  // leur profondeur decidee au tout premier lancement (pas de re-audit
  // silencieux d'un connecteur deja en cours de campagne).
  for (const p of profondeurs) {
    if (checkpoint.connecteurs[p.connecteurId]) continue;
    checkpoint.connecteurs[p.connecteurId] = {
      profondeurCibleMois: p.profondeurCibleMois,
      moisRestants: construireMoisCibles(maintenant, p.profondeurCibleMois),
      archivesEpuisees: false,
    };
  }

  const groupes = regrouperParHebergement(profondeurs.map((p) => p.connecteurId));
  const rapport: RapportBackfill = { groupes: [] };

  for (const [groupe, connecteurIds] of groupes) {
    const rapportGroupe: RapportGroupe = {
      groupe,
      connecteursTraites: [],
      moisReussis: 0,
      moisEchecReseau: 0,
      moisPageIntrouvable: 0,
      moisNonResolus: 0,
      connecteursInterrompus: [],
      degradationGeneraliseeDetectee: false,
    };
    rapport.groupes.push(rapportGroupe);
    log(`[${groupe}] groupe : ${connecteurIds.length} connecteur(s) au perimetre`);

    // feature 008 (US2, FR-007) : nombre de connecteurs CONSECUTIFS (dans
    // l'ordre ou ils sortent du round-robin de ce groupe) entierement en
    // echec ce run (aucun mois reussi), sans aucun succes interpose -
    // purement informatif, cf. SEUIL_DEGRADATION_GENERALISEE_DEFAUT.
    let connecteursEchecTotalConsecutifs = 0;

    // Construit, pour chaque connecteur eligible de ce groupe, une file figee
    // des mois cibles a tenter DANS CE RUN (copie de `etat.moisRestants` au
    // moment du demarrage - un mois qui echoue reste dans le checkpoint pour
    // une reprise ulterieure, mais n'est jamais retente une seconde fois
    // pendant CE MEME run, comme avant ce changement).
    //
    // Ordonnancement en ROUND-ROBIN mois par mois (2026-09-03, decision
    // utilisateur) : plutot que d'epuiser tous les mois cibles d'un
    // connecteur avant de passer au suivant (risque, si le circuit-breaker
    // s'ouvre tot, de terminer la campagne avec de la profondeur sur
    // seulement 1-2 connecteurs et AUCUNE progression sur tous les autres),
    // chaque connecteur du groupe ne tente qu'UN SEUL mois par tour, puis
    // cede la place au suivant ; un nouveau tour ne commence qu'une fois
    // tous les connecteurs actifs de ce groupe passes en revue une fois.
    // Ceci maximise le nombre de connecteurs distincts qui progressent avant
    // qu'un circuit-breaker n'interrompe la file, plutot que de concentrer
    // les succes sur une poignee de connecteurs.
    interface FileConnecteur {
      connecteurId: string;
      connecteur: Connecteur;
      cibles: AnneeMois[];
      /** feature 008 (FR-002/FR-005) : echecs reseau consecutifs PROPRES a ce connecteur - jamais partage avec un autre connecteur du meme groupe. */
      echecsConsecutifs: number;
      /** feature 008 (US2) : au moins un mois reussi pour ce connecteur au cours de CE run - alimente le signal de degradation generalisee. */
      aEuUnSucces: boolean;
    }
    const filesActives: FileConnecteur[] = [];
    for (const connecteurId of connecteurIds) {
      const etat = checkpoint.connecteurs[connecteurId];
      if (!etat || etat.archivesEpuisees || etat.moisRestants.length === 0) continue;

      const connecteur = await deps.obtenirConnecteur(connecteurId);
      if (!connecteur) continue; // connecteur desactive/supprime depuis l'audit - ignore, jamais un blocage (FR-009 dans le meme esprit)

      filesActives.push({ connecteurId, connecteur, cibles: [...etat.moisRestants], echecsConsecutifs: 0, aEuUnSucces: false });
    }

    /**
     * Traite UNE cible (un mois, pour UN connecteur) - identique quel que
     * soit le mode d'ordonnancement (feature 008 bis, 2026-09-11) : seul
     * l'ORDRE dans lequel les cibles sont soumises a cette fonction differe
     * entre le round-robin (un mois par connecteur par tour) et le mode
     * sequentiel (tous les mois d'un connecteur avant de passer au suivant)
     * - extrait ici pour ne jamais dupliquer cette logique entre les deux.
     */
    const traiterUneCible = async (file: FileConnecteur, cible: AnneeMois): Promise<void> => {
      const etat = checkpoint.connecteurs[file.connecteurId]!;
      if (!rapportGroupe.connecteursTraites.includes(file.connecteurId)) {
        rapportGroupe.connecteursTraites.push(file.connecteurId);
      }

      await deps.attendre(espacementMinimumMs);
      const libelleMois = `${cible.annee}-${cible.moisNumero}`;

      // Feature « PDF par PDF » (2026-09-08) : URLs deja resolues pour CE
      // mois lors d'une reprise precedente (mois reste "incertain") - le
      // moteur les ignore plutot que de les retelecharger. `onUrlResolue`
      // ecrit le checkpoint IMMEDIATEMENT a chaque nouvelle URL resolue,
      // pour qu'une interruption en cours de mois ne perde jamais ce suivi
      // (la persistance des evenements/anomalies eux-memes est deja
      // immediate, candidat par candidat, cote `runner.ts`).
      const urlsDejaResolues = new Set(etat.urlsResoluesParMois?.[libelleMois] ?? []);
      const { execution, causeReseauSiEchec, anneesCouvertes } = await deps.executerConnecteurPourBackfillIncremental(
        file.connecteur,
        cible,
        urlsDejaResolues,
        async (urlPdf) => {
          const dejaResolues = etat.urlsResoluesParMois ?? (etat.urlsResoluesParMois = {});
          const pourCeMois = dejaResolues[libelleMois] ?? (dejaResolues[libelleMois] = []);
          if (!pourCeMois.includes(urlPdf)) {
            pourCeMois.push(urlPdf);
            await ecrireCheckpoint(cheminCheckpoint, checkpoint);
          }
        },
      );

      if (execution.nombre_candidats_non_resolus > 0) {
        // feature 007 (US3, FR-011/FR-013) : au moins un candidat de ce
        // mois n'a pas pu etre resolu - jamais retire du checkpoint
        // (ni ce mois, ni son annee, meme si anneesCouvertes est
        // renseigne) tant que le signal persiste, et jamais compte dans
        // le seuil du circuit-breaker (echecsReseauConsecutifs
        // volontairement non touche) : ni un succes verifie, ni un echec
        // de lecture, seulement une incertitude qui doit rester eligible
        // a une reprise ulterieure (US4).
        rapportGroupe.moisNonResolus += 1;
        // `etat.urlsResoluesParMois[libelleMois]` deja ecrit sur disque au
        // fil de l'eau via `onUrlResolue` ci-dessus - rien de plus a
        // persister ici pour ce suivi.
        log(
          `[${groupe}] ${file.connecteurId} ${libelleMois} : incertain (${execution.nombre_candidats_non_resolus} candidat(s) non resolu(s)) - mois conserve pour reprise`,
        );
        return;
      }

      if (execution.statut !== 'echec') {
        // feature 005 (backfill historique, 2026-09-04) : un connecteur
        // dont la source ne decoupe pas sa liste par mois (config
        // `granularite_liste: 'annuelle'`, cf. moteur.ts) peut signaler
        // que ce seul succes couvre deja TOUTE l'annee de `cible`, pas
        // seulement le mois demande - tous les autres mois cibles de
        // cette meme annee, encore dans la file de CE run ou dans le
        // checkpoint, sont alors retires d'un coup plutot que retentes
        // un par un contre une page deja en main (moins de requetes vers
        // un hebergeur deja fragile).
        const anneesEntierementCouvertes = anneesCouvertes && anneesCouvertes.length > 0 ? new Set(anneesCouvertes) : null;
        let nombreMoisResolus: number;
        if (anneesEntierementCouvertes) {
          nombreMoisResolus = etat.moisRestants.filter((m) => anneesEntierementCouvertes.has(m.annee)).length;
          // Feature « PDF par PDF » (2026-09-08) : purge le suivi par-URL
          // de chaque mois qui quitte moisRestants - un mois integralement
          // couvert (succes verifie) n'a plus jamais besoin d'etre repris,
          // son suivi de reprise devient obsolete.
          if (etat.urlsResoluesParMois) {
            for (const m of etat.moisRestants) {
              if (anneesEntierementCouvertes.has(m.annee)) delete etat.urlsResoluesParMois[`${m.annee}-${m.moisNumero}`];
            }
          }
          etat.moisRestants = etat.moisRestants.filter((m) => !anneesEntierementCouvertes.has(m.annee));
          file.cibles = file.cibles.filter((m) => !anneesEntierementCouvertes.has(m.annee));
        } else {
          nombreMoisResolus = 1;
          etat.moisRestants = etat.moisRestants.filter((m) => !(m.annee === cible.annee && m.moisNumero === cible.moisNumero));
          delete etat.urlsResoluesParMois?.[libelleMois];
        }
        await ecrireCheckpoint(cheminCheckpoint, checkpoint);
        file.echecsConsecutifs = 0;
        file.aEuUnSucces = true;
        rapportGroupe.moisReussis += nombreMoisResolus;
        const suffixeCouverture =
          anneesEntierementCouvertes && nombreMoisResolus > 1
            ? ` - ${nombreMoisResolus} mois de ${cible.annee} obtenus d'un coup (liste annuelle)`
            : '';
        log(
          `[${groupe}] ${file.connecteurId} ${libelleMois} : succes (${execution.statut}, ${execution.nombre_evenements_publies} evenement(s) publie(s))${suffixeCouverture}`,
        );
        return;
      }

      if (causeReseauSiEchec === false) {
        // Page introuvable : limite naturelle des archives pour CE
        // connecteur (US1 Edge Case) - anomalie de lecture ordinaire,
        // jamais un declencheur de circuit-breaker (FR-004/FR-014).
        etat.archivesEpuisees = true;
        etat.moisRestants = [];
        etat.urlsResoluesParMois = undefined; // plus aucun mois a reprendre pour ce connecteur - suivi devenu sans objet.
        file.cibles = []; // plus rien a tenter pour lui non plus dans ce run.
        await ecrireCheckpoint(cheminCheckpoint, checkpoint);
        rapportGroupe.moisPageIntrouvable += 1;
        log(`[${groupe}] ${file.connecteurId} ${libelleMois} : page introuvable - archives epuisees pour ce connecteur, arret`);
        return;
      }

      // Echec reseau bas niveau (ou nature non determinee, traitee
      // prudemment comme reseau) - compte dans le seuil du circuit-breaker
      // PROPRE A CE CONNECTEUR (FR-002/FR-005, feature 008 : la portee
      // etait auparavant le groupe entier, cf. doc de tete du fichier). Le
      // mois reste dans `moisRestants` (non retire), tente de nouveau a
      // une reprise ulterieure (FR-003).
      file.echecsConsecutifs += 1;
      rapportGroupe.moisEchecReseau += 1;
      log(
        `[${groupe}] ${file.connecteurId} ${libelleMois} : echec reseau (${execution.message_erreur ?? 'sans message'}) - ${file.echecsConsecutifs}/${seuilEchecsConnecteur} consecutif(s) pour ce connecteur`,
      );
      if (file.echecsConsecutifs >= seuilEchecsConnecteur) {
        // feature 008 (FR-001) : ce connecteur sort de la file de CE run -
        // JAMAIS les autres connecteurs du groupe, qui continuent d'etre
        // tentes normalement (round-robin : au tour suivant ; sequentiel :
        // au prochain connecteur de la liste - pas de `break` ici). Ses
        // mois restants (`etat.moisRestants`, inchange par cette branche)
        // restent eligibles a une prochaine reprise (FR-003).
        rapportGroupe.connecteursInterrompus.push({
          connecteurId: file.connecteurId,
          moisRestants: etat.moisRestants.length,
          raison: 'echecs_reseau_consecutifs',
        });
        log(
          `[${groupe}] ${file.connecteurId} : retire de la file de ce run apres ${file.echecsConsecutifs} echecs reseau consecutifs (${etat.moisRestants.length} mois restant(s) pour une prochaine reprise) - les autres connecteurs du groupe continuent`,
        );
        file.cibles = [];
      }
    };

    /**
     * Marque, si la file de ce run pour CE connecteur vient de se vider
     * (epuisee normalement, archives marquees epuisees, ou retiree par le
     * circuit-breaker par connecteur), son sort pour le signal de
     * degradation generalisee (US2, FR-007) - identique quel que soit le
     * mode. Retourne `true` si la file de ce connecteur est terminee.
     */
    const finaliserSiTerminee = (file: FileConnecteur): boolean => {
      const etat = checkpoint.connecteurs[file.connecteurId];
      if (!etat || etat.archivesEpuisees || file.cibles.length === 0) {
        if (file.aEuUnSucces) {
          connecteursEchecTotalConsecutifs = 0;
        } else {
          connecteursEchecTotalConsecutifs += 1;
          if (connecteursEchecTotalConsecutifs >= seuilDegradationGeneralisee) {
            rapportGroupe.degradationGeneraliseeDetectee = true;
          }
        }
        return true;
      }
      return false;
    };

    if (mode === 'sequentiel') {
      // Mode sequentiel (feature 008 bis, 2026-09-11, decision utilisateur) :
      // epuise tous les mois cibles d'un connecteur (succes, page
      // introuvable, ou son propre circuit-breaker) avant de passer au
      // connecteur suivant - cf. doc de tete du fichier pour le detail des
      // deux modes.
      for (const file of filesActives) {
        while (file.cibles.length > 0) {
          const cible = file.cibles.shift()!;
          await traiterUneCible(file, cible);
        }
        finaliserSiTerminee(file);
      }
    } else {
      // Mode round-robin (par defaut depuis le 2026-09-03, decision
      // utilisateur) : chaque connecteur du groupe ne tente qu'UN SEUL mois
      // par tour, puis cede la place au suivant ; un nouveau tour ne
      // commence qu'une fois tous les connecteurs actifs de ce groupe
      // passes en revue une fois. Maximise le nombre de connecteurs
      // distincts qui progressent avant qu'un circuit-breaker n'interrompe
      // la file.
      while (filesActives.length > 0) {
        for (const file of filesActives) {
          const cible = file.cibles.shift();
          if (cible === undefined) continue; // file deja epuisee ce run, retiree lors du nettoyage en fin de tour ci-dessous
          await traiterUneCible(file, cible);
        }

        // Retire, avant le prochain tour, les connecteurs dont la file de ce
        // run est desormais vide.
        for (let i = filesActives.length - 1; i >= 0; i--) {
          if (finaliserSiTerminee(filesActives[i]!)) filesActives.splice(i, 1);
        }
      }
    }
    log(
      `[${groupe}] groupe termine (mode ${mode}) : ${rapportGroupe.moisReussis} succes, ${rapportGroupe.moisEchecReseau} echec(s) reseau, ${rapportGroupe.moisPageIntrouvable} page(s) introuvable(s), ${rapportGroupe.moisNonResolus} incertain(s), ${rapportGroupe.connecteursInterrompus.length} connecteur(s) interrompu(s)`,
    );
  }

  return rapport;
}

function analyserArguments(
  argv: string[],
): { mode: 'audit' | 'lancer'; connecteurIds?: string[]; modeOrdonnancement?: ModeOrdonnancement } {
  if (argv.includes('--audit')) return { mode: 'audit' };

  // feature 008 bis (2026-09-11) : `--mode=sequentiel`/`--mode=round-robin`
  // choisit explicitement l'ordonnancement au sein de chaque groupe
  // d'hebergement (absent = MODE_ORDONNANCEMENT_DEFAUT). Nomme ici
  // `modeOrdonnancement` pour ne pas entrer en collision avec le `mode`
  // ('audit' | 'lancer') deja utilise par ce CLI pour un tout autre choix.
  const modeArg = argv.find((a) => a.startsWith('--mode='));
  const modeOrdonnancement: ModeOrdonnancement | undefined =
    modeArg?.slice('--mode='.length) === 'sequentiel'
      ? 'sequentiel'
      : modeArg?.slice('--mode='.length) === 'round-robin'
        ? 'round-robin'
        : undefined;

  const piloteArg = argv.find((a) => a.startsWith('--pilote='));
  if (piloteArg) {
    const connecteurIds = piloteArg
      .slice('--pilote='.length)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { mode: 'lancer', connecteurIds, modeOrdonnancement };
  }
  return { mode: 'lancer', modeOrdonnancement };
}

async function main(): Promise<void> {
  const args = analyserArguments(process.argv.slice(2));

  if (args.mode === 'audit') {
    // T012/FR-008 : profondeur cible consultable AVANT tout lancement reel - aucune ecriture de checkpoint, aucune collecte.
    const profondeurs = await auditerProfondeurs(new Date());
    for (const p of profondeurs) {
      const detail = p.aPageDetail
        ? `page_detail, echantillon moyen ${p.volumeMoyenEchantillon !== null ? p.volumeMoyenEchantillon.toFixed(1) : 'inconnu'} publication(s)/mois`
        : 'sans page_detail';
      console.log(`${p.connecteurId} (departement ${p.departementCode}) : ${p.profondeurCibleMois} mois cible - ${detail}`);
    }
    return;
  }

  console.log(
    args.connecteurIds
      ? `Lancement pilote sur ${args.connecteurIds.length} connecteur(s) : ${args.connecteurIds.join(', ')}`
      : 'Lancement sur le perimetre complet des connecteurs actifs a navigation.',
  );
  console.log(`Mode d'ordonnancement : ${args.modeOrdonnancement ?? MODE_ORDONNANCEMENT_DEFAUT}.`);

  const rapport = await executerBackfill(
    { connecteurIds: args.connecteurIds, mode: args.modeOrdonnancement },
    {
      auditerProfondeurs,
      obtenirConnecteur,
      executerConnecteurPourBackfill,
      executerConnecteurPourBackfillIncremental,
      attendre: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      maintenant: () => new Date(),
      log: (message) => console.log(`[${new Date().toISOString()}] ${message}`),
    },
  );

  console.log(JSON.stringify(rapport, null, 2));
}

// N'execute le CLI que si ce fichier est lance directement - jamais lors
// d'un import par les tests (T014) ou par un autre module.
//
// CORRECTIF (2026-09-02) : `import.meta.url === \`file://${process.argv[1]}\``
// echoue TOUJOURS sous Windows (chemin `C:\\Users\\...` avec antislashs dans
// `process.argv[1]` contre une URL `file:///C:/Users/...` avec slashs), donc
// `main()` n'etait jamais appelee - le script se terminait immediatement,
// sans la moindre ligne affichee, meme la toute premiere. Compare desormais
// deux chemins natifs de l'OS (`fileURLToPath` convertit l'URL en chemin
// natif, deja importe en tete de fichier), fonctionne identiquement sur
// Linux/macOS/Windows - decouvert quand l'utilisateur a rapporte un run
// completement silencieux sous MINGW64/Git Bash.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
