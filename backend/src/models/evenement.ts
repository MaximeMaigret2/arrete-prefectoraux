import { z } from 'zod';

/**
 * Événement — fait administratif horodaté, unité atomique et immuable de
 * l'historique append-only d'un département (Principe 2 de la constitution).
 * Voir data-model.md pour les règles de validation détaillées.
 */
export const TypeEvenementSchema = z.enum(['interdiction', 'levee', 'prolongation']);
export type TypeEvenement = z.infer<typeof TypeEvenementSchema>;

export const MethodeCollecteSchema = z.enum(['automatique', 'manuelle_verifiee']);
export type MethodeCollecte = z.infer<typeof MethodeCollecteSchema>;

export const EvenementSchema = z
  .object({
    id: z.string().uuid(),
    departement_code: z.string().min(2).max(3),
    type_evenement: TypeEvenementSchema,
    date_debut: z.string().datetime({ offset: true }).or(z.string().datetime()),
    date_fin: z
      .union([z.string().datetime({ offset: true }), z.string().datetime(), z.null()])
      .default(null),
    reference_arrete: z.string().nullable().default(null),
    autorite_signataire: z.string().min(1),
    source_url: z.string().url().nullable().default(null),
    date_saisie: z.string().datetime({ offset: true }).or(z.string().datetime()),
    connecteur_id: z.string().min(1),
    methode_collecte: MethodeCollecteSchema,
  })
  .superRefine((evt, ctx) => {
    if (evt.date_fin && new Date(evt.date_fin).getTime() < new Date(evt.date_debut).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'date_fin doit être postérieure ou égale à date_debut',
        path: ['date_fin'],
      });
    }
    if (
      (evt.type_evenement === 'interdiction' || evt.type_evenement === 'prolongation') &&
      !evt.reference_arrete
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reference_arrete est obligatoire pour interdiction/prolongation',
        path: ['reference_arrete'],
      });
    }
  });

export type Evenement = z.infer<typeof EvenementSchema>;

export const EvenementsListSchema = z.array(EvenementSchema);
