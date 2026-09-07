import { z } from 'zod';

/**
 * Origine d'une exécution de collecte : cycle quotidien planifié (FR-013),
 * déclenchement manuel par l'opérateur (FR-014), ou collecte historique
 * ponctuelle (feature 005, US3, FR-018) — jamais déclenchée par le cycle
 * planifié lui-même (FR-019), toujours un lancement explicite via
 * `backend/src/scripts/backfill-historique.ts`.
 */
export const DeclenchementSchema = z.enum(['planifie', 'manuel', 'backfill']);
export type Declenchement = z.infer<typeof DeclenchementSchema>;

/**
 * Résultat global d'une exécution. `partiel` signifie qu'au moins un
 * événement a été publié ET qu'au moins une anomalie a été produite
 * dans le même run (data-model.md, Entité "Exécution de collecte").
 * `incertain` (feature 007, US2, FR-006) : au moins un candidat n'a pas pu
 * être résolu (cf. `nombre_candidats_non_resolus`) — prioritaire sur
 * `succes`/`partiel` même si des événements ont été publiés dans le même
 * run, pour qu'un opérateur distingue ce cas au premier coup d'œil sur le
 * statut, sans avoir à connaître un champ annexe.
 */
export const StatutExecutionSchema = z.enum(['succes', 'echec', 'partiel', 'incertain']);
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
    // feature 007 (US2, FR-006) : nombre de candidats dont la pertinence
    // n'a jamais pu être établie pendant ce run — 0 par défaut, rétro-
    // compatible pour les exécutions déjà persistées avant cette feature
    // (`data/loader.ts`, ExecutionsCollecteListSchema.parse()).
    nombre_candidats_non_resolus: z.number().int().min(0).default(0),
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
    // feature 007 (US2, FR-006) : cohérence stricte entre le statut
    // `incertain` et le compteur de candidats non résolus — dans les deux
    // sens, pour qu'aucun consommateur ne puisse observer l'un sans l'autre.
    if (exec.nombre_candidats_non_resolus > 0 && exec.statut !== 'incertain') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'statut doit être incertain dès que nombre_candidats_non_resolus > 0',
        path: ['statut'],
      });
    }
    if (exec.statut === 'incertain' && exec.nombre_candidats_non_resolus === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'statut = incertain requiert nombre_candidats_non_resolus > 0',
        path: ['nombre_candidats_non_resolus'],
      });
    }
  });

export type ExecutionCollecte = z.infer<typeof ExecutionCollecteSchema>;

export const ExecutionsCollecteListSchema = z.array(ExecutionCollecteSchema);
