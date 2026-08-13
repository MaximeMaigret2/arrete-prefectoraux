# Contrat : Moteurs génériques par type + interface commune d'un connecteur

Ce contrat définit deux niveaux, strictement séparés (research.md §1) :

1. **L'interface commune `Connecteur`**, seul point de couplage entre un connecteur concret et le cœur applicatif (`runner.ts`). Identique quel que soit le type de source, présent ou futur.
2. **Les schémas de configuration par type**, consommés par le moteur correspondant pour produire un objet conforme à `Connecteur`. C'est cette couche qui porte toute la variation propre à une préfecture donnée — jamais le moteur lui-même.

Aucun moteur n'accède directement au stockage des événements, à la détection de doublon, ni à la création d'anomalies — c'est strictement la responsabilité du `runner` (cf. `data-model.md`, section « Logique de décision »).

**Périmètre de ce document** : `page_web` et `pdf` sont les deux formats confirmés dès le départ — explicitement exigés par le spec (FR-003, FR-004) et couvrant les trois connecteurs repris de specs/001. `rss` (§4) a été ajouté ensuite en suivant exactement le patron de la section 5 : les flux RSS 2.0 sont un format courant chez les préfectures pour publier le RAA (recherche informelle, à confirmer département par département par le registre des sources) et méritaient un moteur générique au même titre que les deux premiers, plutôt qu'être forcés dans `page_web`. L'inventaire complet des types n'est pas décidé par ce plan : il dépend de l'analyse du registre des sources (US1), qui précède et documente chaque connecteur avant son développement (Assumptions du spec). La section 5 explique comment un type supplémentaire est ajouté le jour où cette analyse en révèle un besoin réel.

## 1. Interface commune (inchangée quel que soit le type)

```ts
interface CandidatEvenement {
  departement_code: string;
  type_evenement: 'interdiction' | 'levee' | 'prolongation' | null; // null si indéterminable
  reference_arrete: string | null;
  date_debut: string | null; // ISO 8601 UTC, null si indéterminable
  date_fin: string | null;   // ISO 8601 UTC ; absence légitime de fin ≠ indéterminable (cf. data-model.md §4)
  autorite_signataire: string | null;
  source: SourceBrute;
}

interface SourceBrute {
  type: 'page_web' | 'pdf' | 'rss'; // étendu en même temps que type_connecteur si un nouveau type de moteur est ajouté (§5)
  url: string;
  contenu_brut_reference: string; // chemin de la copie conservée, ou URL si non archivée
  date_collecte: string; // ISO 8601 UTC
}

interface ResultatCollecte {
  // Un candidat par publication détectée depuis la dernière collecte.
  // Liste vide = aucune nouvelle publication depuis la dernière exécution (US3, Acceptance Scenario 3).
  candidats: CandidatEvenement[];
  // Renseigné uniquement si la source elle-même est inaccessible/illisible
  // (distinct d'un candidat individuel mal formé) — déclenche echec_lecture_source
  // pour l'ensemble du run de ce connecteur (data-model.md, étape 1).
  echec_global?: { message: string };
}

interface Connecteur {
  readonly id: string;                    // DOIT correspondre à Connecteur.id dans connecteurs.json
  readonly departements: string[];        // DOIT être un sous-ensemble de Connecteur.departements_couverts
  collecter(): Promise<ResultatCollecte>;
}
```

`registry.ts` construit cette interface pour chaque connecteur actif via :

```ts
function creerConnecteur(entree: ConnecteurEntry, config: unknown): Connecteur {
  switch (entree.type_connecteur) {
    case 'page_web': return moteurPageWeb.creerConnecteur(entree, PageWebConfigSchema.parse(config));
    case 'pdf':      return moteurPdf.creerConnecteur(entree, PdfConfigSchema.parse(config));
    case 'rss':      return moteurRss.creerConnecteur(entree, RssConfigSchema.parse(config));
    // Un nouveau `case` est ajouté ici, et seulement ici, le jour où l'analyse du
    // registre des sources (US1) confirme un besoin réel pour un type supplémentaire
    // (§5). Aucune anticipation avant cette confirmation (research.md §1).
  }
}
```

`runner.ts` ne connaît que `Connecteur` — il n'a aucune branche conditionnelle sur `type_connecteur` ; c'est `registry.ts` qui absorbe toute la connaissance des types disponibles, en un seul endroit.

## 2. Moteur `page_web`

Scrape une page listant des publications (RAA), identifie celles pertinentes, suit éventuellement un lien vers un PDF joint (auquel cas il délègue l'extraction de texte au même mécanisme que le moteur `pdf`, réutilisé en interne comme sous-fonction), puis applique les patterns de reconnaissance de champs au texte obtenu (titre de la publication et/ou texte du PDF joint).

```ts
const PageWebConfigSchema = z.object({
  url_liste: z.string().url(),
  selecteur_publications: z.string(),      // sélecteur CSS listant chaque publication (ligne/lien)
  selecteur_titre: z.string(),             // sélecteur CSS du libellé/titre de la publication
  selecteur_lien_pdf: z.string().nullable(), // sélecteur CSS du lien PDF joint, null si le titre suffit
  autorite_signataire: z.string(),         // valeur fixe pour ce département (cas usuel)
  mots_cles_filtrage: z.array(z.string()).min(1), // ex. ["rave", "teknival", "rassemblement musical"]
  patterns_dates: z.object({
    debut: z.string(),  // regex nommée, appliquée au texte, capture un groupe "date"
    fin: z.string().nullable(),
  }),
  pattern_reference: z.string(), // regex capturant la référence de l'arrêté
});
```

**Comportement générique** (identique pour tout connecteur `page_web`, quelle que soit la configuration) :
1. Récupérer `url_liste` (fetch natif).
2. Lister les publications via `selecteur_publications` + `selecteur_titre` (cheerio).
3. Filtrer par `mots_cles_filtrage` (insensible à la casse) — seules les publications pertinentes pour rave/teknival deviennent des candidats.
4. Pour chaque publication retenue : si `selecteur_lien_pdf` est renseigné et trouve un lien, télécharger ce PDF et en extraire le texte (réutilise la logique du moteur `pdf`, §3) ; sinon, le texte du titre/de la ligne sert de base à l'extraction.
5. Appliquer `pattern_reference` et `patterns_dates` (`extraction/champsCommuns.ts`, partagé avec le moteur `pdf`) sur ce texte pour produire les champs du candidat ; `autorite_signataire` est reprise telle quelle de la configuration.
6. Si `url_liste` est inaccessible → `echec_global`. Si une publication retenue ne produit aucun champ exploitable → le candidat est renvoyé avec les champs correspondants à `null` (jamais omis silencieusement, cf. Règle 2 ci-dessous).

## 3. Moteur `pdf`

Télécharge directement un ou plusieurs PDF (sans page HTML intermédiaire à parser — ex. une URL fixe mise à jour périodiquement, ou un motif d'URL prévisible) et en extrait le texte pour reconnaissance de champs.

```ts
const PdfConfigSchema = z.object({
  url_pdf: z.union([z.string().url(), z.object({ motif: z.string() })]), // motif = gabarit d'URL avec placeholder de date
  autorite_signataire: z.string(),
  patterns_dates: z.object({
    debut: z.string(),
    fin: z.string().nullable(),
  }),
  pattern_reference: z.string(),
});
```

**Comportement générique** :
1. Résoudre `url_pdf` (URL fixe, ou motif substitué avec la date du jour/de la dernière collecte).
2. Télécharger le PDF (fetch natif, `arrayBuffer()`), conserver une copie sous `contenu_brut_reference`.
3. Extraire le texte via `pdf-parse`. Si le texte est vide ou trop court pour être exploitable (PDF scanné/image) → `echec_global` (FR-005, jamais d'OCR).
4. Appliquer `pattern_reference` et `patterns_dates` (même sous-fonction `extraction/champsCommuns.ts` que le moteur `page_web`) sur le texte extrait.

## 4. Moteur `rss`

Récupère un flux RSS 2.0 listant des publications (RAA), identifie celles pertinentes dans le titre/la description de chaque item, suit optionnellement le lien de l'item quand il pointe directement vers un PDF (auquel cas il délègue l'extraction de texte au même mécanisme que le moteur `pdf`, §3, réutilisé en interne comme sous-fonction — exactement comme `page_web`, §2), puis applique les patterns de reconnaissance de champs au texte obtenu.

```ts
const RssConfigSchema = z.object({
  url_flux: z.string().url(),
  autorite_signataire: z.string(),
  mots_cles_filtrage: z.array(z.string()).min(1), // appliqué au texte concaténé titre + description
  suivre_lien_pdf: z.boolean(),            // suivre <link> quand il se termine par .pdf
  patterns_dates: z.object({
    debut: z.string(),
    fin: z.string().nullable(),
  }),
  pattern_reference: z.string(),
});
```

**Comportement générique** (identique pour tout connecteur `rss`, quelle que soit la configuration) :
1. Récupérer `url_flux` (fetch natif).
2. Parser le XML (cheerio en mode XML) et lister les `<item>`. Périmètre limité à RSS 2.0 (`<title>`, `<description>`, `<link>`) — Atom n'est pas couvert par ce moteur (règle 7 ci-dessous : un besoin non exprimable ici est le signal d'un nouveau type, pas d'une branche conditionnelle).
3. Filtrer par `mots_cles_filtrage` (insensible à la casse) sur le texte concaténé titre + description de chaque item.
4. Pour chaque item retenu : si `suivre_lien_pdf` est vrai et que `<link>` se termine par `.pdf`, télécharger ce PDF et en extraire le texte (réutilise la logique du moteur `pdf`, §3) ; sinon, le texte titre + description sert de base à l'extraction.
5. Appliquer `pattern_reference` et `patterns_dates` (`extraction/champsCommuns.ts`, partagé avec `page_web` et `pdf`) sur ce texte pour produire les champs du candidat ; `autorite_signataire` est reprise telle quelle de la configuration.
6. Si `url_flux` est inaccessible → `echec_global`. Si un item retenu ne produit aucun champ exploitable → le candidat est renvoyé avec les champs correspondants à `null` (jamais omis silencieusement, cf. Règle 2, §6).

## 5. Ajouter un type de moteur (quand l'analyse du registre des sources en révèle le besoin)

Ni `page_web`, ni `pdf`, ni `rss` ne prétendent couvrir tous les formats de publication existants chez les préfectures françaises (research.md §1). Quand l'analyse du registre des sources (US1) identifie, pour un département donné, une source qui ne correspond à aucun des trois (ex. un portail exposant une API JSON, ou un flux Atom), le nouveau type est ajouté en suivant exactement le même patron, sans exception :

1. **Confirmer le besoin sur une source réelle.** Ne pas écrire de schéma de configuration avant d'avoir la source concrète sous les yeux (URL, format exact) — le schéma doit refléter ce que cette source fournit réellement, pas une supposition générique. C'est le rôle du registre des sources (entrée `format_attendu`, `contracts/registre-sources.schema.md`) de documenter cette source avant que le connecteur ne soit développé.
2. **Créer le moteur**, isolé sous `backend/src/connecteurs/moteurs/<nouveau-type>/`, avec son propre `config.schema.ts` (zod) — aussi simple que le besoin réel l'exige, à l'image de `PageWebConfigSchema`/`PdfConfigSchema`/`RssConfigSchema` ci-dessus.
3. **Ajouter la valeur correspondante à `type_connecteur`** (`data-model.md`) et le `case` dans `registry.ts` (§1 ci-dessus) — seul point du code à toucher en dehors du nouveau dossier de moteur.
4. **Ne jamais modifier `runner.ts`, l'API ou la carte** pour ce nouveau type : l'interface `Connecteur` (§1) suffit par construction, c'est ce qui garantit que cette extension reste conforme au Principe 10 (FR-001).
5. **Documenter le nouveau type dans ce contrat** (une section supplémentaire, sur le modèle des sections 2, 3 et 4), pour que deux connecteurs de ce type restent, eux aussi, strictement homogènes entre eux.

## 6. Règles de conformité (s'appliquent à tout moteur, quel que soit son type, actuel ou futur)

1. **Aucun effet de bord sur les données publiées.** Un moteur ne DOIT ni lire ni écrire `events/*.json`, `anomalies.json` ou `executions.json` — il retourne uniquement des candidats. Toute décision de publication ou d'anomalie appartient au `runner`.
2. **Champ indéterminable ≠ champ omis silencieusement.** Si l'extraction ne parvient pas à lire un champ requis, le candidat DOIT le porter à `null` explicitement plutôt que d'être omis — c'est ce qui permet au `runner` de produire une anomalie `champ_manquant` avec les champs partiels déjà extraits (FR-009), au lieu d'un échec silencieux (Edge Case du spec).
3. **Idempotence de `collecter()`.** Appeler `collecter()` deux fois de suite sur une source inchangée DOIT retourner les mêmes candidats (charge au `runner`, pas au moteur, de ne pas republier — la détection de doublon est centralisée, research.md §5).
4. **`source.contenu_brut_reference` DOIT toujours être renseigné** dès qu'une source a pu être atteinte, y compris en cas d'`echec_global` (ex. PDF téléchargé mais illisible) — condition de FR-009.
5. **Aucune tentative d'OCR**, pour aucun type de moteur (FR-005).
6. **Isolation des erreurs.** Une exception non interceptée levée par `collecter()` DOIT être traitée par le `runner` comme un `echec_global` pour ce connecteur uniquement — elle ne DOIT jamais interrompre l'exécution planifiée des autres connecteurs, y compris ceux du même type (FR-012, Principe 10).
7. **Un moteur DOIT rester générique : aucune branche conditionnelle propre à un connecteur donné.** Un moteur ne DOIT jamais contenir de logique du type `if (id === 'prefecture-77')` ni aucune valeur codée en dur spécifique à une préfecture — toute variation entre deux connecteurs du même type DOIT passer exclusivement par leur configuration respective. Un besoin qui ne peut pas s'exprimer dans le schéma de configuration existant d'un type est le signal qu'un **nouveau type de moteur** est nécessaire (ajout isolé sous `connecteurs/moteurs/`), jamais une exception dans un moteur existant — c'est cette règle qui garantit que deux connecteurs du même type restent lisibles et se comportent de façon homogène.
8. **La configuration ne contient aucun code exécutable.** Un fichier `connecteurs/configs/<id>.yaml` DOIT rester des données déclaratives (URL, sélecteurs, patterns, mapping) validables par le schéma zod de son type — jamais de fonction, d'expression évaluée dynamiquement ou de logique métier.

## Exemple : configuration `page_web` pour `prefecture-77`

```yaml
# backend/src/connecteurs/configs/prefecture-77.yaml
type_connecteur: page_web
url_liste: "https://www.seine-et-marne.gouv.fr/Publications/RAA"
selecteur_publications: ".raa-liste .raa-item"
selecteur_titre: ".raa-item__titre"
selecteur_lien_pdf: ".raa-item__piece-jointe a[href$='.pdf']"
autorite_signataire: "Le Préfet de Seine-et-Marne"
mots_cles_filtrage: ["rave", "teknival", "rassemblement musical non déclaré"]
patterns_dates:
  debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})"
  fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})"
pattern_reference: "Arrêté n°\\s*(?<reference>[A-Z0-9-]+)"
```

Un second connecteur `page_web` pour une autre préfecture ne change que ces valeurs — jamais le moteur qui les interprète.

## Exemple : configuration `rss` (illustratif — aucun connecteur `rss` réel tant que le registre des sources n'en a pas confirmé un)

```yaml
# backend/src/connecteurs/configs/<id>.yaml
type_connecteur: rss
url_flux: "https://www.exemple.gouv.fr/Publications/RAA/rss.xml"
autorite_signataire: "Le Préfet de l'Exemple"
mots_cles_filtrage: ["rave", "teknival", "rassemblement musical non déclaré"]
suivre_lien_pdf: true
patterns_dates:
  debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})"
  fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})"
pattern_reference: "Arrêté n°\\s*(?<reference>[A-Z0-9-]+)"
```
