/**
 * Correspondance connecteur -> groupe d'hebergement (feature 005, US3,
 * FR-011/FR-013). Derivee d'une resolution DNS reelle des 96 domaines
 * `*.gouv.fr` du registre effectuee le 2026-08-29 (cf.
 * `claude/etat-connecteurs.md` du projet Cowork associe pour le detail) :
 * 94 des 96 connecteurs partagent une seule et meme adresse IP mutualisee
 * (`77.159.252.140`) ; seuls la Moselle (`prefecture-57`, CMS legacy DIMS,
 * chantier dedie du 2026-08-27) et l'Ile-de-France (`prefecture-75`,
 * derriere Cloudflare) en sont hebergees separement.
 *
 * Figee et declarative plutot que resolue en temps reel a chaque lancement
 * (spec.md, Assumptions) : une resolution DNS a chaque execution ajouterait
 * une dependance reseau supplementaire, non necessaire pour un mecanisme
 * declenche manuellement et rarement, et l'hebergement de ces 96 sites
 * prefecture ne change pas d'un jour a l'autre. A mettre a jour
 * manuellement si l'hebergement d'un connecteur change - coherent avec
 * l'edition deja manuelle de `registre-sources.yaml` pour toute autre
 * information structurelle sur une source.
 */

export type GroupeHebergement = 'mutualise' | 'moselle' | 'ile-de-france';

/**
 * Connecteurs dont l'hebergement est CONNU comme distinct de l'IP
 * mutualisee (`77.159.252.140`) - tout connecteur absent de cette table est
 * traite comme faisant partie du groupe `mutualise` (FR-011), qui couvre la
 * grande majorite du perimetre (94/96 au 2026-08-29).
 */
const GROUPES_DEDIES: Readonly<Record<string, GroupeHebergement>> = Object.freeze({
  'prefecture-57': 'moselle',
  'prefecture-75': 'ile-de-france',
});

/** Groupe d'hebergement d'un connecteur donne (FR-011/FR-013) - `mutualise` par defaut. */
export function groupeHebergement(connecteurId: string): GroupeHebergement {
  return GROUPES_DEDIES[connecteurId] ?? 'mutualise';
}

/**
 * Repartit une liste d'identifiants de connecteur en files distinctes par
 * groupe d'hebergement (FR-011/FR-013) - chaque groupe DOIT etre traite de
 * facon strictement sequentielle par l'orchestration (`backfill-historique.ts`),
 * jamais deux groupes en parallele vers le meme hebergeur, mais les groupes
 * eux-memes sont independants les uns des autres (des hebergeurs distincts).
 * L'ordre au sein de chaque groupe est preserve (ordre d'entree de `connecteurIds`).
 */
export function regrouperParHebergement(connecteurIds: readonly string[]): Map<GroupeHebergement, string[]> {
  const groupes = new Map<GroupeHebergement, string[]>();
  for (const id of connecteurIds) {
    const groupe = groupeHebergement(id);
    const liste = groupes.get(groupe);
    if (liste) {
      liste.push(id);
    } else {
      groupes.set(groupe, [id]);
    }
  }
  return groupes;
}
