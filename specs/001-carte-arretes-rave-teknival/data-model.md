# Phase 1 — Data Model: Carte interactive des arrêtés rave/teknival

Entités extraites du spec ([spec.md](./spec.md), section Key Entities) et de la constitution (`.specify/memory/constitution.md`, contraintes techniques). Ce document décrit la forme logique des données, indépendamment du format de sérialisation (voir research.md §3 pour le choix JSON).

## Entité : Département

Unité géographique française de référence. Donnée statique (ne fait pas partie de l'historique événementiel), issue du fond de carte (research.md §1).

| Champ | Type | Description | Règles |
|---|---|---|---|
| `code` | string (2-3 car.) | Code INSEE du département (ex. `"75"`, `"2A"`, `"971"`) | Clé primaire ; identique au code utilisé dans le fond de carte TopoJSON |
| `nom` | string | Nom du département (ex. `"Paris"`) | — |

L'**état** d'un département (`vert` \| `rouge` \| `gris`) n'est **jamais stocké** : c'est une valeur dérivée, calculée par la fonction `computeDepartementState(code, date)` (voir section Logique de calcul ci-dessous), conformément au Principe 2 de la constitution (FR-007).

## Entité : Événement

Fait administratif horodaté, unité atomique et immuable de l'historique (append-only, Principe 2). Correspond au modèle de données minimal défini dans la constitution.

| Champ | Type | Description | Règles de validation |
|---|---|---|---|
| `id` | string (UUID) | Identifiant unique de l'événement | Généré à la création, immuable |
| `departement_code` | string | Référence au département concerné | DOIT correspondre à un code de département existant dans le fond de carte |
| `type_evenement` | enum: `interdiction` \| `levee` \| `prolongation` | Nature du fait administratif | — |
| `date_debut` | string (ISO 8601, UTC) | Date/heure de début d'application | Obligatoire |
| `date_fin` | string (ISO 8601, UTC) \| `null` | Date/heure de fin d'application | `null` = active jusqu'à preuve du contraire (FR-007, Principe 6) ; si renseignée, DOIT être ≥ `date_debut` |
| `reference_arrete` | string | Référence officielle de l'arrêté | Obligatoire pour `interdiction` et `prolongation` |
| `source_url` | string (URL) \| `null` | Lien vers le texte source (Légifrance, RAA, presse officielle) | Optionnel (Principe 1 : "si possible") |
| `date_saisie` | string (ISO 8601, UTC) | Date d'entrée de l'événement dans le système | Obligatoire, distincte de `date_debut` (FR-013) |
| `connecteur_id` | string | Identifiant du connecteur ayant produit l'événement | DOIT correspondre à un `Connecteur` existant |
| `methode_collecte` | enum: `automatique` \| `manuelle_verifiee` | Méthode de collecte de l'événement | Obligatoire (Principe 10) |

**Invariant d'ordonnancement** : pour un même `departement_code`, l'ensemble des événements, trié par `date_debut`, constitue l'historique complet. Aucun événement n'est jamais modifié ou supprimé après écriture (append-only) ; une correction se traduit par un nouvel événement (ex. une `levee` suivie d'une nouvelle `interdiction` corrigée).

## Entité : Connecteur

Source de collecte indépendante (Principe 10), associée à un ou plusieurs départements.

| Champ | Type | Description | Règles |
|---|---|---|---|
| `id` | string | Identifiant unique du connecteur (ex. `"prefecture-77"`) | Clé primaire |
| `nom` | string | Nom lisible de la source (ex. `"Préfecture de Seine-et-Marne"`) | — |
| `departements_couverts` | string[] | Liste des codes de département couverts par ce connecteur | Un département peut être couvert par au plus un connecteur actif à la fois |
| `actif` | boolean | Le connecteur collecte-t-il activement à ce jour | Un département dont tous les connecteurs sont `actif: false` redevient "non couvert" pour les dates postérieures à la désactivation (Edge Case du spec), sans effacer l'historique déjà collecté |
| `derniere_collecte` | string (ISO 8601, UTC) \| `null` | Date de la dernière collecte réussie | Alimente l'indicateur de fraîcheur globale (FR-012) |

**Règle de couverture** : un département est "couvert" à une date T s'il existe, à cette date-là, un `Connecteur` associé (`departements_couverts` le contient) — que ce connecteur soit ou non actuellement `actif` n'affecte que la couverture des dates *futures/courantes*, pas la validité des événements déjà collectés pour des dates passées pendant qu'il était actif. (Le détail précis de cette temporalité de couverture, y compris son propre historique si nécessaire, est laissé à l'implémentation ; le point structurant pour l'API et l'UI est : gris = pas d'événement disponible pour ce département à cette date, quelle qu'en soit la cause.)

## Logique de calcul : état d'un département à une date T

Fonction pure `computeDepartementState(code: string, date: DateISO): { etat: 'vert' | 'rouge' | 'gris', evenement_applicable: Evenement | null }`, cœur testé unitairement (exigence de la constitution).

Algorithme :

1. Si aucun `Connecteur` (actif ou l'ayant été) ne couvre `code` → retourner `{ etat: 'gris', evenement_applicable: null }`.
2. **(1bis)** Si des événements existent pour `code` et que `date` est strictement antérieure à la `date_debut` du plus ancien d'entre eux → retourner `{ etat: 'gris', evenement_applicable: null }`. Un département couvert mais dont la donnée collectée ne remonte pas jusqu'à `date` ne doit jamais être présumé "vert par défaut" (FR-016, Acceptance Scenario US2.4 : "date antérieure à l'existence de toute donnée collectée"). Cette étape ne s'applique pas si `code` n'a jamais aucun événement : dans ce cas, c'est un dossier "propre" et l'étape 4 (vert) s'applique à toute date.
3. Filtrer les événements de `code` dont l'intervalle `[date_debut, date_fin ?? +∞)` contient `date` (bornes incluses ; `date_fin` marque la fin de la journée concernée, cf. Edge Case "portion de journée").
4. Parmi les événements filtrés de type `interdiction` ou `prolongation` non annulés par une `levee` postérieure à leur propre `date_debut` et antérieure ou égale à `date` → si au moins un existe, retourner `{ etat: 'rouge', evenement_applicable: <le plus récent par date_debut> }`.
5. Sinon → retourner `{ etat: 'vert', evenement_applicable: null }` (couvert, aucune interdiction active à cette date, et soit aucun événement connu, soit `date` postérieure ou égale au premier événement connu).

**Gestion explicite des cas limites** (issus des Edge Cases du spec, à couvrir par les tests unitaires) :
- Aucun arrêté pour un département couvert → `vert`, à toute date (dossier "propre", distinct d'une absence de couverture temporelle — voir étape 1bis).
- Département couvert avec des événements connus, à une date antérieure au premier d'entre eux → `gris`, jamais `vert` (étape 1bis, FR-016/US2.4).
- Arrêté avec `date_fin = null` → considéré actif pour toute `date ≥ date_debut`.
- Deux arrêtés qui se chevauchent (ex. prolongation posée avant l'expiration du précédent) → l'état reste `rouge` sans double-comptage ; `evenement_applicable` retourne l'événement le plus pertinent (le plus récemment débuté) pour l'infobulle.
- `date` strictement égale à `date_debut` → jour inclus en `rouge`. `date` strictement égale au jour suivant `date_fin` → `vert` (fin exclusive au lendemain).
- `date` future sans événement connu au-delà de la dernière donnée → retourne le dernier état connu (pas d'extrapolation), à charge pour l'API/UI d'exposer séparément la date de dernière mise à jour globale (FR-012) pour signaler l'absence de garantie.

## Relations

```text
Connecteur 1 ──── * Département (departements_couverts)
Département 1 ──── * Événement (departement_code)
Événement * ──── 1 Connecteur (connecteur_id)
```

## Schéma d'état (résumé)

```text
       [pas de connecteur pour le département à la date T]
                        │
                        ▼
                     ┌───────┐
                     │ GRIS  │  "non couvert"
                     └───────┘

       [connecteur présent] ──► évaluer les événements à la date T
                        │
          aucun événement actif  │  au moins un événement actif
                        ▼                        ▼
                    ┌───────┐               ┌───────┐
                    │ VERT  │               │ ROUGE │
                    └───────┘               └───────┘
```
