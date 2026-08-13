import { z } from 'zod';

/**
 * Type de moteur générique qui exécute un connecteur (research.md §1).
 * Détermine quel schéma de configuration s'applique
 * (contracts/connecteur-interface.md §2-4). Enum volontairement ouvert :
 * de nouvelles valeurs pourront être ajoutées si un format de publication
 * ne relève ni de page_web, ni de pdf, ni de rss, jamais anticipées sans
 * source concrète.
 */
export const TypeConnecteurSchema = z.enum(['page_web', 'pdf', 'rss']);
export type TypeConnecteur = z.infer<typeof TypeConnecteurSchema>;

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
  type_connecteur: TypeConnecteurSchema,
});

export type Connecteur = z.infer<typeof ConnecteurSchema>;

export const ConnecteursListSchema = z.array(ConnecteurSchema);
