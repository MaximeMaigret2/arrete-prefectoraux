import { z } from 'zod';
import { TypeConnecteurSchema } from './connecteur.js';
import { MethodeCollecteSchema, TypeEvenementSchema } from './evenement.js';

/**
 * Nature du problème rencontré lors d'une collecte automatique — les 4 cas
 * de FR-008 (data-model.md, "Entité Anomalie de collecte").
 */
export const TypeAnomalieSchema = z.enum([
  'champ_manquant',
  'date_ambigue',
  'doublon_potentiel',
  'echec_lecture_source',
  // feature 007 (US1/US2, FR-001/FR-006) : candidat dont le titre seul
  // n'était pas pertinent et dont la résolution du PDF/page_detail associé
  // a échoué — pertinence jamais vérifiable, distinct d'un echec_lecture_source
  // (qui concerne la source entière du connecteur, pas un candidat isolé).
  'candidat_non_resolu',
]);
export type TypeAnomalie = z.infer<typeof TypeAnomalieSchema>;

/**
 * État de résolution d'une anomalie (FR-009). `en_attente` à la création ;
 * transition vers `confirmee` ou `rejetee` par l'opérateur, jamais de retour
 * en arrière (invariant data-model.md).
 */
export const StatutAnomalieSchema = z.enum(['en_attente', 'confirmee', 'rejetee']);
export type StatutAnomalie = z.infer<typeof StatutAnomalieSchema>;

/**
 * Publication brute d'origine à partir de laquelle une anomalie a été
 * produite (data-model.md, "Entité Source brute"). Pas une entité stockée
 * séparément : embarquée ici pour permettre la résolution par l'opérateur
 * (FR-009).
 */
export const SourceBruteSchema = z.object({
  type: TypeConnecteurSchema,
  url: z.string().url(),
  contenu_brut_reference: z.string().min(1),
  date_collecte: z.string().datetime({ offset: true }).or(z.string().datetime()),
});
export type SourceBrute = z.infer<typeof SourceBruteSchema>;

/**
 * Ce que l'extraction a pu déterminer malgré tout — sert de brouillon
 * pré-rempli à la résolution par l'opérateur (data-model.md). Mêmes clés
 * que `Evenement` sans `id`/`date_saisie` ; défini indépendamment (plutôt
 * que via `EvenementSchema.omit(...)`, indisponible sur un schéma affiné
 * par `superRefine`) et volontairement permissif : un champ manquant ou
 * ambigu est omis ou `null` plutôt que de bloquer la création de l'anomalie.
 */
export const ChampsExtraitsSchema = z.object({
  departement_code: z.string().min(2).max(3).nullable().optional(),
  type_evenement: TypeEvenementSchema.nullable().optional(),
  date_debut: z.string().nullable().optional(),
  date_fin: z.string().nullable().optional(),
  reference_arrete: z.string().nullable().optional(),
  autorite_signataire: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  connecteur_id: z.string().nullable().optional(),
  methode_collecte: MethodeCollecteSchema.nullable().optional(),
});
export type ChampsExtraits = z.infer<typeof ChampsExtraitsSchema>;

/**
 * Anomalie de collecte — cas où un connecteur n'a pas pu produire un
 * événement fiable automatiquement (data-model.md, "Entité Anomalie de
 * collecte"). Une anomalie `en_attente` n'apparaît jamais dans l'API
 * publique ni sur la carte (FR-008) ; une anomalie `rejetee` reste tracée
 * indéfiniment mais ne référence jamais d'événement (FR-016).
 */
export const AnomalieCollecteSchema = z
  .object({
    id: z.string().uuid(),
    connecteur_id: z.string().min(1),
    execution_id: z.string().uuid(),
    type_anomalie: TypeAnomalieSchema,
    champs_extraits: ChampsExtraitsSchema,
    source_brute: SourceBruteSchema,
    departement_code: z.string().min(2).max(3),
    raison: z.string().min(1),
    statut: StatutAnomalieSchema.default('en_attente'),
    date_creation: z.string().datetime({ offset: true }).or(z.string().datetime()),
    date_resolution: z
      .union([z.string().datetime({ offset: true }), z.string().datetime(), z.null()])
      .default(null),
    evenement_resultant_id: z.string().uuid().nullable().default(null),
  })
  .superRefine((anomalie, ctx) => {
    if (anomalie.statut === 'en_attente') {
      if (anomalie.date_resolution !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'date_resolution doit être null tant que statut = en_attente',
          path: ['date_resolution'],
        });
      }
      if (anomalie.evenement_resultant_id !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'evenement_resultant_id doit être null tant que statut = en_attente',
          path: ['evenement_resultant_id'],
        });
      }
    }
    if (anomalie.statut === 'rejetee' && anomalie.evenement_resultant_id !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'evenement_resultant_id doit être null si statut = rejetee (FR-016)',
        path: ['evenement_resultant_id'],
      });
    }
    if (anomalie.statut === 'confirmee' && anomalie.evenement_resultant_id === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'evenement_resultant_id est obligatoire si statut = confirmee',
        path: ['evenement_resultant_id'],
      });
    }
  });

export type AnomalieCollecte = z.infer<typeof AnomalieCollecteSchema>;

export const AnomaliesCollecteListSchema = z.array(AnomalieCollecteSchema);
