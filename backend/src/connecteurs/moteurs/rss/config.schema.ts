import { z } from 'zod';

/**
 * Configuration déclarative d'un connecteur `rss` (contracts/connecteur-interface.md
 * §4). Aucune valeur codée en dur : toute variation entre deux connecteurs
 * `rss` passe exclusivement par ce schéma (contrat §6, règle 7).
 *
 * Périmètre volontairement restreint à RSS 2.0 (`<item><title>`,
 * `<description>`, `<link>`, `<pubDate>`) — le format le plus répandu pour
 * ce type de publication. Atom n'est pas couvert : si une préfecture expose
 * un flux Atom, ce sera un nouveau type de moteur (§5 du contrat), pas une
 * branche conditionnelle ajoutée ici (règle 7 du contrat).
 *
 * `type_evenement_par_defaut` : même extension et même justification que
 * pour `PageWebConfigSchema`/`PdfConfigSchema` (voir leurs commentaires) —
 * sans valeur fixe par connecteur, `CandidatEvenement.type_evenement`
 * resterait toujours `null`, ce qui déclencherait systématiquement une
 * anomalie `champ_manquant` même pour une extraction propre, contredisant
 * FR-007/US3.
 *
 * `suivre_lien_pdf` : certains flux RSS de RAA ne portent le texte utile
 * (référence, dates) que dans la pièce jointe PDF liée par `<link>`, le
 * `<title>`/`<description>` du flux ne servant que de résumé — même
 * situation que le lien PDF optionnel du moteur `page_web` (§2). Quand
 * `true`, un `<link>` se terminant par `.pdf` est téléchargé et son texte
 * remplace celui de l'item pour l'extraction (réutilise
 * `telechargerEtExtraireTextePdf` du moteur `pdf`, comme le fait déjà
 * `page_web` — aucune duplication de cette logique, research.md §3-4).
 */
export const RssConfigSchema = z.object({
  url_flux: z.string().url(),
  autorite_signataire: z.string().min(1),
  type_evenement_par_defaut: z.enum(['interdiction', 'levee', 'prolongation']),
  // Filtrage par pertinence (rave/teknival), insensible à la casse, appliqué
  // au texte concaténé titre + description de chaque item.
  mots_cles_filtrage: z.array(z.string().min(1)).min(1),
  suivre_lien_pdf: z.boolean(),
  patterns_dates: z.object({
    debut: z.string().min(1),
    fin: z.string().min(1).nullable(),
  }),
  pattern_reference: z.string().min(1),
});

export type RssConfig = z.infer<typeof RssConfigSchema>;
