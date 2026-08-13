import { z } from 'zod';

/**
 * Configuration déclarative d'un connecteur `page_web` (contracts/connecteur-interface.md
 * §2). Aucune valeur codée en dur : toute variation entre deux connecteurs
 * `page_web` passe exclusivement par ce schéma (contrat §5, règle 7).
 *
 * `type_evenement_par_defaut` : même extension et même justification que
 * pour `PdfConfigSchema` (voir son commentaire) — sans valeur fixe par
 * connecteur, `CandidatEvenement.type_evenement` resterait toujours `null`,
 * ce qui déclencherait systématiquement une anomalie `champ_manquant` même
 * pour une extraction propre, contredisant FR-007/US3.
 */
export const PageWebConfigSchema = z.object({
  url_liste: z.string().url(),
  // Sélecteur CSS listant chaque publication (ligne/lien).
  selecteur_publications: z.string().min(1),
  // Sélecteur CSS du libellé/titre de la publication.
  selecteur_titre: z.string().min(1),
  // Sélecteur CSS du lien PDF joint ; `null` si le titre seul suffit à l'extraction.
  selecteur_lien_pdf: z.string().min(1).nullable(),
  autorite_signataire: z.string().min(1),
  type_evenement_par_defaut: z.enum(['interdiction', 'levee', 'prolongation']),
  // Filtrage par pertinence (rave/teknival), insensible à la casse.
  mots_cles_filtrage: z.array(z.string().min(1)).min(1),
  patterns_dates: z.object({
    debut: z.string().min(1),
    fin: z.string().min(1).nullable(),
  }),
  pattern_reference: z.string().min(1),
});

export type PageWebConfig = z.infer<typeof PageWebConfigSchema>;
