# Feature Specification: Carte interactive des arrêtés d'interdiction de rassemblements musicaux non déclarés

**Feature Branch**: `001-carte-arretes-rave-teknival`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Créer une application web affichant une carte de France où chaque département reflète l'un de trois états : vert (aucun arrêté en vigueur), rouge (arrêté préfectoral d'interdiction des rassemblements musicaux non déclarés — rave party, teknival — en vigueur), ou gris (aucun connecteur de collecte actif pour ce département, donnée non disponible). L'utilisateur sélectionne une date ou un intervalle via un calendrier, et fait défiler jour par jour via une réglette pour rejouer l'historique complet. Au survol d'un département, une infobulle affiche la référence et les dates exactes de l'arrêté applicable, ou une mention explicite "non couvert" si aucune donnée n'existe pour ce département. Toutes les données sont consultables via une API publique en lecture seule, indépendante de l'interface web."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter l'état actuel des départements sur la carte (Priority: P1)

Un visiteur arrive sur l'application et voit immédiatement une carte de France avec chaque département coloré selon son état à la date du jour : vert (aucun arrêté d'interdiction en vigueur), rouge (arrêté d'interdiction en vigueur), ou gris (aucune source de données active pour ce département).

**Why this priority**: C'est la valeur centrale du produit — sans cette vue, il n'y a pas de produit. Elle doit fonctionner seule pour constituer un MVP consultable.

**Independent Test**: Charger l'application sans interaction supplémentaire et vérifier que les ~101 départements affichent chacun l'un des trois états, cohérent avec le jeu de données du jour.

**Acceptance Scenarios**:

1. **Given** un département sous le coup d'un arrêté d'interdiction actif aujourd'hui, **When** la carte se charge, **Then** ce département apparaît en rouge.
2. **Given** un département sans arrêté actif mais couvert par un connecteur de collecte, **When** la carte se charge, **Then** ce département apparaît en vert.
3. **Given** un département sans connecteur de collecte actif, **When** la carte se charge, **Then** ce département apparaît en gris, distinct visuellement du vert et du rouge.
4. **Given** un utilisateur daltonien, **When** il consulte la carte, **Then** il peut distinguer les trois états grâce à un indicateur non fondé sur la seule couleur (motif, icône ou texte).

---

### User Story 2 - Rejouer l'historique via calendrier et réglette (Priority: P2)

Un utilisateur sélectionne une date précise ou un intervalle de dates via un calendrier, puis fait défiler la réglette jour par jour pour observer l'évolution des états des départements sur la période choisie.

**Why this priority**: C'est la fonctionnalité qui différencie l'outil d'une simple carte statique et qui répond à l'usage "rejouer l'historique complet" explicitement demandé. Elle dépend de la carte (US1) mais apporte une valeur autonome et démontrable.

**Independent Test**: Choisir un intervalle de dates connu incluant la pose et la levée d'un arrêté, faire défiler la réglette jour par jour, et vérifier que le département concerné change de couleur au bon jour.

**Acceptance Scenarios**:

1. **Given** un intervalle de dates sélectionné dans le calendrier, **When** l'utilisateur déplace la réglette d'un jour, **Then** la carte se recalcule pour afficher l'état de tous les départements à ce jour précis.
2. **Given** un arrêté avec une date de début et une date de fin connues, **When** la réglette atteint la date de fin, **Then** le département repasse à l'état vert dès le lendemain de la fin de l'arrêté.
3. **Given** une date unique sélectionnée (sans intervalle), **When** l'utilisateur valide sa sélection, **Then** la carte affiche l'état de tous les départements à cette date, sans nécessiter de réglette.
4. **Given** une date sélectionnée antérieure à l'existence de toute donnée collectée, **When** la carte se recalcule, **Then** tous les départements concernés s'affichent en gris ("non couvert"), jamais en vert par défaut.

---

### User Story 3 - Consulter le détail d'un arrêté au survol (Priority: P3)

Un utilisateur survole un département sur la carte et voit apparaître une infobulle indiquant la référence exacte de l'arrêté applicable ainsi que ses dates de début et de fin, ou une mention explicite "non couvert" si aucune donnée n'existe pour ce département.

**Why this priority**: Apporte la traçabilité et la confiance dans la donnée affichée, mais la carte reste utilisable sans elle (dégradation acceptable si non livrée immédiatement).

**Independent Test**: Survoler un département rouge, un département vert et un département gris, et vérifier le contenu de chaque infobulle.

**Acceptance Scenarios**:

1. **Given** un département en rouge à la date affichée, **When** l'utilisateur le survole, **Then** l'infobulle affiche la référence de l'arrêté et ses dates exactes de début et fin (ou "en cours" si aucune fin connue).
2. **Given** un département en vert à la date affichée, **When** l'utilisateur le survole, **Then** l'infobulle indique explicitement l'absence d'interdiction en vigueur à cette date.
3. **Given** un département en gris, **When** l'utilisateur le survole, **Then** l'infobulle affiche la mention explicite "non couvert", sans laisser entendre qu'aucune interdiction n'existe.

---

### User Story 4 - Consommer les données via l'API publique (Priority: P4)

Un développeur, journaliste ou chercheur tiers interroge l'API publique en lecture seule pour obtenir l'état des départements à une date donnée ou l'historique complet d'un département, indépendamment de l'interface web.

**Why this priority**: Requis par la constitution du projet (réutilisation par des tiers, source de vérité unique) mais consommable indépendamment de l'usage de la carte elle-même ; peut être livré et testé séparément de l'interface visuelle.

**Independent Test**: Appeler chaque endpoint de l'API avec des paramètres valides et invalides, sans passer par l'interface web, et vérifier que les réponses correspondent à ce qu'affiche la carte pour les mêmes paramètres.

**Acceptance Scenarios**:

1. **Given** une date valide, **When** un client externe appelle l'endpoint listant l'état de tous les départements à cette date, **Then** il reçoit une réponse JSON contenant les 3 états possibles et, pour les départements couverts, la référence de l'arrêté applicable le cas échéant.
2. **Given** le code d'un département, **When** un client externe appelle l'endpoint d'historique de ce département, **Then** il reçoit la liste complète et chronologique des événements (arrêtés, prolongations, levées) ou une liste vide accompagnée d'un statut "non couvert".
3. **Given** aucune authentification fournie, **When** un client externe appelle n'importe quel endpoint de lecture, **Then** la requête aboutit normalement (API publique en lecture seule).

---

### Edge Cases

- Que se passe-t-il quand deux arrêtés se chevauchent sur un même département et une même période (ex. prolongation avant l'expiration du précédent) ? L'état affiché doit rester "rouge" sans doublon ni incohérence dans l'infobulle.
- Comment le système traite-t-il un arrêté sans date de fin connue ? Il doit être considéré actif jusqu'à preuve du contraire (nouvel événement de levée), à toute date postérieure à son début.
- Que se passe-t-il quand la date sélectionnée sur la réglette est exactement le jour de début ou de fin d'un arrêté (borne incluse/exclue) ? Le comportement doit être cohérent et documenté (ex. jour de début inclus en rouge, jour suivant la fin en vert).
- Comment un département qui perd son connecteur de collecte (ex. connecteur désactivé) après avoir été couvert doit-il s'afficher pour les dates postérieures à la désactivation ? Il doit repasser en gris pour ces dates, sans effacer l'historique déjà collecté aux dates antérieures.
- Que se passe-t-il si l'utilisateur sélectionne une date future sans donnée connue ? L'état affiché doit rester celui du dernier événement connu à ce jour (pas d'extrapolation), avec une indication que la donnée n'est pas garantie au-delà de la dernière mise à jour.
- Comment l'infobulle se comporte-t-elle pour un arrêté couvrant seulement une portion de la journée affichée ? Le département doit être considéré rouge pour toute la journée concernée, l'infobulle précisant les horaires exacts si connus.
- Que se passe-t-il si l'API et la carte affichent une valeur différente pour les mêmes paramètres ? Ne doit jamais arriver dans le fonctionnement attendu : la carte est un client de l'API, sans jeu de données parallèle (voir Principe 9 de la constitution).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT afficher une carte de France découpée par département, chaque département étant coloré selon l'un de trois états : vert (aucun arrêté actif), rouge (arrêté actif), gris (non couvert).
- **FR-002**: Le système DOIT accompagner chaque état d'un indicateur redondant non fondé sur la seule couleur (motif, icône ou libellé textuel), conforme aux critères d'accessibilité WCAG 2.1 AA sur l'usage de la couleur.
- **FR-003**: Le système DOIT permettre à l'utilisateur de sélectionner une date unique ou un intervalle de dates via un calendrier.
- **FR-004**: Le système DOIT fournir une réglette permettant de faire défiler jour par jour l'intervalle sélectionné, en recalculant l'état de tous les départements à chaque pas.
- **FR-005**: Le système DOIT afficher, au survol d'un département, une infobulle indiquant la référence de l'arrêté applicable et ses dates exactes de début et fin (ou "en cours").
- **FR-006**: Le système DOIT afficher, au survol d'un département sans connecteur de collecte actif à la date affichée, la mention explicite "non couvert", distincte de l'absence d'interdiction.
- **FR-007**: L'état d'un département à une date donnée DOIT être calculé dynamiquement à partir de l'historique complet des événements associés à ce département, jamais lu depuis un champ de statut unique écrasé à chaque mise à jour.
- **FR-008**: Le système DOIT exposer l'intégralité des données (état par département, historique des événements) via une API publique, versionnée (`/api/v1/...`), en lecture seule et sans authentification requise.
- **FR-009**: L'API DOIT être documentée publiquement via un schéma OpenAPI/Swagger.
- **FR-010**: L'API DOIT permettre au minimum : (a) d'obtenir l'état de tous les départements à une date donnée, (b) de récupérer l'historique complet des événements d'un département, (c) de lister tous les événements sur un intervalle de dates, tous départements confondus.
- **FR-011**: L'interface web DOIT consommer exclusivement l'API publique pour ses données (aucun jeu de données parallèle embarqué dans le frontend, en dehors du fond de carte géographique statique).
- **FR-012**: Le système DOIT afficher la date de dernière mise à jour du jeu de données global.
- **FR-013**: Chaque événement exposé (via l'API ou l'infobulle) DOIT permettre de distinguer la date de l'arrêté lui-même de sa date de saisie dans le système.
- **FR-014**: Le système DOIT afficher une mention rappelant qu'il s'agit d'un outil d'information ne remplaçant pas une vérification officielle auprès de la préfecture ou du Recueil des Actes Administratifs.
- **FR-015**: Toutes les dates DOIVENT être stockées en ISO 8601 (UTC) et affichées dans le fuseau Europe/Paris.
- **FR-016**: Un département sans connecteur de collecte actif NE DOIT JAMAIS être affiché en vert par défaut ; il DOIT être affiché en gris ("non couvert").

### Key Entities *(include if feature involves data)*

- **Département**: Unité géographique française (101 départements), identifiée par un code. Son état (vert/rouge/gris) à une date donnée est une valeur calculée, non stockée, dérivée des événements associés et de la présence ou non d'un connecteur de collecte actif.
- **Événement**: Fait administratif horodaté rattaché à un département — pose d'une interdiction, levée, ou prolongation d'un arrêté. Porte une référence d'arrêté, une date de début, une date de fin (optionnelle), une date de saisie dans le système, et l'identifiant du connecteur ayant produit l'événement. L'ensemble ordonné des événements d'un département constitue son historique complet et immuable (append-only).
- **Connecteur**: Source de collecte indépendante associée à un ou plusieurs départements (une préfecture ou un portail régional). Un département sans connecteur actif est affiché "non couvert" (gris), indépendamment de la réalité administrative.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un utilisateur peut déterminer l'état d'un département donné à une date donnée en moins de 10 secondes, sans quitter la page principale.
- **SC-002**: 100% des départements affichés sur la carte portent un indicateur d'état non fondé sur la seule couleur, vérifiable indépendamment de la perception des couleurs.
- **SC-003**: Pour 100% des départements couverts, l'infobulle affiche une référence d'arrêté et des dates exactes ; pour 100% des départements non couverts, elle affiche la mention explicite "non couvert".
- **SC-004**: Un utilisateur peut sélectionner un intervalle de dates et rejouer son historique jour par jour sans rechargement de page, sur un intervalle d'au moins 12 mois.
- **SC-005**: Un consommateur tiers peut obtenir, via l'API publique et sans authentification, l'état de tous les départements à une date donnée ou l'historique complet d'un département, avec une réponse strictement identique aux données affichées sur la carte pour les mêmes paramètres.
- **SC-006**: 100% des dates affichées dans l'interface et retournées par l'API sont cohérentes avec le fuseau Europe/Paris, sans décalage constaté sur les jours de bascule d'un état à l'autre.

## Assumptions

- La couverture par des connecteurs actifs peut être nulle ou partielle au lancement : un état où tous les départements s'affichent en gris est un état valide et attendu en tout début de vie du produit (couverture progressive assumée par construction, voir Principe 10 de la constitution).
- La saisie et la vérification des événements (implémentation des connecteurs de collecte, workflow de relecture avant publication) sont hors périmètre de cette spécification : elle porte sur la consultation (carte, calendrier, réglette, infobulle) et l'exposition en lecture (API), en supposant que des événements conformes au modèle de données existent déjà en amont.
- Aucune borne minimale ou maximale n'est imposée sur la profondeur de l'historique consultable : la réglette et le calendrier couvrent toute la période pour laquelle des événements existent, sans limite technique arbitraire.
- L'application web est un client public, sans espace d'administration ni fonctionnalité d'édition ; toute création ou modification d'événement se fait par un canal séparé (hors périmètre de cette spécification).
- L'application cible un usage web standard (desktop et mobile) sans exigence de support hors-ligne.
- Le fond de carte géographique (contours des départements) est une ressource statique, considérée comme donnée de référence et non comme donnée métier soumise à l'historisation.
