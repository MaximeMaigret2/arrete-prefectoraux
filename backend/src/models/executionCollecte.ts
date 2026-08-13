import { z } from 'zod';

/**
 * Origine d'une exécution de collecte : cycle quotidien planifié (FR-013)
 * ou déclenchement manuel par l'opérateur (FR-014).
 */
export const DeclenchementSchema = z.enum(['planifie', 'manuel']);
export type Declenchement = z.infer<typeof DeclenchementSchema>;

/**
 * Résultat global d'une exécution. `partiel` signifie qu'au moins un
 * événement a été publié ET qu'au moins une anomalie a été produite
 * dans le même run (data-model.md, Entité "Exécution de collecte").
 */
export const StatutExecutionSchema = z.enum(['succes', 'echec', 'partiel']);
export type StatutExecution = z.infer<typeof StatutExecutionSchema>;

/**
 * Exécution de collecte — trace d'un run d'un connecteur donné,
 * append-only à l'image des événements (Principe 2, appliqué par analogie).
 * Une exécution n'est jamais modifiée après écriture (data-model.md).
 */
export const ExecutionCollecteSchema = z
  .object({
    id: z.string().uuid(),
    connecteur_id: z.string().min(1),
    date_execution: z.string().datetime({ offset: true }).or(z.string().datetime()),
    declenchement: DeclenchementSchema,
    statut: StatutExecutionSchema,
    nombre_evenements_publies: z.number().int().min(0),
    nombre_anomalies: z.number().int().min(0),
    message_erreur: z.string().nullable().default(null),
  })
  .superRefine((exec, ctx) => {
    if (exec.statut === 'succes' && exec.message_erreur !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'message_erreur doit être null si statut = succes',
        path: ['message_erreur'],
      });
    }
    if (
      exec.statut === 'partiel' &&
      !(exec.nombre_evenements_publies > 0 && exec.nombre_anomalies > 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'statut = partiel requiert au moins un événement publié et au moins une anomalie',
        path: ['statut'],
      });
    }
  });

export type ExecutionCollecte = z.infer<typeof ExecutionCollecteSchema>;

export const ExecutionsCollecteListSchema = z.array(ExecutionCollecteSchema);
