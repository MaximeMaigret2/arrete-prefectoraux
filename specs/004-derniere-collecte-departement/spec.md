# Feature Specification: Date de dernière collecte affichée par département

**Feature Branch**: `004-derniere-collecte-departement`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description : backlog produit priorisé le 2026-08-28, idée n°1 "Date de dernière mise à jour affichée". La variante globale (FR-012, feature 001) est déjà livrée depuis la mise en production initiale : le système affiche déjà, dans l'en-tête de l'application, la date de dernière mise à jour du jeu de données global. Il manque la variante par département, mentionnée dans le journal comme "à préciser : globale et/ou par département" — c'est l'objet de cette feature.

## Contexte

FR-012 (feature 001) impose : "Le système DOIT afficher la date de dernière mise à jour du jeu de données global." C'est fait (`derniereMiseAJour` dans `DataStore`, exposé par `/departements` et `/evenements`, affiché dans l'en-tête de `MapPage.tsx`).

Cette date globale répond à "les données sont-elles fraîches en général ?" mais pas à "quand la source de CE département précis a-t-elle été vérifiée pour la dernière fois ?" — deux départements peuvent avoir des connecteurs collectés à des moments très différents (un hébergeur bloqué temporairement, un connecteur en échec, un cycle de collecte non encore repassé sur tous les départements). La donnée existe déjà : chaque connecteur porte un champ `derniere_collecte` (`backend/src/models/connecteur.ts`, déjà peuplé et maintenu par `updateConnecteur()`), mais elle n'est aujourd'hui ni exposée par l'API au niveau département, ni affichée nulle part côté utilisateur.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Voir la fraîcheur de la donnée d'un département précis (Priority: P1)

En tant qu'utilisateur de la carte, quand je consulte le détail d'un département couvert (survol/sélection, comme pour voir l'arrêté en vigueur), je veux voir la date à laquelle la source de ce département a été vérifiée pour la dernière fois, afin de savoir si l'information affichée pour CE département précis est récente ou potentiellement datée — au-delà du seul indicateur de fraîcheur global déjà affiché en en-tête.

**Why this priority**: C'est l'idée n°1 du backlog produit, priorisée en premier par l'utilisateur le 2026-08-28. Elle complète une fonctionnalité déjà à moitié livrée (la variante globale existe depuis FR-012) sans dépendre d'aucune autre idée du backlog.

**Independent Test**: Sur l'application déployée, survoler un département couvert (vert ou rouge) et vérifier que l'infobulle affiche une date de dernière collecte ; survoler un département non couvert (gris) et vérifier qu'aucune date n'est affichée (donnée non disponible, cohérent avec l'état gris).

**Acceptance Scenarios**:

1. **Given** un département à l'état rouge (arrêté en vigueur), **When** l'utilisateur survole ce département, **Then** l'infobulle affiche, en plus de la référence et des dates de l'arrêté déjà affichées, la date de dernière collecte de la source pour ce département.
2. **Given** un département à l'état vert (couvert, aucun arrêté actif), **When** l'utilisateur survole ce département, **Then** l'infobulle affiche la date de dernière collecte de la source pour ce département, en plus du message "Aucune interdiction en vigueur à cette date."
3. **Given** un département à l'état gris (non couvert), **When** l'utilisateur survole ce département, **Then** l'infobulle n'affiche aucune date de collecte (cohérent avec "aucune donnée disponible").
4. **Given** un département couvert par un connecteur dont la collecte n'a jamais encore été exécutée avec succès (`derniere_collecte` à `null` dans les données), **When** l'utilisateur survole ce département, **Then** l'infobulle n'affiche pas de date de collecte plutôt qu'une date invalide ou trompeuse.

### Edge Cases

- Un département historiquement couvert mais dont l'état calculé à la date sélectionnée est gris (règle 1bis de `computeDepartementState` : date antérieure au premier événement connu) : pas de date de collecte affichée, comme pour tout état gris — cohérent avec le comportement déjà en place pour `connecteur_id` sur ce même cas.
- Un département couvert par plusieurs connecteurs (cas non observé aujourd'hui — chaque département n'a qu'un connecteur — mais la donnée doit rester cohérente avec le connecteur effectivement retenu pour `connecteur_id`, jamais un autre).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT exposer, pour chaque département dont l'état est `vert` ou `rouge` dans la réponse de `GET /departements`, la date de dernière collecte du connecteur qui couvre ce département.
- **FR-002**: Le système DOIT retourner `null` pour cette date quand l'état du département est `gris`, ou quand le connecteur qui le couvre n'a encore jamais réalisé de collecte réussie.
- **FR-003**: Le système DOIT afficher cette date dans l'infobulle de détail par département (US3 de la feature 001), pour les départements vert et rouge uniquement.
- **FR-004**: La date affichée DOIT être exprimée dans le fuseau Europe/Paris, cohérent avec le reste de l'affichage (dates d'arrêté, date de mise à jour globale).
- **FR-005**: Cette fonctionnalité ne DOIT introduire aucune nouvelle source de données : elle expose et affiche une donnée déjà collectée et stockée (`Connecteur.derniere_collecte`), jamais une valeur calculée ou approximée.

### Key Entities

- **Connecteur** (existant, `backend/src/models/connecteur.ts`) : aucune modification de schéma. Son champ `derniere_collecte` (déjà présent, déjà maintenu par `updateConnecteur()` à l'issue de chaque exécution) devient consommé par un nouveau point de l'API, en plus de son usage déjà existant dans le calcul de `derniereMiseAJour` globale.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des départements à l'état vert ou rouge dont le connecteur a déjà réalisé au moins une collecte réussie (`derniere_collecte` non nul dans `connecteurs.json`) portent cette date dans `GET /departements`. Vérifié sur les données réelles : à ce jour, seule une minorité de connecteurs ont déjà réellement tourné en production (`derniere_collecte` renseigné pour 8 des 96 connecteurs au 2026-08-29 — les autres ont été développés et validés mais pas encore exécutés en conditions réelles) ; ce nombre croît naturellement avec chaque cycle du scheduler quotidien (FR-013, feature 002), sans action supplémentaire liée à cette feature.
- **SC-002**: 0% des départements à l'état gris ne portent de date de dernière collecte (toujours `null`).
- **SC-003**: Un utilisateur peut identifier, sans quitter l'infobulle déjà utilisée pour voir le détail d'un arrêté, la fraîcheur de la donnée du département consulté — aucune navigation ou interaction supplémentaire requise.

## Assumptions

- Chaque département couvert n'a qu'un seul connecteur (vrai pour les 96 connecteurs actuels) : la résolution "département → connecteur → dernière collecte" réutilise exactement la même logique que celle déjà utilisée pour résoudre `connecteur_id` dans `GET /departements`, jamais une logique parallèle.
- Cette feature ne couvre pas l'affichage des dates de début/fin du dernier arrêté connu quand aucun n'est en vigueur (idée n°2 du backlog produit, feature séparée à venir) ni l'historique par département (idée n°3) — hors scope ici, volontairement.
- Le format d'affichage (date + heure, fuseau Europe/Paris) suit la même convention que la date de mise à jour globale déjà affichée en en-tête, pour rester cohérent visuellement.
