import { z } from 'zod';

/**
 * Configuration déclarative d'un connecteur `pdf` (contracts/connecteur-interface.md
 * §3). Aucune valeur codée en dur : toute variation entre deux connecteurs
 * `pdf` passe exclusivement par ce schéma (contrat §5, règle 7).
 *
 * Extension par rapport au contrat tel qu'écrit : `type_evenement_par_defaut`
 * n'y figure pas explicitement. Sans lui, `CandidatEvenement.type_evenement`
 * n'a aucune source possible dans ce moteur (le contrat ne fournit ni
 * pattern ni règle pour le déduire du texte) et resterait toujours `null` —
 * ce qui déclencherait systématiquement une anomalie `champ_manquant`
 * (`runner.ts` → `trouverChampManquant`) même pour une extraction par
 * ailleurs complète, contredisant l'objectif de publication automatique
 * (FR-007, US3). Traité ici comme `autorite_signataire` : une valeur fixe
 * par connecteur, homogène avec le principe de configuration déclarative
 * (contrat §5, règle 8) plutôt qu'une déduction implicite non spécifiée.
 * À faire valider/documenter dans le contrat lors d'une prochaine révision.
 */
export const PdfConfigSchema = z.object({
  // URL fixe, ou motif d'URL avec placeholders {annee}/{mois}/{jour}
  // substitués à la date de la collecte (contrat §3).
  url_pdf: z.union([z.string().url(), z.object({ motif: z.string().min(1) })]),
  autorite_signataire: z.string().min(1),
  type_evenement_par_defaut: z.enum(['interdiction', 'levee', 'prolongation']),
  patterns_dates: z.object({
    debut: z.string().min(1),
    fin: z.string().min(1).nullable(),
  }),
  pattern_reference: z.string().min(1),
});

export type PdfConfig = z.infer<typeof PdfConfigSchema>;
