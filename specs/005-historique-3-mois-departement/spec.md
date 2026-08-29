# Feature Specification: Collecte historique sécurisée et la plus profonde possible par département

**Feature Branch**: `005-historique-3-mois-departement`

**Created**: 2026-08-29 — **Révisé le 2026-08-29** (même jour, retour utilisateur après relecture)

**Status**: Draft

**Input**: User description : backlog produit priorisé le 2026-08-28, idée n°3 « Historique par département — scope initial réduit à 3 mois ». Suite à une analyse du 2026-08-29 (pourquoi si peu de connecteurs ont réellement collecté en production, puis quelle stratégie adopter pour récupérer l'historique par département sans provoquer de blocage IP côté hébergeur), l'utilisateur a demandé d'en faire une spec formelle. **Révision suite à relecture** : l'objectif n'est pas un plafond fixe de 3 mois, mais d'aller **aussi loin que possible dans l'historique — idéalement 3 ans directement — et de ne se replier sur 3 mois que là où l'atteindre exigerait un volume de requêtes disproportionné.** Cette révision généralise en conséquence la capacité de ciblage temporel (US1), ajoute un audit de volume par famille de connecteur pour décider objectivement de la profondeur atteignable (nouvelle US2), et renforce la reprise sur plusieurs jours et le circuit-breaker (US3, ex-US2) suite aux questions de l'utilisateur sur ces deux points précis.

## Contexte

Le moteur `page_web` (`backend/src/connecteurs/moteurs/pageWeb/moteur.ts`) résout aujourd'hui **toute** étape de `navigation` (motif à placeholders `{annee}`/`{mois_numero}`/`{mois_fr}`, ou `periodes`) contre le seul mois courant (Europe/Paris) au moment de l'exécution. Sur les 96 connecteurs réels du périmètre, 95 utilisent une `navigation` de ce type ; un seul (`prefecture-13`) n'en a pas et interroge directement une page plate listant déjà l'année entière. Conséquence : une exécution ordinaire d'un de ces 95 connecteurs ne peut structurellement voir que les publications du mois en cours.

**Le coût d'une collecte historique n'est pas homogène entre connecteurs.** Sur les 95 connecteurs à `navigation`, 18 utilisent en plus un mode `page_detail` : chaque publication candidate trouvée sur la page de liste d'un mois nécessite une requête HTTP supplémentaire vers sa page de détail pour en extraire les dates/référence. Pour ces 18 connecteurs, le coût d'un mois supplémentaire d'historique dépend du nombre de publications réellement présentes ce mois-là (potentiellement élevé). Pour les 77 autres (navigation sans `page_detail` : lien direct vers le PDF dès la page de liste), le coût d'un mois supplémentaire est fixe et faible (une poignée de requêtes de navigation), **indépendamment du volume de publications** — rien n'empêche, pour ceux-là, de viser directement une profondeur de plusieurs années.

Par ailleurs, l'investigation du 2026-08-29 a établi que la quasi-totalité des connecteurs n'ont, à ce jour, jamais réellement collecté en production. Le stockage et la restitution de l'historique existent déjà et n'ont besoin d'aucune modification : `events/<code>.json` (append-only) et `GET /api/v1/departements/{code}/evenements` (feature 001, US4) retournent déjà l'intégralité de l'historique connu d'un département. Le blocage n'est ni le stockage ni l'API de lecture, mais (a) l'incapacité du moteur à cibler un mois passé et (b) l'absence de collecte réelle jusqu'ici.

Une analyse DNS du 2026-08-29 a établi que 94 des 96 sites préfecture partagent une seule et même adresse IP (`77.159.252.140`) — seuls Moselle et l'Île-de-France (`prefecture-75`, Cloudflare) en sont hébergés séparément. Le journal du projet documente déjà deux incidents réels de blocage de cette IP partagée (2026-08-19/20, puis 2026-08-28) déclenchés par des rafales de requêtes concurrentes ou des runs enchaînés sans délai — la présente feature doit explicitement éviter de reproduire ce scénario, d'autant plus qu'une profondeur d'historique plus ambitieuse (jusqu'à 3 ans pour la majorité des connecteurs) augmente mécaniquement le volume total de requêtes par rapport au scope initial à 3 mois.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le moteur peut collecter un mois cible arbitrairement passé (Priority: P1)

En tant que système de collecte, je dois pouvoir résoudre une configuration `navigation` existante contre un mois/année cible explicite et arbitrairement éloigné dans le passé — pas seulement le mois précédent — afin qu'une collecte historique puisse viser plusieurs années en arrière quand c'est pertinent, sans qu'aucune configuration déclarative de connecteur (les 96 fichiers YAML existants) n'ait à être modifiée.

**Why this priority**: Prérequis technique bloquant de toute la feature, quelle que soit la profondeur finalement retenue. Indépendamment testable (résolution de motif contre un mois cible, via fixtures, sans dépendre de l'orchestration des US2/US3).

**Independent Test**: Pour un connecteur de test doté d'une `navigation` à 2 niveaux (année → mois), déclencher une collecte en ciblant un mois situé plusieurs années avant le mois courant et vérifier que les URLs résolues correspondent à ce mois cible (fixture HTTP simulée), y compris au franchissement d'une frontière d'année.

**Acceptance Scenarios**:

1. **Given** un connecteur `page_web` avec une étape de `navigation` à motif `{annee}`/`{mois_numero}`, **When** une collecte est déclenchée en ciblant explicitement un mois cible arbitraire (ex. 30 mois avant le mois courant), **Then** l'URL résolue correspond à ce mois cible, quel que soit son éloignement, pas au mois courant.
2. **Given** le même connecteur, **When** une collecte est déclenchée sans préciser de mois cible (comportement existant), **Then** le comportement reste rigoureusement identique à l'existant : résolution contre le mois courant Europe/Paris (non-régression, FR-002).
3. **Given** un connecteur avec une étape `periodes`, **When** une collecte cible un mois d'une période différente de celle du mois courant, **Then** la période résolue est celle qui contient réellement le mois cible.
4. **Given** une résolution de mois cible qui franchit une ou plusieurs frontières d'année, **When** la collecte est déclenchée, **Then** l'année résolue est correctement décrémentée autant de fois que nécessaire.
5. **Given** un mois cible pour lequel la page distante n'existe plus (archives du site ne remontant pas aussi loin), **When** la collecte est déclenchée, **Then** ce mois produit une anomalie de lecture ordinaire pour ce seul couple connecteur/mois — sans empêcher la collecte des mois plus récents du même connecteur, et sans être compté comme un échec réseau (distinction du edge case dédié ci-dessous).
6. **Given** le connecteur `prefecture-13` (sans étape de `navigation`), **When** un mois cible est fourni, **Then** ce paramètre est sans effet — comportement inchangé.

### User Story 2 - Décider objectivement de la profondeur atteignable par connecteur (Priority: P1)

En tant qu'opérateur, je dois pouvoir estimer, avant de lancer une collecte historique à grande échelle, le volume de requêtes qu'exigerait chaque connecteur pour une profondeur donnée — afin de viser 3 ans quand c'est peu coûteux, et de ne me replier sur le plancher de 3 mois que là où le volume réel le justifie, plutôt que d'appliquer arbitrairement la même limite à tous les connecteurs.

**Why this priority**: Sans cette décision objective, la feature devrait choisir entre deux options insatisfaisantes : plafonner tout le monde à 3 mois (gâchant la capacité réelle de 77 connecteurs à aller bien plus loin sans coût significatif), ou viser 3 ans partout (risquant un volume de requêtes disproportionné sur les 18 connecteurs `page_detail`, à l'origine même des incidents de blocage déjà documentés).

**Independent Test**: Pour l'ensemble des 95 connecteurs à `navigation`, produire une estimation du nombre de requêtes nécessaires pour atteindre 3 mois vs 3 ans, à partir (a) de la présence ou non de `page_detail` dans la configuration (classification statique, gratuite) et (b) pour les seuls connecteurs `page_detail`, d'un échantillon réel limité (les mois déjà atteignables) permettant de projeter le volume sur une profondeur plus grande — sans qu'aucune requête de l'estimation elle-même ne compte comme une collecte historique complète.

**Acceptance Scenarios**:

1. **Given** un connecteur à `navigation` sans `page_detail` (77 des 95 connecteurs concernés), **When** la profondeur cible est déterminée, **Then** elle est fixée à 3 ans par défaut (coût par mois supplémentaire fixe et faible, indépendant du volume de publications).
2. **Given** un connecteur à `navigation` avec `page_detail` (18 des 95 connecteurs concernés), **When** la profondeur cible est déterminée, **Then** elle part du plancher garanti de 3 mois, étendu au-delà seulement si l'échantillon réel de ce connecteur indique un volume de publications par mois raisonnable.
3. **Given** un connecteur `page_detail` dont l'échantillon révèle un volume de publications par mois élevé, **When** la profondeur cible est déterminée, **Then** elle reste au plancher de 3 mois pour ce connecteur — jamais un échec bloquant pour le reste de la feature, seulement une profondeur réduite pour ce seul connecteur.
4. **Given** l'ensemble des profondeurs cibles ainsi déterminées, **When** l'opérateur les consulte avant de lancer la collecte historique à grande échelle, **Then** elles sont explicites et consultables par connecteur (pas une simple estimation interne invisible) — la décision peut être revue avant lancement.

### User Story 3 - Lancer une collecte historique sécurisée, échelonnée et reprise sans perte (Priority: P1)

En tant qu'opérateur du système, je dois pouvoir déclencher une collecte historique ponctuelle, jusqu'à la profondeur cible déterminée (US2) pour chaque connecteur, en évitant tout risque de blocage réseau côté hébergeur, en l'étalant sur plusieurs jours si nécessaire, et en pouvant l'interrompre et la reprendre sans perdre la progression déjà accomplie ni resolliciter inutilement les sites déjà interrogés avec succès.

**Why this priority**: C'est l'objet même de la demande — sans un mécanisme d'exécution sécurisé, résilient et reprenable, les capacités des US1/US2 sont inutilisables à l'échelle de 96 connecteurs × jusqu'à 36 mois sans reproduire les incidents déjà vécus par le projet.

**Independent Test**: Lancer le mécanisme sur un petit sous-ensemble de connecteurs (pilote), l'interrompre volontairement en cours de route, le relancer, et vérifier à partir des journaux qu'aucun couple (connecteur, mois) déjà traité avec succès n'est resollicité, qu'aucune requête n'a été émise en parallèle vers un même hébergeur, et qu'un espacement minimum a été respecté entre chaque requête.

**Acceptance Scenarios**:

1. **Given** les 94 connecteurs hébergés derrière l'IP mutualisée `77.159.252.140`, **When** la collecte historique est lancée, **Then** les requêtes vers ces 94 connecteurs sont traitées de façon strictement séquentielle (jamais deux en parallèle), avec un espacement minimum entre chacune.
2. **Given** les connecteurs Moselle et Île-de-France, hébergés sur des IPs distinctes, **When** la collecte historique est lancée, **Then** ils sont traités par une file séparée de celle de l'hébergeur mutualisé, avec une prudence au moins équivalente.
3. **Given** un nombre anormal d'échecs consécutifs de type réseau bas niveau (fermeture de socket, timeout, connexion refusée) au sein d'une file donnée, **When** ce seuil est atteint, **Then** le mécanisme interrompt automatiquement CETTE file (sans affecter les autres files en cours), consigne précisément le dernier couple (connecteur, mois) traité avec succès pour chaque connecteur de cette file, et ne relance rien automatiquement — la reprise reste une décision explicite de l'opérateur.
4. **Given** une page absente pour un mois cible trop ancien (archives non disponibles côté site, HTTP 404 ou équivalent propre), **When** ce cas survient, **Then** il est traité comme une anomalie de lecture ordinaire pour ce seul couple — il ne compte jamais dans le seuil du circuit-breaker, qui reste réservé aux échecs réseau bas niveau.
5. **Given** un lancement interrompu (volontairement pour étaler sur plusieurs jours, ou par le circuit-breaker), **When** le mécanisme est relancé ultérieurement, **Then** il reprend à partir du dernier couple (connecteur, mois) enregistré comme traité avec succès, sans resolliciter les couples déjà faits — que ce soit le lendemain ou plusieurs jours plus tard.
6. **Given** un connecteur déjà collecté avec succès pour un mois cible donné (avant ou après une reprise), **When** ce mois est malgré tout resollicité (ex. relance manuelle explicite d'un opérateur), **Then** aucun événement n'est publié en double (détection de doublon existante, `dedupe.ts`) — le mécanisme reste sans danger même en cas de resollicitation volontaire.
7. **Given** le périmètre complet, **When** l'opérateur choisit de lancer d'abord un pilote restreint, **Then** le mécanisme permet ce lancement partiel avant toute généralisation.
8. **Given** le cycle planifié quotidien existant (FR-013, feature 002), **When** la collecte historique est ajoutée au système, **Then** ce cycle continue de fonctionner exactement comme avant — la collecte historique n'est jamais déclenchée automatiquement par lui.

### Edge Cases

- Un connecteur désactivé (`actif: false`) au moment du lancement : exclu du périmètre, comme pour toute exécution ordinaire.
- Un mois cible pour lequel la page distante n'existe pas encore (mois cible = mois courant, déjà couvert par le cycle planifié) : redondant, absorbé sans anomalie visible par la détection de doublon.
- Un mois cible trop ancien pour exister côté site (archives limitées) : cf. US1 Acceptance Scenario 5 et US3 Acceptance Scenario 4 — anomalie ordinaire, jamais un déclencheur de circuit-breaker ; constitue aussi la limite naturelle de profondeur atteignable pour ce connecteur (pas besoin de connaître à l'avance la profondeur exacte des archives : on s'arrête quand la page cesse d'exister).
- Un échec de lecture pour UN SEUL des mois ciblés d'un connecteur ne doit pas empêcher la collecte des autres mois du même connecteur, ni celle des autres connecteurs de la file.
- `prefecture-13` (et tout futur connecteur sans `navigation`) : hors périmètre effectif, sa page unique couvre déjà une période supérieure à 3 mois via le cycle ordinaire.
- Une interruption du pont/de la machine en cours de campagne (plusieurs jours) : le mécanisme de reprise (US3) doit permettre de continuer sans perte, quelle que soit la cause de l'interruption (volontaire, circuit-breaker, ou panne).

## Requirements *(mandatory)*

### Functional Requirements

**Ciblage temporel (US1)**

- **FR-001**: Le moteur `page_web` DOIT pouvoir résoudre toute étape de `navigation` existante contre un mois/année cible explicite et arbitrairement éloigné dans le passé, sans qu'aucune des 96 configurations déclaratives existantes n'ait à être modifiée.
- **FR-002**: En l'absence de mois cible explicite, le comportement DOIT rester rigoureusement identique à l'existant — aucune régression du cycle planifié quotidien (FR-013, feature 002) ni du déclenchement manuel existant (FR-014, feature 002).
- **FR-003**: Une collecte ciblant un mois passé DOIT réutiliser, sans aucune modification, la même logique d'évaluation et de publication qu'une collecte ordinaire (`evaluerCandidat`, `dedupe.ts`).
- **FR-004**: Une absence de page pour un mois cible trop ancien (archives non disponibles côté site) DOIT être traitée comme une anomalie de lecture ordinaire pour ce couple connecteur/mois — jamais comme un échec réseau bas niveau.

**Profondeur adaptative (US2)**

- **FR-005**: Le système DOIT classer chaque connecteur à `navigation` selon son mode d'extraction (`page_detail` présent ou non), cette classification étant statique et dérivée directement de sa configuration déclarative existante — aucune nouvelle donnée à saisir manuellement.
- **FR-006**: Pour un connecteur sans `page_detail`, la profondeur cible DOIT être fixée à 3 ans (36 mois), le coût d'un mois supplémentaire étant fixe et indépendant du volume de publications.
- **FR-007**: Pour un connecteur avec `page_detail`, la profondeur cible DOIT partir d'un plancher garanti de 3 mois, et ne peut être étendue au-delà que si une estimation du volume réel de publications par mois (échantillon sur les mois déjà atteignables) indique un coût raisonnable.
- **FR-008**: La décision de profondeur par connecteur (US2) DOIT être consultable explicitement par l'opérateur avant le lancement de la collecte historique à grande échelle (US3) — jamais une estimation interne invisible.
- **FR-009**: Un connecteur pour lequel l'extension au-delà du plancher de 3 mois est jugée trop coûteuse NE DOIT PAS bloquer le reste de la campagne — seule sa propre profondeur cible est réduite.

**Orchestration sécurisée et reprise (US3)**

- **FR-010**: Le système DOIT permettre de lancer la collecte historique sur l'ensemble des connecteurs concernés de façon échelonnée dans le temps, y compris sur plusieurs jours — jamais l'ensemble du périmètre en une seule rafale.
- **FR-011**: Le système DOIT traiter l'ensemble des connecteurs hébergés derrière une même adresse IP partagée (à ce jour : 94 connecteurs derrière `77.159.252.140`) comme une seule file d'attente séquentielle — jamais deux requêtes émises en parallèle par ce mécanisme vers cette IP.
- **FR-012**: Le système DOIT respecter un espacement minimum, configurable, entre deux requêtes consécutives émises vers un même hébergeur par ce mécanisme.
- **FR-013**: Le système DOIT traiter les connecteurs hébergés sur une adresse IP distincte de l'hébergeur mutualisé (à ce jour : Moselle, Île-de-France) par une file dédiée, séparée, avec un niveau de prudence au moins équivalent.
- **FR-014**: Le système DOIT interrompre automatiquement le traitement du reste d'UNE file (sans affecter les autres files) après un nombre anormal d'échecs consécutifs de nature réseau bas niveau (fermeture de socket, timeout, connexion refusée) au sein de cette file — une anomalie de lecture ordinaire (FR-004, page introuvable) ne DOIT jamais compter dans ce seuil.
- **FR-015**: Le système DOIT consigner, pour chaque connecteur, le dernier couple (mois cible) traité avec succès, afin de permettre une reprise ultérieure — que l'interruption soit volontaire (étalement multi-jours) ou provoquée par le circuit-breaker (FR-014) — sans resolliciter les couples déjà traités avec succès.
- **FR-016**: Le système NE DOIT PAS reprendre automatiquement après une interruption (circuit-breaker ou arrêt volontaire) — la reprise reste un déclenchement explicite de l'opérateur, cohérent avec FR-018 (jamais une tâche récurrente).
- **FR-017**: Le système DOIT permettre de restreindre un lancement à un sous-ensemble explicite de connecteurs (pilote), indépendamment d'un lancement portant sur l'ensemble du périmètre.
- **FR-018**: Chaque exécution de collecte historique DOIT être journalisée exactement comme une exécution ordinaire (`ExecutionCollecte`), en la distinguant explicitement d'une exécution planifiée ou manuelle par une valeur de déclenchement dédiée.
- **FR-019**: Le système NE DOIT PAS déclencher automatiquement la collecte historique via le cycle planifié quotidien existant (`scheduler.ts`) — mécanisme distinct, déclenché explicitement.
- **FR-020**: Un connecteur sans étape de `navigation` (à ce jour : `prefecture-13` uniquement) DOIT être ignoré par ce mécanisme.

### Key Entities

- **Connecteur** (existant) : aucune modification de schéma persistant. Son interface d'exécution (`collecter()`) gagne la capacité optionnelle de cibler un mois passé arbitraire.
- **ExecutionCollecte** (existant) : son champ `declenchement` gagne une valeur dédiée pour distinguer une exécution de collecte historique.
- **Evenement**, **AnomalieCollecte** (existants) : aucune modification.
- **État opérationnel de la campagne** (nouveau, non persistant au sens du modèle de données de l'application) : pour chaque connecteur, la profondeur cible décidée (US2) et le dernier mois traité avec succès (US3, FR-015) — un artefact strictement opérationnel du mécanisme de backfill, distinct des entités applicatives, sans impact sur l'API ni sur le frontend.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pour chaque connecteur sans `page_detail` (77 des 95 connecteurs à `navigation`), l'historique collecté atteint 3 ans ou la limite réelle des archives du site, selon ce qui arrive en premier — vérifiable sur `executions.json` (dernier mois atteint avant la première anomalie « page introuvable »).
- **SC-002**: Pour chaque connecteur avec `page_detail` (18 des 95), l'historique collecté atteint au moins 3 mois dans tous les cas, et davantage quand l'audit de volume (US2) le permet — jamais moins de 3 mois pour un connecteur actif et atteignable.
- **SC-003**: 0 événement dupliqué constaté après la collecte historique, pour l'ensemble des départements concernés.
- **SC-004**: Le cycle planifié quotidien continue de produire un comportement strictement identique à l'existant après mise en place de cette feature — 0 régression mesurable.
- **SC-005**: Aucun nouvel incident de blocage réseau de type `77.159.252.140` (comme ceux déjà documentés les 2026-08-19/20 et 2026-08-28) n'est déclenché par ce mécanisme.
- **SC-006**: Une interruption (volontaire ou circuit-breaker) suivie d'une reprise ne resollicite aucun couple (connecteur, mois) déjà traité avec succès — vérifiable en comparant les journaux d'exécution avant/après l'interruption.
- **SC-007**: L'opérateur peut, sans modifier aucune des 96 configurations déclaratives existantes, lancer un pilote restreint puis le périmètre complet, en consultant au préalable la profondeur cible retenue par connecteur.

## Assumptions

- Cette feature est un mécanisme opérationnel ponctuel (déclenché explicitement par un opérateur), pas une fonctionnalité visible par les visiteurs de la carte.
- La restitution de l'historique aux utilisateurs de l'application (idées n°2/3 « affichage » du backlog) est hors scope : l'endpoint `GET /api/v1/departements/{code}/evenements` qui la servira existe déjà et n'a besoin d'aucune modification ; seule l'alimentation en données historiques est traitée ici.
- Les constantes précises (espacement minimum entre requêtes, seuil exact du circuit-breaker, seuil de volume « raisonnable » pour étendre un connecteur `page_detail` au-delà de 3 mois, nombre de connecteurs par lot/jour) sont laissées au chiffrage technique (plan.md) — cette spécification fixe le comportement attendu, pas les valeurs numériques exactes.
- La correspondance connecteur → adresse IP d'hébergement est celle constatée par résolution DNS le 2026-08-29 ; elle peut évoluer et n'a pas vocation à être vérifiée en temps réel à chaque lancement — mise à jour manuelle si l'hébergement change, cohérent avec l'édition déjà manuelle de `registre-sources.yaml`.
- Le plafond de 3 ans est une cible raisonnable et non une limite technique dure : si les archives d'un site vont au-delà, le mécanisme n'est pas tenu de les atteindre (US1 Edge Case, arrêt naturel dès qu'une page cesse d'exister ne s'applique qu'en-deçà de 3 ans) — 3 ans reste le plafond visé par cette feature, une profondeur supérieure resterait une évolution future explicite.
- Le suivi de progression par connecteur (FR-015) est un artefact strictement opérationnel du mécanisme de backfill (ex. fichier d'état local au script), pas une extension du modèle de données applicatif (`ExecutionCollecte` reste inchangé dans sa forme) — un choix délibéré pour ne pas alourdir un contrat de données stable pour un besoin ponctuel de campagne.
