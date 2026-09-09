/**
 * Réactivation explicite, dans le checkpoint de `backfill-historique.ts`,
 * d'un périmètre choisi par l'opérateur (feature 007, US4, FR-014/FR-015)
 * — typiquement le sous-ensemble jugé prioritaire par
 * `prioriser-remediation.ts`, après validation humaine (jamais un
 * enchaînement automatique, cf. son commentaire d'en-tête).
 *
 * Réinsère, pour chaque connecteur du périmètre, les mois cibles
 * concernés dans `moisRestants` — EN UNION avec l'existant : jamais de
 * perte d'un mois déjà en attente de reprise, jamais de doublon. Un
 * connecteur dont les `archivesEpuisees` avaient été marquées à tort (par
 * le bug corrigé par cette feature, ou tout autre incident) est
 * ré-éligible dès qu'au moins un mois lui est réinjecté — sinon
 * `executerBackfill` l'ignorerait de nouveau (`archivesEpuisees: true`
 * reste un arrêt définitif tant qu'il n'est pas explicitement levé ici).
 */
import { lireCheckpoint, ecrireCheckpoint, construireMoisCibles, CHEMIN_CHECKPOINT_DEFAUT } from './backfill-historique.js';
import type { AnneeMois } from '../services/parisDate.js';

/** Résultat, pour un connecteur du périmètre demandé. */
export interface EntreeReactivation {
  connecteurId: string;
  /** `false` si ce connecteur n'a jamais été vu par le backfill (aucun état dans le checkpoint) — rien à réactiver, ce n'est pas une erreur. */
  connecteurConnu: boolean;
  moisAjoutes: AnneeMois[];
}

export interface OptionsReactivation {
  /** Périmètre explicite — jamais de valeur par défaut "tous les connecteurs" (FR-014 : une décision d'opérateur, pas un rejeu massif implicite). */
  connecteurIds: string[];
  /**
   * Plage optionnelle restreignant les mois à réinjecter, parmi ceux de la
   * profondeur cible déjà décidée pour ce connecteur (`etat.profondeurCibleMois`,
   * inchangée par cette réactivation). Absente : la totalité des mois de la
   * profondeur cible est candidate à la réinjection (seuls les mois déjà
   * présents dans `moisRestants` sont exclus de l'ajout, par construction
   * de l'union).
   */
  moisDebut?: AnneeMois;
  moisFin?: AnneeMois;
  cheminCheckpoint?: string;
}

export interface DependancesReactivation {
  lireCheckpoint: typeof lireCheckpoint;
  ecrireCheckpoint: typeof ecrireCheckpoint;
  maintenant: () => Date;
}

function cleMois(m: AnneeMois): string {
  return `${m.annee}-${m.moisNumero}`;
}

/** `true` si `m` est dans la plage [moisDebut, moisFin] (bornes incluses, comparaison lexicographique valide car AAAA-MM). Sans bornes fournies : toujours `true`. */
function dansLaPlage(m: AnneeMois, moisDebut: AnneeMois | undefined, moisFin: AnneeMois | undefined): boolean {
  const cle = cleMois(m);
  if (moisDebut && cle < cleMois(moisDebut)) return false;
  if (moisFin && cle > cleMois(moisFin)) return false;
  return true;
}

export async function reactiverMoisCheckpoint(
  options: OptionsReactivation,
  deps: DependancesReactivation,
): Promise<EntreeReactivation[]> {
  const cheminCheckpoint = options.cheminCheckpoint ?? CHEMIN_CHECKPOINT_DEFAUT;
  const checkpoint = await deps.lireCheckpoint(cheminCheckpoint);
  const maintenant = deps.maintenant();
  const rapport: EntreeReactivation[] = [];
  let modifie = false;

  for (const connecteurId of options.connecteurIds) {
    const etat = checkpoint.connecteurs[connecteurId];
    if (!etat) {
      // Jamais vu par le backfill (jamais audité/lancé pour ce connecteur) —
      // rien à réactiver, ce n'est pas une erreur bloquante pour les autres
      // connecteurs du périmètre (même esprit que executerBackfill, FR-009).
      rapport.push({ connecteurId, connecteurConnu: false, moisAjoutes: [] });
      continue;
    }

    const moisPossibles = construireMoisCibles(maintenant, etat.profondeurCibleMois).filter((m) =>
      dansLaPlage(m, options.moisDebut, options.moisFin),
    );

    const ensembleExistant = new Set(etat.moisRestants.map(cleMois));
    const moisAjoutes = moisPossibles.filter((m) => !ensembleExistant.has(cleMois(m)));

    if (moisAjoutes.length > 0) {
      // CORRECTIF (2026-09-09, demande utilisateur : traiter les mois du
      // plus récent au plus ancien) : un simple append en fin de tableau
      // laissait les mois déjà présents (potentiellement anciens) devant
      // les mois nouvellement réinjectés (potentiellement récents) —
      // `executerBackfill` consomme `moisRestants` par le DÉBUT
      // (`file.cibles.shift()`), donc cet ordre déterminait directement la
      // priorité réelle de traitement, à l'opposé de l'intention de
      // `construireMoisCibles` (M-1 en tête). Retrié systématiquement du
      // plus récent au plus ancien après fusion — jamais de perte ni de
      // doublon (l'union elle-même est inchangée), seul l'ordre change.
      etat.moisRestants = [...etat.moisRestants, ...moisAjoutes].sort((a, b) => cleMois(b).localeCompare(cleMois(a)));
      // Un connecteur dont les archives avaient été marquées épuisées reste
      // bloqué par `executerBackfill` (qui ignore tout connecteur à
      // `archivesEpuisees: true`) tant que ce champ n'est pas explicitement
      // levé ici — seule cette réactivation ciblée le fait, jamais
      // `executerBackfill` lui-même (FR-015 : reprise sans perte, jamais de
      // reprise automatique d'un connecteur jugé épuisé).
      etat.archivesEpuisees = false;
      modifie = true;
    }

    rapport.push({ connecteurId, connecteurConnu: true, moisAjoutes });
  }

  if (modifie) {
    await deps.ecrireCheckpoint(cheminCheckpoint, checkpoint);
  }

  return rapport;
}

function analyserArguments(argv: string[]): OptionsReactivation {
  const connecteursArg = argv.find((a) => a.startsWith('--connecteurs='));
  if (!connecteursArg) {
    throw new Error('--connecteurs=<id1,id2,...> est obligatoire (périmètre explicite, FR-014).');
  }
  const connecteurIds = connecteursArg
    .slice('--connecteurs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  function parseAnneeMois(valeur: string, nomOption: string): AnneeMois {
    const match = /^(\d{4})-(\d{2})$/.exec(valeur);
    if (!match) throw new Error(`${nomOption} doit être au format AAAA-MM (reçu "${valeur}").`);
    return { annee: match[1]!, moisNumero: match[2]! };
  }

  const moisDebutArg = argv.find((a) => a.startsWith('--mois-debut='));
  const moisFinArg = argv.find((a) => a.startsWith('--mois-fin='));

  return {
    connecteurIds,
    moisDebut: moisDebutArg ? parseAnneeMois(moisDebutArg.slice('--mois-debut='.length), '--mois-debut') : undefined,
    moisFin: moisFinArg ? parseAnneeMois(moisFinArg.slice('--mois-fin='.length), '--mois-fin') : undefined,
  };
}

async function main(): Promise<void> {
  const options = analyserArguments(process.argv.slice(2));
  console.log(`Réactivation sur ${options.connecteurIds.length} connecteur(s) : ${options.connecteurIds.join(', ')}`);

  const rapport = await reactiverMoisCheckpoint(options, {
    lireCheckpoint,
    ecrireCheckpoint,
    maintenant: () => new Date(),
  });

  for (const entree of rapport) {
    if (!entree.connecteurConnu) {
      console.log(`${entree.connecteurId} : jamais vu par le backfill — rien à réactiver.`);
      continue;
    }
    console.log(`${entree.connecteurId} : ${entree.moisAjoutes.length} mois réinjecté(s) dans le checkpoint.`);
  }
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
