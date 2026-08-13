import { z } from 'zod';

/**
 * Étape de maturité de la source pour un département donné
 * (data-model.md, "Entité Entrée du registre des sources"). `a_investiguer`
 * documente positivement "pas encore de source connue" — FR-017 interdit
 * qu'un département soit simplement absent du registre.
 */
export const StatutRegistreSchema = z.enum(['identifiee', 'connecteur_developpe', 'a_investiguer']);
export type StatutRegistre = z.infer<typeof StatutRegistreSchema>;

/**
 * Format probable de la publication à l'adresse indiquée par `point_acces`.
 * `inconnu` tant qu'aucune vérification n'a eu lieu ; `autre` documente une
 * source dont le format ne relève d'aucun moteur existant
 * (contracts/registre-sources.schema.md, règle 3bis).
 */
export const FormatAttenduSchema = z.enum(['page_web', 'pdf', 'rss', 'autre', 'inconnu']);
export type FormatAttendu = z.infer<typeof FormatAttenduSchema>;

/**
 * Entrée du registre des sources — pour un département donné, où trouver
 * la publication officielle, indépendamment de l'existence d'un connecteur
 * (data-model.md, contracts/registre-sources.schema.md). Le registre
 * précède et documente le connecteur, il ne le remplace pas.
 */
export const EntreeRegistreSchema = z
  .object({
    departement_code: z.string().min(2).max(3),
    statut: StatutRegistreSchema,
    autorite: z.string().nullable(),
    point_acces: z.string().url().nullable(),
    format_attendu: FormatAttenduSchema,
    connecteur_id: z.string().nullable(),
    notes: z.string().nullable(),
    derniere_verification: z.string().date().nullable(),
  })
  .superRefine((entree, ctx) => {
    if (entree.statut !== 'a_investiguer' && (!entree.autorite || !entree.point_acces)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'autorite et point_acces sont obligatoires sauf statut = a_investiguer',
      });
    }
    if (entree.statut === 'a_investiguer' && (entree.autorite || entree.point_acces)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'autorite/point_acces doivent être null tant que statut = a_investiguer',
      });
    }
    if (entree.statut === 'connecteur_developpe' && !entree.connecteur_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'connecteur_id est obligatoire quand statut = connecteur_developpe',
      });
    }
  });

export type EntreeRegistre = z.infer<typeof EntreeRegistreSchema>;

export const RegistreSourcesSchema = z.array(EntreeRegistreSchema);
