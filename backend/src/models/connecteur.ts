import { z } from 'zod';

/**
 * Connecteur — source de collecte indépendante et pluggable (Principe 10),
 * associée à un ou plusieurs départements. Voir data-model.md.
 */
export const ConnecteurSchema = z.object({
  id: z.string().min(1),
  nom: z.string().min(1),
  departements_couverts: z.array(z.string().min(2).max(3)),
  actif: z.boolean(),
  derniere_collecte: z
    .union([z.string().datetime({ offset: true }), z.string().datetime(), z.null()])
    .default(null),
});

export type Connecteur = z.infer<typeof ConnecteurSchema>;

export const ConnecteursListSchema = z.array(ConnecteurSchema);
