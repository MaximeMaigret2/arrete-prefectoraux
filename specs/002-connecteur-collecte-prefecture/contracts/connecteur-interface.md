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
  // Extension V001c (Phase 5bis, 2026-08-13) — voir "Navigation multi-niveaux" ci-dessous.
  navigation: z.array(z.object({
    selecteur_liens: z.string(),
    pattern_lien: z.string(), // regex testée contre l'URL résolue ; placeholders {annee}/{mois_numero}/{mois_fr}/{mois_fr_minuscule}
    attribut_lien: z.string().default('href'), // V011 (§2quinquies) — attribut portant le lien ("value" pour un <option>)
  })).default([]),
  page_detail: z.object({
    attribut_lien: z.string().default('href'), // attribut de la publication portant l'URL de sa page de détail (ex. "value" pour un <option>)
  }).nullable().default(null),
});
```

**Comportement générique** (identique pour tout connecteur `page_web`, quelle que soit la configuration) :
1. Résoudre l'URL de la page liste effective : si `navigation` est vide, c'est `url_liste` telle quelle ; sinon, suivre chaque étape de `navigation` (§2bis ci-dessous) pour l'obtenir dynamiquement.
2. Récupérer cette page liste (fetch natif).
3. Lister les publications via `selecteur_publications` + `selecteur_titre` (cheerio).
4. Filtrer par `mots_cles_filtrage` (insensible à la casse) — seules les publications pertinentes pour rave/teknival deviennent des candidats.
5. Pour chaque publication retenue : résoudre son PDF (soit directement via `selecteur_lien_pdf` dans la publication, soit — si `page_detail` est renseigné — en récupérant d'abord la page de détail pointée par `page_detail.attribut_lien` puis en y appliquant `selecteur_lien_pdf`, §2bis) et en extraire le texte (réutilise la logique du moteur `pdf`, §3) ; sinon, le texte du titre/de la ligne sert de base à l'extraction.
6. Appliquer `pattern_reference` et `patterns_dates` (`extraction/champsCommuns.ts`, partagé avec le moteur `pdf`) sur ce texte pour produire les champs du candidat ; `autorite_signataire` est reprise telle quelle de la configuration.
7. Si la résolution de `navigation` échoue, ou si la page liste effective est inaccessible → `echec_global`. Si une publication retenue ne produit aucun champ exploitable → le candidat est renvoyé avec les champs correspondants à `null` (jamais omis silencieusement, cf. Règle 2 ci-dessous). Un échec de résolution de `page_detail` propre à UNE publication n'est jamais global (isolation à l'échelle du candidat, Règle 6).

### 2bis. Navigation multi-niveaux et page de détail (V001c, Phase 5bis — extension générique du moteur `page_web`)

Certaines sources ne publient pas leur liste de publications à une adresse fixe : elle est atteinte en suivant des liens depuis une page racine (ex. année → mois), et/ou chaque publication ne pointe pas directement vers son PDF mais vers une page de détail intermédiaire (ex. une option d'une liste déroulante renvoyant vers une page HTML qui, elle, contient le lien PDF). `navigation` et `page_detail` couvrent ces deux besoins **sans branche par connecteur** (Règle 7) — toute variation reste dans la configuration déclarative de chaque connecteur.

- **`navigation`** (tableau, vide par défaut) : chaque étape trouve, sur la page courante (`url_liste` pour la première étape), le premier lien via `selecteur_liens` dont l'URL résolue correspond à `pattern_lien` (regex testée contre l'URL, jamais le texte affiché — insensible aux accents/variations de libellé), et en fait la page courante de l'étape suivante. `pattern_lien` peut contenir les placeholders `{annee}` (AAAA), `{mois_numero}` (MM) et `{mois_fr}`/`{mois_fr_minuscule}` (nom du mois français sans accent, ex. `Aout`), substitués avec la date de la collecte (Europe/Paris) — jamais une année/un mois codé en dur (Règle 8). La page atteinte après la dernière étape devient la page liste effective des étapes 3-7 ci-dessus.
- **`page_detail`** (objet nullable, `null` par défaut) : quand renseigné, la publication ne porte pas elle-même le PDF mais l'URL d'une page de détail, lue depuis l'attribut `page_detail.attribut_lien` de l'élément publication (`href` par défaut ; ex. `value` pour un `<option>` de `<select>`, dont l'attribut n'est pas nommé `href`). Cette page est récupérée, et `selecteur_lien_pdf` (obligatoire dans ce cas) y est appliqué à la place d'une recherche à l'intérieur de la publication elle-même.

**Exemple : `prefecture-33` (Gironde) — navigation à 2 niveaux, pas de page de détail**

```yaml
navigation:
  - selecteur_liens: ".fr-card__title a"
    pattern_lien: "-de-l-annee-{annee}$"       # racine → carte de l'année courante
  - selecteur_liens: ".fr-card__title a"
    pattern_lien: "/{mois_fr}-{annee}$"        # page année → carte du mois courant
# selecteur_publications/selecteur_titre/selecteur_lien_pdf s'appliquent ensuite
# à la page du mois, exactement comme un connecteur sans navigation.
```

**Exemple : `prefecture-77` (Seine-et-Marne) — navigation à 1 niveau + page de détail**

```yaml
navigation:
  - selecteur_liens: ".fr-card__title a"
    pattern_lien: "/RAA-{annee}$"              # racine → page de l'année courante
selecteur_publications: "select#Liste-liste-docs option[value]"
selecteur_lien_pdf: "a.fr-link--download"      # appliqué à la page de détail, pas à l'<option>
page_detail:
  attribut_lien: "value"                       # l'<option> porte l'URL de sa page de détail dans `value`, pas `href`
```

### 2ter. Navigation par périodes irrégulières (V009, Phase 5bis élargie, 2026-08-14 — extension générique du moteur `page_web`)

Une étape de `navigation` (§2bis) désigne normalement le lien à suivre via `pattern_lien`, un motif unique valide quelle que soit la date d'exécution (ex. `/{mois_fr}-{annee}$`) — suffisant tant que le nom/numéro du mois courant apparaît toujours dans l'URL de la page à atteindre. Certaines sources archivent par une période plus large que le mois, et **irrégulière** (ex. `prefecture-04`, Alpes-de-Haute-Provence : un semestre inégal janvier-à-juillet / août-à-décembre, pas un découpage 6/6) — dans ce cas, le nom du mois courant n'apparaît dans l'URL que pour les mois de bornes de chaque période (ici janvier, juillet, août, décembre), jamais pour les mois intermédiaires : `{mois_fr}` seul devient insuffisant.

`periodes` est une **forme alternative** à `pattern_lien` pour une étape de `navigation` (mutuellement exclusives — une étape déclare l'une ou l'autre, jamais les deux, jamais aucune) : une liste de motifs candidats, chacun associé à une plage de mois `[mois_debut, mois_fin]` (1-12, wraparound autorisé si `mois_debut > mois_fin`). Le moteur retient le motif de la période dont la plage contient le mois courant (Europe/Paris), puis poursuit exactement comme pour `pattern_lien` (mêmes placeholders `{annee}`/`{mois_numero}`/`{mois_fr}`/`{mois_fr_minuscule}`, même recherche du premier lien correspondant via `selecteur_liens`). Aucune période ne couvrant le mois courant (périodes déclarées incomplètes) est traité comme un échec de résolution de cette étape — même traitement qu'un lien introuvable (§6, règle 6 : isolé à ce connecteur).

**Exemple : `prefecture-04` (Alpes-de-Haute-Provence) — navigation à 1 niveau par périodes**

```yaml
navigation:
  - selecteur_liens: ".fr-card__title a"
    periodes:
      - motif: "/{annee}-de-janvier-a-juillet$"   # carte du semestre janvier-juillet
        mois_debut: 1
        mois_fin: 7
      - motif: "/{annee}-de-aout-a-decembre$"     # carte du semestre août-décembre
        mois_debut: 8
        mois_fin: 12
```

### 2quater. Étape de navigation optionnelle (V010, Phase 5bis élargie, 2026-08-14 — extension générique du moteur `page_web`)

Une source peut paginer sa liste de publications (ex. `prefecture-02`/Aisne : pagination de la page ANNÉE entière ; `prefecture-05`/Hautes-Alpes : pagination de chaque page MOIS) — auquel cas une étape de `navigation` supplémentaire saute directement à la dernière page (celle qui contient les publications les plus récentes, cf. exemple ci-dessous) plutôt que de rester sur la première page (la plus ANCIENNE de la période, contrairement à l'intuition — ces sites paginent en ordre chronologique croissant). Problème : le contrôle de pagination lui-même (ex. le lien « dernière page ») **n'existe pas dans le HTML** quand tout tient déjà sur une seule page — situation parfaitement normale en tout début de mois/année, quand peu de publications ont encore paru. Sans traitement particulier, l'étape échouerait alors à tort (« aucun lien ne correspond »), alors que la page courante est déjà, dans ce cas, la bonne liste à utiliser telle quelle.

`optionnelle: true` sur une étape de `navigation` (défaut : `false`, comportement historique inchangé) déclare explicitement cette tolérance : si aucun lien ne correspond au motif de cette étape, elle est simplement **sautée** (la page courante devient directement la page de l'étape suivante, ou la page liste effective si c'était la dernière étape) au lieu de produire un échec. Une étape non `optionnelle` reste un échec strict (dérive de structure) en l'absence de lien correspondant — c'est le comportement par défaut pour toute navigation qui ne relève pas de ce cas de pagination-optionnelle.

**Exemple : `prefecture-05` (Hautes-Alpes) — navigation à 3 niveaux (année → mois → dernière page de pagination, optionnelle)**

```yaml
navigation:
  - selecteur_liens: ".fr-card__title a"
    pattern_lien: "-{annee}$"                    # racine → carte de l'année courante
  - selecteur_liens: ".fr-card__title a"
    pattern_lien: "/{mois_fr}-{annee}$"           # page année → carte du mois courant
  - selecteur_liens: ".fr-pagination__link--last"
    pattern_lien: "\\(offset\\)/\\d+$"            # dernière page (publications les plus récentes du mois)
    optionnelle: true                             # absente si le mois tient déjà sur une seule page
```

### 2quinquies. Attribut de lien configurable pour une étape de navigation (V011, Phase 5bis élargie 4, 2026-08-14 — extension générique du moteur `page_web`)

Une étape de `navigation` (§2bis) trouve normalement son lien suivant dans l'attribut `href` d'un `<a>` — comportement historique, valable pour toutes les sources rencontrées jusqu'à `prefecture-16`. `page_detail.attribut_lien` (§2bis) permettait déjà de lire un attribut différent (ex. `value` d'un `<option>`), mais uniquement pour la résolution du PDF depuis une page de détail par publication — jamais pour une étape de `navigation` elle-même, qui atteint une page LISTE, pas un PDF.

`prefecture-17` (Charente-Maritime) expose ce besoin dès sa toute PREMIÈRE étape de navigation : sa page racine ne liste ses années archivées qu'à travers un `<select>` de formulaire (`<option value="Publications/.../Annee-2026">`), sans aucun `<a href>` équivalent ailleurs sur la page — vérifié en direct. Sans extension, aucune configuration déclarative ne pouvait atteindre la page de l'année courante depuis cette racine.

`attribut_lien` (chaîne, `href` par défaut — comportement historique inchangé pour toute étape existante) sur une étape de `navigation` désigne l'attribut de l'élément trouvé via `selecteur_liens` qui porte l'URL à suivre — même idiome, même nom, même défaut que `page_detail.attribut_lien` (§2bis), réutilisé ici pour la cohérence du schéma plutôt que d'introduire un concept différent pour le même besoin.

**Exemple : `prefecture-17` (Charente-Maritime) — navigation à 1 niveau via `value`, pas `href`**

```yaml
navigation:
  - selecteur_liens: "select option[value]"
    pattern_lien: "Annee-{annee}$"       # racine → page de l'année courante
    attribut_lien: "value"               # l'<option> porte l'URL dans `value`, pas `href` (aucun <a> équivalent)
# Page de l'année atteinte : structure .fr-card classique avec PDF direct
# (pas de page_detail, contrairement à prefecture-16/77).
```

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
