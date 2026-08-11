import { z } from 'zod';

/**
 * Département — unité géographique française de référence (data-model.md).
 * Donnée statique, ne fait pas partie de l'historique événementiel.
 * L'état (vert/rouge/gris) n'est jamais stocké ici : il est calculé par
 * `computeDepartementState` (voir services/computeDepartementState.ts).
 */
export const DepartementSchema = z.object({
  code: z.string().min(2).max(3),
  nom: z.string().min(1),
});

export type Departement = z.infer<typeof DepartementSchema>;

export const DepartementsListSchema = z.array(DepartementSchema);
