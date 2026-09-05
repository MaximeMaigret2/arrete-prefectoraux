/**
 * Orchestration de la collecte historique (feature 005, US3) : lance, pour
 * un sous-ensemble pilote ou l'ensemble des connecteurs concernes, une
 * collecte des mois passes jusqu'a la profondeur cible decidee par
 * `volumetrie.ts` (US2), de facon strictement sequentielle par groupe
 * d'hebergement (`hebergement.ts`, FR-011/FR-013), avec un espacement
 * minimum configurable entre deux requetes consecutives (FR-012), un
 * circuit-breaker par file qui n'est jamais declenche par une simple page
 * introuvable (FR-004/FR-014), et un checkpoint sur disque qui permet
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
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtenirConnecteur } from '../connecteurs/registry.js';
import { executerConnecteurPourBackfill } from '../connecteurs/runner.js';
import { auditerProfondeurs, type ProfondeurConnecteur } from '../connecteurs/volumetrie.js';
import { regrouperParHebergement, type GroupeHebergement } from '../connecteurs/hebergement.js';
import { decalerAnneeMois, parisAnneeMoisCourant, type AnneeMois } from '../services/parisDate.js';
import type { Connecteur } from '../connecteurs/types.js';
import type { ExecutionCollecte } from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Espacement minimum par defaut (ms) entre deux requetes consecutives d'une meme file (FR-012).
 * Releve de 3000 a 8000 le 2026-09-03 (decision utilisateur) : les campagnes des 2026-09-02/03
 * ont montre un circuit-breaker qui s'ouvre apres seulement 1-3 succes lors des tentatives de
 * reprise, cohere avec un hebergeur mutualise encore fragile sous volume - un espacement plus
 * genereux vise a laisser respirer l'hebergeur entre deux requetes plutot qu'a le solliciter plus.
 */
export const ESPACEMENT_MINIMUM_MS_DEFAUT = Number(process.env.BACKFILL_ESPACEMENT_MS ?? 8000);

/**
 * Nombre d'echecs reseau bas niveau CONSECUTIFS, au sein d'une meme file, avant ouverture du
 * circuit-breaker (FR-014).
 * Releve de 3 a 6 le 2026-09-03 (decision utilisateur), en meme temps que l'espacement ci-dessus :
 * un seuil de 3 se declenchait trop vite face aux rafales de 503 observees les 2026-09-02/03,
 * empechant d'absorber un blip transitoire sans interrompre toute la file. Reste un compromis :
 * un seuil trop eleve marteler un hote deja en difficulte plus longtemps avant de s'arreter.
 */
export const SEUIL_CIRCUIT_BREAKER_DEFAUT = Number(process.env.BACKFILL_SEUIL_CIRCUIT ?? 6);

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

/** Construit la liste des mois cibles (M-1 a M-profondeur, du plus recent au plus ancien) pour une profondeur donnee - le mois courant (M) reste couvert par le cycle planifie quotidien, jamais resollicite ici (evite un travail redondant avec FR-013/feature 002). */
function construireMoisCibles(maintenant: Date, profondeurCibleMois: number): AnneeMois[] {
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
  seuilCircuitBreaker?: number;
  cheminCheckpoint?: string;
}

export interface RapportGroupe {
  groupe: GroupeHebergement;
  connecteursTraites: string[];
  circuitOuvert: boolean;
  moisReussis: number;
  moisEchecReseau: number;
  moisPageIntrouvable: number;
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
  const seuilCircuitBreaker = options.seuilCircuitBreaker ?? SEUIL_CIRCUIT_BREAKER_DEFAUT;
  const cheminCheckpoint = options.cheminCheckpoint ?? CHEMIN_CHECKPOINT_DEFAUT;
  const log = deps.log ?? (() => {});

  const maintenant = deps.maintenant();
  const checkpoint = await lireCheckpoint(cheminCheckpoint);

  const profondeursAuditees = await deps.auditerProfondeurs(maintenant);
  const profondeurs = options.connecteurIds
    ? profondeursAuditees.filter((p) => options.connecteurIds!.includes(p.connecteurId))
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
      circuitOuvert: false,
      moisReussis: 0,
      moisEchecReseau: 0,
      moisPageIntrouvable: 0,
    };
    rapport.groupes.push(rapportGroupe);
    log(`[${groupe}] groupe : ${connecteurIds.length} connecteur(s) au perimetre`);

    let echecsReseauConsecutifs = 0;

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
    }
    const filesActives: FileConnecteur[] = [];
    for (const connecteurId of connecteurIds) {
      const etat = checkpoint.connecteurs[connecteurId];
      if (!etat || etat.archivesEpuisees || etat.moisRestants.length === 0) continue;

      const connecteur = await deps.obtenirConnecteur(connecteurId);
      if (!connecteur) continue; // connecteur desactive/supprime depuis l'audit - ignore, jamais un blocage (FR-009 dans le meme esprit)

      filesActives.push({ connecteurId, connecteur, cibles: [...etat.moisRestants] });
    }

    tourBoucle: while (filesActives.length > 0) {
      for (const file of filesActives) {
        const cible = file.cibles.shift();
        if (cible === undefined) continue; // file deja epuisee ce run, retiree lors du nettoyage en fin de tour ci-dessous

        const etat = checkpoint.connecteurs[file.connecteurId]!;
        if (!rapportGroupe.connecteursTraites.includes(file.connecteurId)) {
          rapportGroupe.connecteursTraites.push(file.connecteurId);
        }

        await deps.attendre(espacementMinimumMs);
        const libelleMois = `${cible.annee}-${cible.moisNumero}`;

        const { execution, causeReseauSiEchec, anneesCouvertes } = await deps.executerConnecteurPourBackfill(file.connecteur, cible);

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
            etat.moisRestants = etat.moisRestants.filter((m) => !anneesEntierementCouvertes.has(m.annee));
            file.cibles = file.cibles.filter((m) => !anneesEntierementCouvertes.has(m.annee));
          } else {
            nombreMoisResolus = 1;
            etat.moisRestants = etat.moisRestants.filter((m) => !(m.annee === cible.annee && m.moisNumero === cible.moisNumero));
          }
          await ecrireCheckpoint(cheminCheckpoint, checkpoint);
          echecsReseauConsecutifs = 0;
          rapportGroupe.moisReussis += nombreMoisResolus;
          const suffixeCouverture =
            anneesEntierementCouvertes && nombreMoisResolus > 1
              ? ` - ${nombreMoisResolus} mois de ${cible.annee} obtenus d'un coup (liste annuelle)`
              : '';
          log(
            `[${groupe}] ${file.connecteurId} ${libelleMois} : succes (${execution.statut}, ${execution.nombre_evenements_publies} evenement(s) publie(s))${suffixeCouverture}`,
          );
          continue;
        }

        if (causeReseauSiEchec === false) {
          // Page introuvable : limite naturelle des archives pour CE
          // connecteur (US1 Edge Case) - anomalie de lecture ordinaire,
          // jamais un declencheur de circuit-breaker (FR-004/FR-014).
          etat.archivesEpuisees = true;
          etat.moisRestants = [];
          file.cibles = []; // plus rien a tenter pour lui non plus dans ce run.
          await ecrireCheckpoint(cheminCheckpoint, checkpoint);
          rapportGroupe.moisPageIntrouvable += 1;
          log(`[${groupe}] ${file.connecteurId} ${libelleMois} : page introuvable - archives epuisees pour ce connecteur, arret`);
          continue;
        }

        // Echec reseau bas niveau (ou nature non determinee, traitee
        // prudemment comme reseau) - compte dans le seuil du circuit-breaker
        // DE CETTE FILE (groupe) uniquement (FR-014), quel que soit le
        // connecteur qui l'a produit (round-robin : peut desormais
        // s'accumuler a travers plusieurs connecteurs differents, pas
        // seulement le meme). Le mois reste dans `moisRestants` (non
        // retire), tente de nouveau a une reprise ulterieure (FR-015).
        echecsReseauConsecutifs += 1;
        rapportGroupe.moisEchecReseau += 1;
        log(
          `[${groupe}] ${file.connecteurId} ${libelleMois} : echec reseau (${execution.message_erreur ?? 'sans message'}) - ${echecsReseauConsecutifs}/${seuilCircuitBreaker} consecutif(s) pour cette file`,
        );
        if (echecsReseauConsecutifs >= seuilCircuitBreaker) {
          rapportGroupe.circuitOuvert = true;
          log(`[${groupe}] circuit-breaker ouvert apres ${echecsReseauConsecutifs} echecs reseau consecutifs - arret de cette file`);
          break tourBoucle;
        }
      }

      // Retire, avant le prochain tour, les connecteurs dont la file de ce
      // run est desormais vide ou dont les archives viennent d'etre
      // marquees epuisees.
      for (let i = filesActives.length - 1; i >= 0; i--) {
        const file = filesActives[i]!;
        const etat = checkpoint.connecteurs[file.connecteurId];
        if (!etat || etat.archivesEpuisees || file.cibles.length === 0) {
          filesActives.splice(i, 1);
        }
      }
    }
    if (!rapportGroupe.circuitOuvert) {
      log(
        `[${groupe}] groupe termine : ${rapportGroupe.moisReussis} succes, ${rapportGroupe.moisEchecReseau} echec(s) reseau, ${rapportGroupe.moisPageIntrouvable} page(s) introuvable(s)`,
      );
    }
  }

  return rapport;
}

function analyserArguments(argv: string[]): { mode: 'audit' | 'lancer'; connecteurIds?: string[] } {
  if (argv.includes('--audit')) return { mode: 'audit' };
  const piloteArg = argv.find((a) => a.startsWith('--pilote='));
  if (piloteArg) {
    const connecteurIds = piloteArg
      .slice('--pilote='.length)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { mode: 'lancer', connecteurIds };
  }
  return { mode: 'lancer' };
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

  const rapport = await executerBackfill(
    { connecteurIds: args.connecteurIds },
    {
      auditerProfondeurs,
      obtenirConnecteur,
      executerConnecteurPourBackfill,
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
