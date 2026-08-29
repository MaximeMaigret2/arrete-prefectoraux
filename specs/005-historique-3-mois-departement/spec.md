# Feature Specification: Collecte historique sécurisée des 3 derniers mois par département

**Feature Branch**: `005-historique-3-mois-departement`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description : backlog produit priorisé le 2026-08-28, idée n°3 « Historique par département — scope initial réduit à 3 mois ». Suite à une analyse du 2026-08-29 (pourquoi si peu de connecteurs ont réellement collecté en production, puis quelle stratégie adopter pour récupérer 3 mois d'historique par département sans provoquer de blocage IP côté hébergeur), l'utilisateur a demandé d'en faire une spec formelle : « oui fais en une spec ».

## Contexte

Le moteur `page_web` (`backend/src/connecteurs/moteurs/pageWeb/moteur.ts`) résout aujourd'hui **toute** étape de `navigation` (motif à placeholders `{annee}`/`{mois_numero}`/`{mois_fr}`, ou `periodes`) contre le seul mois courant (Europe/Paris) au moment de l'exécution — `parisAnneeMoisCourant(new Date())`. Sur les 96 connecteurs réels du périmètre, 95 utilisent une `navigation` de ce type (drill-down année → mois, ou périodes) ; un seul (`prefecture-13`) n'en a pas et interroge directement une page plate listant déjà l'année entière (~270 bulletins). Conséquence directe : une exécution ordinaire d'un de ces 95 connecteurs ne peut structurellement voir que les publications du mois en cours, quelle que soit la fréquence à laquelle elle tourne — elle ne « rattrape » jamais un mois déjà passé.

Par ailleurs, l'investigation du 2026-08-29 a établi que la quasi-totalité des connecteurs n'ont, à ce jour, jamais réellement collecté en production (seuls 8 des 96 connecteurs portent un `derniere_collecte` non lié à des artefacts de test) — l'historique réellement disponible aujourd'hui, département par département, est donc très incomplet, indépendamment même de la limitation ci-dessus.

Le stockage et la restitution de l'historique existent déjà et n'ont besoin d'aucune modification : chaque événement publié est conservé de façon permanente et append-only (`events/<code>.json`), et `GET /api/v1/departements/{code}/evenements` (feature 001, US4, FR-010b) retourne déjà l'intégralité de l'historique connu d'un département, dans l'ordre chronologique. Le blocage n'est donc ni le stockage ni l'API de lecture, mais l'incapacité du moteur à aller chercher des mois passés, combinée à l'absence de collecte réelle jusqu'ici.

Une analyse DNS du 2026-08-29 a par ailleurs établi que 94 des 96 sites préfecture partagent une seule et même adresse IP (`77.159.252.140`, hébergeur mutualisé) — seuls Moselle (`mc.moselle.gouv.fr`) et l'Île-de-France (`prefecture-75`, via `prefectures-regions.gouv.fr`, derrière Cloudflare) en sont hébergés séparément. Le journal du projet documente déjà deux incidents réels de blocage de cette IP partagée (2026-08-19/20, puis à nouveau le 2026-08-28) déclenchés par des rafales de requêtes concurrentes ou des runs de test enchaînés sans délai — la présente feature doit explicitement éviter de reproduire ce scénario à l'échelle de la collecte historique de 96 connecteurs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le moteur peut collecter un mois cible passé, pas seulement le mois courant (Priority: P1)

En tant que système de collecte, je dois pouvoir résoudre une configuration `navigation` existante (motif à placeholders ou `periodes`) contre un mois/année cible explicite, différent du mois courant, afin qu'une collecte historique puisse atteindre les pages de mois déjà passés — sans qu'aucune configuration déclarative de connecteur (les 96 fichiers YAML existants) n'ait à être modifiée.

**Why this priority**: Sans cette capacité, aucune collecte historique n'est possible : c'est le prérequis technique bloquant de toute la feature. Elle est indépendamment testable (résolution de motif contre un mois cible, via fixtures, sans dépendre du mécanisme d'orchestration de l'US2).

**Independent Test**: Pour un connecteur de test doté d'une `navigation` à 2 niveaux (année → mois), déclencher une collecte en ciblant explicitement un mois antérieur au mois courant et vérifier que les URLs résolues correspondent bien à ce mois cible (fixture HTTP simulée) — sans changer la configuration YAML du connecteur.

**Acceptance Scenarios**:

1. **Given** un connecteur `page_web` avec une étape de `navigation` à motif `{annee}`/`{mois_numero}`, **When** une collecte est déclenchée en ciblant explicitement le mois M-1 (mois précédent le mois courant), **Then** l'URL résolue correspond à la page du mois M-1, pas à celle du mois courant.
2. **Given** le même connecteur, **When** une collecte est déclenchée sans préciser de mois cible (comportement existant), **Then** le comportement reste rigoureusement identique à l'existant : résolution contre le mois courant Europe/Paris.
3. **Given** un connecteur avec une étape `periodes` (regroupement de mois, ex. janvier-juillet / août-décembre), **When** une collecte cible un mois d'une période différente de celle du mois courant, **Then** la période résolue est celle qui contient réellement le mois cible, pas celle du mois courant.
4. **Given** une résolution de mois cible qui franchit une frontière d'année (ex. mois courant = janvier, mois cible = novembre de l'année précédente), **When** la collecte est déclenchée, **Then** l'année résolue est correctement décrémentée.
5. **Given** le connecteur `prefecture-13` (sans étape de `navigation`, liste plate), **When** un mois cible est fourni, **Then** ce paramètre est sans effet — le comportement reste celui d'aujourd'hui (toute la page est déjà interrogée, comme pour une collecte ordinaire).

### User Story 2 - Lancer une collecte historique unique sur les 3 derniers mois sans provoquer de blocage IP (Priority: P1)

En tant qu'opérateur du système, je dois pouvoir déclencher une collecte historique ponctuelle couvrant les 3 derniers mois calendaires pour l'ensemble des départements concernés, en évitant tout risque de blocage réseau côté hébergeur — les incidents déjà documentés (2026-08-19/20, 2026-08-28) montrent que des requêtes concurrentes ou rapprochées vers l'hébergeur mutualisé (94 connecteurs derrière la même IP) déclenchent des blocages réels.

**Why this priority**: C'est l'objet même de la demande — sans un mécanisme d'exécution sécurisé, la capacité technique de l'US1 est inutilisable à l'échelle des 96 connecteurs sans reproduire les incidents déjà vécus par le projet.

**Independent Test**: Lancer le mécanisme sur un petit sous-ensemble de connecteurs (pilote) et vérifier, à partir des journaux d'exécution (`ExecutionCollecte`), qu'aucune requête n'a été émise en parallèle vers un même hébergeur, qu'un délai minimum a été respecté entre chaque requête, et qu'aucune anomalie réseau bas niveau (fermeture de socket, timeout) n'a été observée.

**Acceptance Scenarios**:

1. **Given** les 94 connecteurs hébergés derrière l'IP mutualisée `77.159.252.140`, **When** la collecte historique est lancée, **Then** les requêtes vers ces 94 connecteurs sont traitées de façon strictement séquentielle (jamais deux en parallèle), avec un espacement minimum entre chacune.
2. **Given** les connecteurs Moselle et Île-de-France, hébergés sur des IPs distinctes, **When** la collecte historique est lancée, **Then** ils sont traités par une file séparée de celle de l'hébergeur mutualisé, avec une prudence au moins équivalente (le blocage déjà observé sur `prefecture-75` impose de ne jamais les traiter avec moins de précaution que les 94 autres).
3. **Given** un nombre anormal d'échecs consécutifs de type réseau bas niveau (fermeture de socket, timeout — pas une anomalie d'extraction de contenu) sur une file, **When** ce seuil est atteint, **Then** le mécanisme interrompt automatiquement le reste de cette file plutôt que de continuer en aveugle.
4. **Given** un connecteur déjà collecté avec succès pour un mois cible donné lors d'un lancement précédent (ex. lancement interrompu puis relancé), **When** la collecte historique est relancée pour ce même mois, **Then** aucun événement n'est publié en double (réutilisation de la détection de doublon existante, `dedupe.ts`) — le mécanisme est sans danger à répéter.
5. **Given** le périmètre complet (96 connecteurs), **When** l'opérateur choisit de lancer d'abord un pilote restreint (quelques connecteurs), **Then** le mécanisme permet ce lancement partiel avant toute généralisation à l'ensemble du périmètre.
6. **Given** le cycle planifié quotidien existant (FR-013, feature 002), **When** la collecte historique est ajoutée au système, **Then** le cycle planifié continue de fonctionner exactement comme avant — la collecte historique n'est jamais déclenchée automatiquement par ce cycle, uniquement de façon explicite.

### Edge Cases

- Un connecteur désactivé (`actif: false`) au moment du lancement de la collecte historique : exclu du périmètre, comme pour toute exécution ordinaire (cohérent avec `POST /admin/connecteurs/{id}/collecter`).
- Un mois cible pour lequel la page distante n'existe pas encore (ex. mois cible = mois courant lui-même, page déjà couverte par le cycle planifié) : pas un cas d'erreur, simplement redondant avec la collecte ordinaire — la détection de doublon absorbe cette redondance sans anomalie visible pour l'utilisateur final.
- Un échec de lecture pour UN SEUL des 3 mois ciblés d'un connecteur (ex. page du mois M-2 introuvable) ne doit pas empêcher la collecte des 2 autres mois du même connecteur, ni celle des autres connecteurs de la file.
- `prefecture-13` (et tout futur connecteur sans `navigation`) : hors périmètre effectif du mécanisme, sa page unique déjà interrogée par le cycle ordinaire couvrant déjà une période supérieure à 3 mois.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le moteur `page_web` DOIT pouvoir résoudre toute étape de `navigation` existante (motif à placeholders de date, ou `periodes`) contre un mois/année cible explicite, distinct du mois courant, sans qu'aucune des 96 configurations déclaratives existantes n'ait à être modifiée.
- **FR-002**: En l'absence de mois cible explicite, le comportement DOIT rester rigoureusement identique à l'existant (résolution contre le mois courant Europe/Paris) — aucune régression du cycle planifié quotidien (FR-013, feature 002) ni du déclenchement manuel existant (FR-014, feature 002).
- **FR-003**: Une collecte ciblant un mois passé DOIT réutiliser, sans aucune modification, la même logique d'évaluation et de publication qu'une collecte ordinaire (`evaluerCandidat`, `dedupe.ts`) — en particulier la détection de doublon, qui garantit qu'une même collecte historique peut être répétée sans jamais publier un événement en double.
- **FR-004**: Le système DOIT permettre de déclencher, pour un connecteur donné, une collecte visant l'un des 2 mois calendaires précédant le mois courant (le mois courant lui-même restant couvert par le cycle planifié existant) — couvrant ainsi une fenêtre totale de 3 mois par département en combinant cycle ordinaire et collecte historique.
- **FR-005**: Le système DOIT permettre de lancer la collecte historique sur l'ensemble des connecteurs concernés de façon échelonnée dans le temps — jamais l'ensemble du périmètre en une seule rafale de requêtes.
- **FR-006**: Le système DOIT traiter l'ensemble des connecteurs hébergés derrière une même adresse IP partagée (à ce jour : 94 connecteurs derrière `77.159.252.140`) comme une seule file d'attente séquentielle — jamais deux requêtes émises en parallèle par ce mécanisme vers cette IP.
- **FR-007**: Le système DOIT respecter un espacement minimum entre deux requêtes consécutives émises vers un même hébergeur par ce mécanisme.
- **FR-008**: Le système DOIT traiter les connecteurs hébergés sur une adresse IP distincte de l'hébergeur mutualisé (à ce jour : Moselle, Île-de-France) par une file dédiée, séparée de celle de l'hébergeur mutualisé, avec un niveau de prudence au moins équivalent — le blocage déjà observé sur `prefecture-75` (Cloudflare, HTTP 403) interdit de les traiter avec moins de précaution que les 94 autres.
- **FR-009**: Le système DOIT interrompre automatiquement le traitement du reste d'une file en cours après un nombre anormal d'échecs consécutifs de nature réseau bas niveau (fermeture de socket, timeout — distinct d'une anomalie d'extraction de contenu, qui ne doit jamais déclencher cette interruption).
- **FR-010**: Le système DOIT permettre de restreindre un lancement à un sous-ensemble explicite de connecteurs (pilote), indépendamment d'un lancement portant sur l'ensemble du périmètre.
- **FR-011**: Chaque exécution de collecte historique DOIT être journalisée exactement comme une exécution ordinaire (`ExecutionCollecte`, FR-011 feature 001 : statut, nombre de publications, nombre d'anomalies), en la distinguant explicitement d'une exécution planifiée ou manuelle par une valeur de déclenchement dédiée.
- **FR-012**: Le système NE DOIT PAS déclencher automatiquement la collecte historique via le cycle planifié quotidien existant (`scheduler.ts`) — mécanisme distinct, déclenché explicitement, jamais une tâche récurrente ajoutée à ce cycle.
- **FR-013**: Un connecteur sans étape de `navigation` (à ce jour : `prefecture-13` uniquement) DOIT être ignoré par ce mécanisme — sa page déjà interrogée par le cycle ordinaire couvre déjà une période supérieure à 3 mois, sans qu'aucune action supplémentaire ne soit nécessaire.

### Key Entities

- **Connecteur** (existant) : aucune modification de schéma persistant. Son interface d'exécution (`collecter()`, `backend/src/connecteurs/types.ts`) gagne la capacité optionnelle de cibler un mois passé — extension du contrat d'exécution, pas de la donnée stockée.
- **ExecutionCollecte** (existant) : son champ `declenchement` (aujourd'hui `planifie` | `manuel`) gagne une valeur dédiée pour distinguer une exécution de collecte historique des deux valeurs existantes — aucun autre champ modifié.
- **Evenement**, **AnomalieCollecte** (existants) : aucune modification — une collecte historique produit exactement les mêmes types d'enregistrements qu'une collecte ordinaire, via le même `runner.ts`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Après exécution complète du mécanisme sur l'ensemble du périmètre, les 95 connecteurs à `navigation` portent, dans `executions.json`, au moins une exécution journalisée pour chacun des 2 mois cibles passés (en plus des exécutions du cycle planifié ordinaire) — vérifiable directement sur les données réelles.
- **SC-002**: 0 événement dupliqué constaté après la collecte historique, pour l'ensemble des départements concernés — vérifiable en comparant, pour chaque département, le nombre d'événements distincts (référence d'arrêté) au nombre d'événements réellement publiés.
- **SC-003**: Le cycle planifié quotidien continue, après mise en place de cette feature, de produire un comportement strictement identique à l'existant (mêmes URLs résolues pour une collecte sans mois cible) — 0 régression mesurable.
- **SC-004**: Aucun nouvel incident de blocage réseau de type `77.159.252.140` (comme ceux déjà documentés les 2026-08-19/20 et 2026-08-28) n'est déclenché par ce mécanisme — vérifiable par l'absence de rafale d'anomalies `echec_lecture_source` de signature réseau bas niveau corrélées dans le temps sur cette IP, dans les journaux de la collecte historique.
- **SC-005**: L'opérateur peut, sans modifier aucune des 96 configurations déclaratives existantes, lancer un pilote restreint puis le périmètre complet, en deux commandes distinctes.

## Assumptions

- Cette feature est un mécanisme opérationnel ponctuel (déclenché explicitement par un opérateur, une fois ou par lots relancés manuellement), pas une fonctionnalité visible par les visiteurs de la carte — aucune user story côté grand public ici, contrairement aux features 001/004.
- La restitution de l'historique aux utilisateurs de l'application (affichage d'un historique ou des dates du dernier arrêté par département — idées n°2 et n°3 « affichage » du backlog produit) est hors scope de cette feature : l'endpoint `GET /api/v1/departements/{code}/evenements` qui la servira existe déjà (feature 001, US4) et n'a besoin d'aucune modification ; seule l'alimentation en données historiques est traitée ici.
- Les constantes précises (délai minimum entre requêtes, nombre de connecteurs par lot, nombre de jours pour l'étalement complet, seuil exact du circuit breaker) sont laissées au chiffrage technique (plan.md) — cette spécification fixe le comportement attendu (séquentiel, échelonné, prudent, interruptible, rejouable sans danger), pas les valeurs numériques exactes.
- La correspondance connecteur → adresse IP d'hébergement (94 connecteurs derrière `77.159.252.140`, Moselle et Île-de-France séparément) est celle constatée par résolution DNS le 2026-08-29 ; elle peut évoluer dans le temps et n'a pas vocation à être vérifiée en temps réel par ce mécanisme à chaque lancement — une donnée de configuration mise à jour manuellement si l'hébergement change, cohérent avec le mode d'édition déjà manuel de `registre-sources.yaml`.
- La fenêtre de 3 mois est un scope initial délibérément réduit (le backlog produit mentionne une extension possible à 3 ans plus tard) — cette feature ne construit aucun mécanisme générique de collecte sur fenêtre paramétrable, seulement la capacité de cibler jusqu'à 2 mois passés.
