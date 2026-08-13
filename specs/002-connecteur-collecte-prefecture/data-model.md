# Phase 1 — Data Model: Connecteurs de collecte automatique des arrêtés préfectoraux

Entités extraites du spec ([spec.md](./spec.md), section Key Entities) et des décisions de `research.md`. Ce document est additif au modèle défini dans `specs/001-carte-arretes-rave-teknival/data-model.md` : les entités `Département` et `Événement` n'y sont pas redéfinies, seulement étendues ou référencées.

## Entité : Connecteur (extension)

Le schéma `Connecteur` existant (`backend/src/models/connecteur.ts`, specs/001) n'est pas modifié dans sa forme — il porte déjà `id`, `nom`, `departements_couverts`, `actif`, `derniere_collecte`. Cette feature en précise l'usage :

| Champ | Statut | Précision apportée par cette feature |
|---|---|---|
| `actif` | inchangé | Piloté désormais par l'endpoint admin `PATCH /api/v1/admin/connecteurs/{id}` (FR-012) plutôt que par édition manuelle du fichier ; passage à `false` exclut le connecteur des cycles planifiés et déclenchables, sans effacer son historique déjà publié. |
| `derniere_collecte` | inchangé | Mis à jour automatiquement à la fin de chaque exécution de collecte réussie (FR-011), qu'elle soit planifiée ou manuelle. |
| `type_connecteur` | **nouveau** | Valeurs connues à ce jour : `page_web` \| `pdf` \| `rss` (les deux premières imposées par FR-003/FR-004 ; `rss` ajouté ensuite, format courant de publication du RAA chez certaines préfectures — `contracts/connecteur-interface.md` §4). Désigne le moteur générique (research.md §1) qui exécute ce connecteur, et détermine quel schéma de configuration s'applique (voir « Configuration de connecteur » ci-dessous). Enum volontairement ouvert : de nouvelles valeurs pourront être ajoutées, une par une, si l'analyse du registre des sources (US1) révèle un format qui ne relève d'aucun des trois pour un département donné — jamais anticipées sans source concrète identifiée. |

Chaque connecteur concret (ex. `prefecture-77`) est entièrement défini par cette entrée `Connecteur` (identité, état) **et** par sa configuration déclarative sous `backend/src/connecteurs/configs/<id>.yaml` (paramètres du moteur de son `type_connecteur`) — aucun code spécifique à la préfecture n'existe par ailleurs. L'interface de code que le moteur, une fois configuré, doit satisfaire pour le `runner` est définie dans `contracts/connecteur-interface.md`.

## Entité : Événement (extension)

Le schéma `Evenement` existant (`backend/src/models/evenement.ts`, specs/001) ne porte aujourd'hui aucun champ pour l'autorité signataire, alors que celle-ci est extraite par chaque moteur (`CandidatEvenement.autorite_signataire`, `contracts/connecteur-interface.md` §1), requise par la logique de décision (`champ_manquant` si absente, étape 2 ci-dessous) et exigée par le Principe 1 de la constitution (traçabilité : « autorité signataire (préfecture) »). Sans extension, ce champ serait extrait, validé, puis perdu à la publication.

| Champ | Type | Statut | Description | Règles |
|---|---|---|---|---|
| `autorite_signataire` | string | **nouveau** | Autorité ayant signé l'arrêté (ex. `"Le Préfet de Seine-et-Marne"`) | Obligatoire pour tout événement produit par un connecteur (FR-006) ; recopié tel quel depuis `CandidatEvenement.autorite_signataire` lors de la publication automatique, ou saisi/corrigé par l'opérateur lors de la confirmation d'une anomalie (`contracts/admin-api.yaml`, `ConfirmationAnomalieRequest`) |

**Impact** : extension additive de `EvenementSchema` (aucun champ existant modifié ou supprimé) ; les événements historiques déjà présents dans `events/<code>.json` (specs/001, saisie manuelle antérieure à ce champ) devront soit être rétro-complétés, soit traités avec une valeur par défaut explicite (ex. `"non renseignée"`) — à trancher lors de l'implémentation (T005A), hors périmètre de cette feature au-delà du signalement.

## Entité : Configuration de connecteur (par type)

Données déclaratives (YAML, une par connecteur) qui paramètrent le moteur générique correspondant à `type_connecteur`. Le schéma complet (zod) de chaque type est défini dans `contracts/connecteur-interface.md` ; les champs ci-dessous en donnent la forme conceptuelle commune.

| Type | Champs principaux | Description |
|---|---|---|
| `page_web` | `url_liste`, `selecteur_publications`, `selecteur_lien_pdf` (optionnel), `selecteur_titre`, `autorite_signataire`, `patterns_dates`, `mots_cles_filtrage` | Scrape une page listant les publications (RAA), suit éventuellement un lien vers un PDF joint (auquel cas le texte du PDF est extrait par le même mécanisme que le type `pdf`, réutilisé en interne), puis applique les patterns de reconnaissance de champs. |
| `pdf` | `url_pdf` (fixe ou motif), `autorite_signataire`, `patterns_dates`, `patterns_reference` | Télécharge directement un ou plusieurs PDF (sans page HTML intermédiaire) et en extrait le texte pour reconnaissance de champs. |
| `rss` | `url_flux`, `autorite_signataire`, `mots_cles_filtrage`, `suivre_lien_pdf`, `patterns_dates`, `pattern_reference` | Récupère un flux RSS 2.0 listant les publications (RAA), suit éventuellement le lien d'un item quand il pointe directement vers un PDF (même mécanisme que le type `pdf`, réutilisé en interne), puis applique les patterns de reconnaissance de champs au titre + description de chaque item. |

`page_web` et `pdf` couvrent les formats explicitement exigés par le spec (FR-003/FR-004) et suffisent aux trois connecteurs repris de specs/001 (`prefecture-77/13/33`, tous en `page_web`). `rss` a été ajouté ensuite en suivant le même patron (`contracts/connecteur-interface.md` §5), les flux RSS étant un format courant de publication du RAA. Ces trois types ne prétendent pas épuiser tous les formats de publication existants chez les préfectures françaises : l'analyse du registre des sources (US1) est l'étape qui détermine, département par département, quel format est réellement en jeu (`format_attendu` du registre, `contracts/registre-sources.schema.md`) — un format qui ne relève d'aucun des trois reste marqué `autre`/`inconnu` dans le registre jusqu'à ce qu'un moteur correspondant soit conçu à partir d'une source réelle (research.md §1), pas avant.

**Règle commune, quel que soit le nombre de types en vigueur** : aucune configuration ne référence l'identité d'une autre préfecture ni ne contient de logique conditionnelle propre à un connecteur particulier au-delà de ces paramètres déclaratifs — c'est ce qui garantit que deux connecteurs du même `type_connecteur` se comportent de façon strictement homogène (même moteur, seule la configuration diffère), condition de la lisibilité et de la généricité recherchées.

**Autorité signataire** : `autorite_signataire` est le plus souvent une valeur fixe par département (ex. `"Le Préfet de Seine-et-Marne"`), configurée une fois ; certains connecteurs peuvent la faire varier via un pattern si elle apparaît explicitement et de façon variable dans le texte source.

## Entité : Exécution de collecte

Trace d'un run d'un connecteur donné (append-only, à l'image des événements — Principe 2 appliqué par analogie).

| Champ | Type | Description | Règles |
|---|---|---|---|
| `id` | string (UUID) | Identifiant unique de l'exécution | Généré à la création |
| `connecteur_id` | string | Connecteur ayant produit cette exécution | DOIT correspondre à un `Connecteur` existant |
| `date_execution` | string (ISO 8601, UTC) | Horodatage de l'exécution | Obligatoire |
| `declenchement` | enum: `planifie` \| `manuel` | Origine de l'exécution | FR-013 (quotidien) vs FR-014 (rattrapage manuel) |
| `statut` | enum: `succes` \| `echec` \| `partiel` | Résultat global du run | `partiel` = au moins un événement publié et au moins une anomalie produite dans le même run |
| `nombre_evenements_publies` | integer ≥ 0 | Événements publiés automatiquement pendant ce run | FR-011 |
| `nombre_anomalies` | integer ≥ 0 | Anomalies de collecte créées pendant ce run | FR-011 |
| `message_erreur` | string \| `null` | Détail de l'échec le cas échéant (ex. source injoignable) | `null` si `statut = succes` |

**Invariant** : une `Exécution de collecte` n'est jamais modifiée après écriture ; une nouvelle exécution du même connecteur produit une nouvelle entrée, jamais une mise à jour de la précédente.

## Entité : Source brute

Document ou page originale collectée, à partir de laquelle un événement ou une anomalie a été produit (Principe 1, traçabilité).

| Champ | Type | Description | Règles |
|---|---|---|---|
| `type` | enum: `page_web` \| `pdf` \| `rss` | Nature de la publication brute collectée | — |
| `url` | string (URL) | Adresse d'où la source a été récupérée | Obligatoire |
| `contenu_brut_reference` | string | Référence vers le contenu conservé (ex. chemin du PDF téléchargé, ou horodatage + URL suffisant si la page HTML n'est pas archivée telle quelle) | DOIT permettre à l'opérateur de retrouver exactement ce qui a été lu au moment de la collecte |
| `date_collecte` | string (ISO 8601, UTC) | Moment de la récupération | Obligatoire |

**Usage** : une `Source brute` n'est pas une entité stockée séparément avec son propre identifiant global — elle est embarquée (a) dans l'`Événement` publié via le champ `source_url` déjà prévu par specs/001, et (b) dans l'`Anomalie de collecte` (champ `source_brute`, ci-dessous) pour permettre la résolution par l'opérateur. Pour un PDF, `contenu_brut_reference` pointe vers une copie conservée localement (le fichier source, une fois téléchargé, n'est pas garanti de rester accessible à la même URL indéfiniment) ; pour une page web, l'URL collectée fait foi.

## Entité : Anomalie de collecte

Cas où un connecteur n'a pas pu produire un événement fiable automatiquement.

| Champ | Type | Description | Règles |
|---|---|---|---|
| `id` | string (UUID) | Identifiant unique de l'anomalie | Généré à la création |
| `connecteur_id` | string | Connecteur à l'origine de l'anomalie | DOIT correspondre à un `Connecteur` existant |
| `execution_id` | string (UUID) | Exécution de collecte ayant produit cette anomalie | DOIT correspondre à une `Exécution de collecte` existante |
| `type_anomalie` | enum: `champ_manquant` \| `date_ambigue` \| `doublon_potentiel` \| `echec_lecture_source` | Nature du problème rencontré | Correspond aux 4 cas de FR-008 |
| `champs_extraits` | object (partiel, mêmes clés que `Evenement` sans `id`/`date_saisie`) | Ce que l'extraction a pu déterminer malgré tout | Champs manquants/ambigus omis ou `null` ; sert de brouillon pré-rempli à la résolution |
| `source_brute` | Source brute | Publication brute d'origine | Obligatoire — condition de FR-009 (accès à la source depuis l'espace de résolution) |
| `departement_code` | string | Département concerné | DOIT correspondre à un département existant |
| `raison` | string | Explication lisible de l'anomalie (ex. "date de fin non déterminable dans le texte source", "doublon potentiel avec l'événement {id}") | Obligatoire, affichée à l'opérateur |
| `statut` | enum: `en_attente` \| `confirmee` \| `rejetee` | État de résolution | `en_attente` à la création ; passage à `confirmee` ou `rejetee` par l'opérateur (FR-009), jamais retour en arrière |
| `date_creation` | string (ISO 8601, UTC) | Horodatage de détection | Obligatoire |
| `date_resolution` | string (ISO 8601, UTC) \| `null` | Horodatage de la décision de l'opérateur | `null` tant que `statut = en_attente` |
| `evenement_resultant_id` | string (UUID) \| `null` | Événement créé si `statut = confirmee` | `null` si `en_attente` ou `rejetee` (FR-016 : un rejet ne produit jamais d'événement) |

**Invariants** :
- Une anomalie `en_attente` n'apparaît jamais dans l'API publique ni sur la carte (FR-008 : elle remplace la publication directe, elle ne la précède pas comme étape intermédiaire générale).
- Une anomalie `rejetee` reste tracée indéfiniment (source, raison) mais ne produit et ne référence jamais d'événement visible publiquement (FR-016) — c'est un état terminal, non une suppression.
- Une anomalie `confirmee` référence l'événement qu'elle a produit, publié avec `methode_collecte = manuelle_verifiee` (FR-006, Acceptance Scenario US4.3).

## Entité : Entrée du registre des sources

Pour un département donné — où trouver la publication officielle, indépendamment de l'existence d'un connecteur.

| Champ | Type | Description | Règles |
|---|---|---|---|
| `departement_code` | string | Département concerné | Clé (avec le registre couvrant l'ensemble des départements français, FR-017/SC-007) |
| `statut` | enum: `identifiee` \| `connecteur_developpe` \| `a_investiguer` | Étape de maturité de la source pour ce département | `a_investiguer` = aucune source connue à ce jour (mention explicite requise par FR-017, jamais une simple absence d'entrée) |
| `autorite` | string \| `null` | Nom de l'autorité source (préfecture ou portail régional) | `null` uniquement si `statut = a_investiguer` |
| `point_acces` | string (URL) \| `null` | URL connue où consulter la publication | `null` uniquement si `statut = a_investiguer` |
| `format_attendu` | enum: `page_web` \| `pdf` \| `autre` \| `inconnu` | Format probable de la publication à cette adresse | `inconnu` si non encore vérifié |
| `connecteur_id` | string \| `null` | Connecteur associé une fois développé | `null` tant que `statut ≠ connecteur_developpe` ; DOIT alors correspondre à un `Connecteur` existant et couvrant ce département |
| `notes` | string \| `null` | Remarques libres pour l'opérateur (ex. particularité du site, fréquence de publication observée) | Optionnel |
| `derniere_verification` | string (ISO 8601, date) \| `null` | Dernière fois que l'entrée a été vérifiée manuellement | Optionnel, informatif |

**Format de sérialisation** : YAML (`backend/src/data/registre-sources.yaml`, research.md §8), un document par département, éditable manuellement sans écrire de code (FR-018).

**Invariant** : FR-017 impose une entrée pour chacun des ~101 départements — l'absence d'une entrée pour un code de département existant est elle-même une anomalie de complétude du registre (à vérifier par un test, pas seulement par convention).

## Relations (vue d'ensemble, additive à specs/001)

```text
Connecteur 1 ──── 1 Configuration de connecteur (type_connecteur détermine le schéma)
Connecteur 1 ──── * Exécution de collecte
Exécution de collecte 1 ──── * Anomalie de collecte
Anomalie de collecte 1 ──── 0..1 Événement (evenement_resultant_id, uniquement si confirmee)
Anomalie de collecte 1 ──── 1 Source brute
Événement (automatique) 1 ──── 1 Source brute (embarquée via source_url)
Entrée du registre des sources 1 ──── 0..1 Connecteur (connecteur_id, une fois développé)
Entrée du registre des sources 1 ──── 1 Département
```

## Logique de décision : publication directe vs anomalie (FR-007, FR-008)

Fonction pure côté `runner`, testée unitairement (research.md §9) :

```text
evaluerCandidat(candidat, historiqueDepartement) →
  { action: 'publier', evenement } | { action: 'anomalie', type_anomalie, raison }
```

Algorithme :

1. Si la récupération de la source a échoué (page/PDF inaccessible, vide, ou format non supporté — y compris PDF sans texte extractible, FR-005) → `anomalie` (`echec_lecture_source`).
2. Si un champ requis est manquant ou illisible (référence, date de début, autorité signataire) → `anomalie` (`champ_manquant`).
3. Si une date de fin est mentionnée dans la source mais reste ambiguë après extraction (formulation non résolvable en date ISO) → `anomalie` (`date_ambigue`). Une absence totale de mention de date de fin n'est PAS une ambiguïté : elle correspond à `date_fin = null` (arrêté actif jusqu'à preuve du contraire, cohérent avec specs/001 Principe 6).
4. Sinon, appliquer la détection de doublon (research.md §5) contre `historiqueDepartement` → si positif, `anomalie` (`doublon_potentiel`), en référençant l'événement existant concerné dans `raison`.
5. Sinon → `publier`, avec `methode_collecte = automatique`, `connecteur_id` renseigné, `source_url` pointant vers la Source brute collectée.

**Gestion explicite des cas limites** (issus des Edge Cases du spec) :
- PDF scanné/image sans texte extractible → étape 1, `echec_lecture_source`, jamais de tentative d'OCR (FR-005).
- Changement de structure d'une page/PDF (sélecteurs ne trouvant plus les champs attendus) → traité comme un champ manquant (étape 2), jamais un échec silencieux : le connecteur DOIT toujours produire soit un candidat complet, soit une raison explicite d'anomalie.
- Deux connecteurs différents couvrant le même département avec des événements concurrents → chacun est évalué indépendamment contre le même `historiqueDepartement` (qui inclut les événements déjà publiés par l'autre connecteur) ; un chevauchement fort déclenche la détection de doublon (étape 4) quel que soit le `connecteur_id` d'origine.
- Source temporairement indisponible au moment d'une collecte planifiée → `echec_lecture_source` pour ce run uniquement (étape 1) ; le prochain cycle planifié (FR-013) ou un déclenchement manuel (FR-014) retente naturellement, sans état persistant de "source cassée" à gérer explicitement.
