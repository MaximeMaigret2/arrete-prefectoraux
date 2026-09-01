# Feature Specification: États des départements précalculés sur l'intervalle sélectionné (réglette)

**Feature Branch**: `006-etats-precalcules-intervalle`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description : question utilisateur du 2026-09-01 sur le comportement de la réglette (US2, feature 001) — chaque pas de défilement (un jour) déclenche aujourd'hui un nouvel appel `GET /departements?date=...`, ce qui affiche brièvement "Chargement de la carte…" à chaque jour franchi. Investigation menée avec l'utilisateur avant cette spec : le volume de données par réponse est faible (96 départements, quelques dizaines de Ko, et seulement 5 événements réels en production à ce jour) — ce n'est donc pas un problème de volume de données, mais de fréquence d'appel réseau synchrone par pas de réglette. Option retenue après discussion (plutôt qu'un simple debounce côté frontend, qui masquerait le symptôme sans le supprimer, ou qu'un calcul d'état dupliqué côté client, qui violerait le Principe 9 de la constitution) : le backend expose l'état déjà résolu, sous forme de segments compacts, pour l'ensemble de l'intervalle choisi en un seul appel ; le frontend n'a plus, à chaque pas de réglette, qu'une recherche de bornes à faire — jamais un recalcul de règle métier.

## Contexte

Le Principe 9 de la constitution impose que le frontend reste un client de l'API, sans jeu de données parallèle ni logique de calcul dupliquée (à l'exception du fond de carte géographique statique). Le calcul "état d'un département à une date T" (`computeDepartementState.ts`) est une règle non triviale — poses actives, levées, prolongations, résolution de fuseau horaire Europe/Paris, calcul du dernier arrêté connu (feature du 2026-09-01) — et continue d'évoluer au fil du backlog produit. Cette feature ne remet pas en cause ce principe : elle change uniquement le *découpage* des appels à l'API (un appel par intervalle plutôt qu'un appel par jour), pas l'endroit où la règle métier est calculée.

La route existante `GET /departements?date=...` (feature 001) reste utilisée telle quelle pour la sélection "date unique" du calendrier — cette feature ne la modifie pas. Une route `GET /evenements?debut=&fin=` existe déjà (US4, feature 001) mais renvoie des événements bruts : l'exploiter côté frontend obligerait à réimplémenter `computeDepartementState` côté client, ce qui est explicitement écarté ici (cf. Input ci-dessus).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Défilement fluide de la réglette sur un intervalle sélectionné (Priority: P1)

En tant qu'utilisateur ayant choisi un intervalle de dates sur le calendrier, je veux que le déplacement de la réglette jour par jour soit instantané et sans indicateur de chargement à chaque pas, afin de pouvoir explorer rapidement l'évolution des états des départements sur la période sans latence ni interruption visuelle perceptible.

**Why this priority**: C'est l'objet unique de cette feature, remontée directement par l'utilisateur en observant le comportement actuel de l'application déployée.

**Independent Test**: Sur l'application déployée, sélectionner un intervalle de dates (mode "Intervalle" du calendrier), puis déplacer la réglette sur plusieurs jours consécutifs (clavier ou souris) : vérifier qu'un seul appel réseau a lieu au moment de la sélection de l'intervalle, qu'aucun appel ni message de chargement n'apparaît pendant le défilement, et que la couleur des départements ainsi que le contenu de l'infobulle changent correctement à chaque jour affiché.

**Acceptance Scenarios**:

1. **Given** un intervalle de dates sélectionné dans le calendrier, **When** l'utilisateur valide sa sélection, **Then** un seul appel à la nouvelle route `GET /departements/etats?debut=&fin=` est effectué — aucun appel à `GET /departements?date=...` n'est déclenché tant que l'utilisateur reste dans cet intervalle.
2. **Given** les états précalculés déjà chargés pour l'intervalle, **When** l'utilisateur déplace la réglette d'un jour, **Then** la carte et l'infobulle reflètent immédiatement, sans nouvel appel réseau ni indicateur de chargement, l'état résolu pour ce jour à partir des segments déjà reçus.
3. **Given** un département dont l'état change plusieurs fois pendant l'intervalle sélectionné (ex. arrêté posé puis levé, département 13 en mai 2026, cf. fixture e2e existante), **When** l'utilisateur défile la réglette, **Then** la couleur bascule exactement au jour attendu, strictement identique à ce que renverrait `GET /departements?date=...` interrogée pour ce même jour.
4. **Given** une sélection en mode "date unique" (pas d'intervalle), **When** l'utilisateur choisit une date, **Then** le comportement actuel est inchangé : un appel à `GET /departements?date=...` est effectué pour cette seule date — cette feature ne modifie pas ce chemin.

### Edge Cases

- Intervalle réduit à un seul jour (`debut === fin`) : la nouvelle route DOIT renvoyer, pour chaque département, un unique segment couvrant ce jour, cohérent avec `GET /departements?date=debut`.
- Département sans aucun changement d'état sur toute la période demandée (ex. gris en permanence, ou vert en permanence) : un seul segment par département, couvrant tout l'intervalle demandé.
- Intervalle long (plusieurs mois, voire années une fois la collecte historique du backlog — idée n°3 — livrée) : le nombre de segments renvoyés reste proportionnel au nombre réel de changements d'état, pas au nombre de jours, même si le calcul serveur qui les produit parcourt chaque jour en interne (cf. Assumptions pour la limite de taille d'intervalle).
- Paramètres `debut`/`fin` invalides ou absents, ou `fin` antérieure à `debut` : mêmes règles de validation que la route existante `GET /evenements?debut=&fin=` (réponse 400).
- Nouvel arrêté collecté par un connecteur pendant qu'un intervalle est déjà chargé côté client : la fraîcheur affichée reste celle du moment du chargement de l'intervalle, sans rafraîchissement automatique en arrière-plan — comportement déjà identique à celui d'une date unique aujourd'hui, non modifié par cette feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT exposer une nouvelle route `GET /departements/etats?debut=YYYY-MM-DD&fin=YYYY-MM-DD` retournant, pour chaque département, l'état déjà résolu sous forme de segments contigus et non chevauchants couvrant intégralement `[debut, fin]`.
- **FR-002**: Chaque segment DOIT porter les mêmes informations que celles déjà renvoyées par `GET /departements?date=...` pour un jour donné (`etat`, `evenement_applicable`, `dernier_arrete_connu`), plus ses propres bornes `date_debut`/`date_fin`.
- **FR-003**: Le calcul de chaque segment DOIT réutiliser exactement `computeDepartementState` (aucune nouvelle règle métier introduite) : les segments sont obtenus en fusionnant les jours consécutifs dont le résultat est identique, jamais via une logique de résolution parallèle à celle déjà testée.
- **FR-004**: Pour toute date `d` dans `[debut, fin]` et tout département, l'état résolu en recherchant le segment contenant `d` dans la réponse de cette nouvelle route DOIT être strictement identique à celui que renverrait `GET /departements?date=d`.
- **FR-005**: Le frontend DOIT charger les segments une seule fois, au moment où l'intervalle est sélectionné ou modifié dans le calendrier — jamais à chaque pas de la réglette.
- **FR-006**: Le déplacement de la réglette au sein d'un intervalle déjà chargé NE DOIT déclencher aucun appel réseau : l'état affiché est retrouvé localement en recherchant, pour chaque département, le segment dont les bornes contiennent la date affichée.
- **FR-007**: Cette recherche locale DOIT rester une simple comparaison de bornes de dates déjà résolues par le serveur — aucune règle de calcul d'état (activation, levée, prolongation, fuseau horaire) ne DOIT être dupliquée côté frontend (Principe 9 de la constitution, déjà appliqué à `apiClient.ts`).
- **FR-008**: Le chemin "date unique" (mode `single` du calendrier) n'est pas concerné par cette feature et continue d'utiliser `GET /departements?date=...` sans changement.
- **FR-009**: `connecteur_id` et `derniere_collecte` (feature 004), qui ne dépendent pas du jour historique consulté, DOIVENT rester portés une seule fois par département dans la réponse — jamais dupliqués à l'identique dans chaque segment.
- **FR-010**: La nouvelle route DOIT appliquer une limite raisonnable à la taille de l'intervalle demandé (cf. Assumptions), pour ne pas dégrader le temps de réponse si un intervalle démesuré était demandé.

### Key Entities

- **Segment d'état** (nouveau, uniquement une forme de réponse API — pas une entité stockée) : représente une période `[date_debut, date_fin]` pendant laquelle l'état d'un département reste inchangé (`etat`, `evenement_applicable`, `dernier_arrete_connu`). Dérivé à la volée de `computeDepartementState`, jamais persisté — au même titre que la réponse actuelle de `GET /departements?date=...` n'introduit aucun nouveau fichier de données.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pour un défilement complet de la réglette sur N jours au sein d'un intervalle déjà chargé, le nombre d'appels réseau déclenchés passe de N (comportement actuel) à 0 — un seul appel a lieu, au moment de la sélection de l'intervalle, avant le début du défilement.
- **SC-002**: Le déplacement de la réglette au sein d'un intervalle déjà chargé ne fait plus apparaître le message "Chargement de la carte…" — vérifiable en e2e par son absence pendant le défilement, une fois l'intervalle chargé.
- **SC-003**: 100% des jours testés par comparaison croisée (segment renvoyé par la nouvelle route vs `GET /departements?date=...` interrogée jour par jour sur un échantillon représentatif, ex. département 13 en mai 2026) donnent un état strictement identique entre les deux routes.
- **SC-004**: Le nombre de segments renvoyés par département reste égal au nombre réel de changements d'état sur l'intervalle demandé, pas au nombre de jours de cet intervalle — vérifié par un test unitaire sur un intervalle long sans aucun événement (1 seul segment attendu par département).

## Assumptions

- `connecteur_id` et `derniere_collecte` restent portés au niveau département (comme aujourd'hui dans `GET /departements`), pas par segment, car ils ne dépendent pas du jour historique consulté.
- Une limite de taille d'intervalle est ajoutée par prudence (proposition : 3 ans, cohérente avec la cible de profondeur retenue par la feature 005 du backlog produit) — aucun besoin réel dépassant cette taille n'a été observé à ce jour ; valeur à confirmer en phase de planification plutôt que figée ici.
- Le calendrier (mode intervalle) et la réglette existent déjà (feature 001, US2) : cette feature ne change ni leur interface ni leur mode de sélection, uniquement la source des données consultées pendant le défilement.
- Cette feature remplace l'option initialement envisagée avec l'utilisateur (debounce/déclenchement au relâchement de la réglette) : cette option masquait le symptôme sans le supprimer et a été explicitement écartée au profit de cette solution, qui supprime l'appel réseau par pas à la racine.
- Cette feature ne couvre pas de rafraîchissement automatique de l'intervalle déjà chargé si de nouvelles données sont collectées pendant que l'utilisateur explore — hors scope, comme pour le chargement d'une date unique aujourd'hui.
