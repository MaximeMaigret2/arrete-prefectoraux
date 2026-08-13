# Contrat : Registre des sources (`backend/src/data/registre-sources.yaml`)

Le registre des sources est un artefact de données, pas un service : ce document en fixe la structure pour qu'il reste consultable/éditable manuellement (FR-018) tout en restant validable par code (via `zod`, cohérent avec le reste du projet).

## Format

Un document YAML, liste d'entrées — une par département. FR-017 impose une entrée pour chacun des départements français ; l'absence d'un code de département dans ce fichier est une non-conformité du registre (vérifiable par un test qui compare la liste des `departement_code` du registre à `backend/src/data/departements.json`, specs/001).

```yaml
# backend/src/data/registre-sources.yaml
- departement_code: "77"
  statut: connecteur_developpe
  autorite: "Préfecture de Seine-et-Marne"
  point_acces: "https://www.seine-et-marne.gouv.fr/Publications/RAA"
  format_attendu: page_web
  connecteur_id: prefecture-77
  notes: "RAA publié en pages HTML avec pièces jointes PDF selon les arrêtés."
  derniere_verification: "2026-08-01"

- departement_code: "2A"
  statut: a_investiguer
  autorite: null
  point_acces: null
  format_attendu: inconnu
  connecteur_id: null
  notes: null
  derniere_verification: null
```

## Schéma (validation zod, référence de conception)

```ts
const EntreeRegistreSchema = z.object({
  departement_code: z.string().min(2).max(3),
  statut: z.enum(['identifiee', 'connecteur_developpe', 'a_investiguer']),
  autorite: z.string().nullable(),
  point_acces: z.string().url().nullable(),
  format_attendu: z.enum(['page_web', 'pdf', 'rss', 'autre', 'inconnu']),
  connecteur_id: z.string().nullable(),
  notes: z.string().nullable(),
  derniere_verification: z.string().date().nullable(),
}).superRefine((entree, ctx) => {
  if (entree.statut !== 'a_investiguer' && (!entree.autorite || !entree.point_acces)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "autorite et point_acces sont obligatoires sauf statut = a_investiguer",
    });
  }
  if (entree.statut === 'a_investiguer' && (entree.autorite || entree.point_acces)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "autorite/point_acces doivent être null tant que statut = a_investiguer",
    });
  }
  if (entree.statut === 'connecteur_developpe' && !entree.connecteur_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "connecteur_id est obligatoire quand statut = connecteur_developpe",
    });
  }
});

const RegistreSourcesSchema = z.array(EntreeRegistreSchema);
```

## Règles de conformité

1. **Une entrée par département, sans exception.** Le registre DOIT couvrir tous les départements présents dans `backend/src/data/departements.json` — un département absent du registre est une régression détectable par test (SC-007).
2. **`statut = a_investiguer` est une valeur explicite, pas une absence.** FR-017 interdit qu'un département soit simplement absent du fichier ; `a_investiguer` documente positivement "pas encore de source connue".
3. **Le registre précède et documente le connecteur, il ne le remplace pas.** Passer une entrée à `connecteur_developpe` DOIT correspondre à un `connecteur_id` réellement présent et actif (ou l'ayant été) dans `connecteurs.json` — mais l'inverse n'est pas requis à l'instant T : un connecteur peut être temporairement désactivé (FR-012) sans que l'entrée du registre soit modifiée, puisque le registre documente la source, pas l'état opérationnel du connecteur.
3bis. **Cohérence indicative avec `type_connecteur`.** Une fois `statut = connecteur_developpe`, `format_attendu` DOIT correspondre au `type_connecteur` du connecteur référencé (`page_web` ↔ `page_web`, `pdf` ↔ `pdf`, `rss` ↔ `rss`). `format_attendu = autre` documente une source dont le format ne relève d'aucun moteur existant tant que celui-ci n'a pas été conçu à partir de cette source réelle (`contracts/connecteur-interface.md` §5) ; `inconnu` documente qu'aucune vérification n'a encore eu lieu. Ce n'est qu'une fois la source réellement inspectée que l'analyse (US1) tranche entre `page_web`, `pdf`, `rss`, ou un nouveau type à faire naître pour `autre` — jamais anticipé avant cette inspection.
4. **Édition manuelle attendue.** Aucune interface d'administration dédiée n'est requise pour ce registre dans cette itération (FR-018) — il est modifié directement dans le fichier versionné, relu comme tout changement de données (Workflow de développement de la constitution, hors exception connecteur qui ne s'applique pas ici : ce n'est pas une saisie d'événement).
