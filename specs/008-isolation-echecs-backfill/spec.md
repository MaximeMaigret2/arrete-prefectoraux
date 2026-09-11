# Feature Specification: Isolation des échecs de backfill par connecteur

**Feature Branch**: `008-isolation-echecs-backfill`
**Created**: 2026-09-11
**Status**: Draft
**Input**: Constat opérateur (session Cowork du 2026-09-11, à la suite d'une analyse comparative avec le projet Attrap de La Quadrature du Net) : la campagne réelle de backfill historique (feature 005) reste bloquée à une faible couverture (7/91 puis quelques connecteurs supplémentaires lors des tentatives de reprise du 2026-09-02) alors que 91/96 connecteurs sont fonctionnels et validés par tests. La cause identifiée n'est pas un manque de connecteurs opérationnels mais le circuit-breaker actuel de `backfill-historique.ts`, dont la portée (le groupe d'hébergement mutualisé, 94/96 connecteurs) fait qu'un incident sur un seul connecteur en début de file prive tous les connecteurs suivants du même groupe de toute tentative pour le run en cours. Objectif explicite de l'utilisateur : prioriser la largeur de couverture (le plus grand nombre de départements obtenant un résultat réel) plutôt que la résolution de cas particuliers comme `prefecture-75` (Cloudflare, hors scope ici) ou les PDF scannés (OCR, hors scope ici).

## Contexte

`backend/src/scripts/backfill-historique.ts` (feature 005) traite les connecteurs par groupe d'hébergement (mutualisé ~94, Moselle 1, Île-de-France 1), séquentiellement au sein de chaque groupe, avec un espacement minimum entre requêtes (`BACKFILL_ESPACEMENT_MS`) et un circuit-breaker unique par groupe (`BACKFILL_SEUIL_CIRCUIT`, défaut 3) qui s'ouvre après N échecs réseau bas niveau **consécutifs, tous connecteurs confondus au sein du groupe**. Une fois ouvert, plus aucun couple (connecteur, mois) du groupe n'est tenté pour le reste du run, y compris pour des connecteurs qui n'ont eux-mêmes jamais échoué. C'est ce mécanisme qui explique, d'après le journal de collecte (`etat-connecteurs.md`), que 84 des 91 connecteurs ciblés lors de la campagne du 2026-09-02 soient restés à 0 succès réel : quelques échecs (dus à l'époque à un bug de classification HTTP 503/404 depuis corrigé, mais le problème structurel de portée du circuit-breaker demeure indépendamment de ce bug) suffisent à arrêter la file bien avant que la majorité des connecteurs n'aient été tentés.

Une comparaison avec le projet Attrap (La Quadrature du Net, même domaine fonctionnel : collecte de RAA de préfectures françaises) a montré une architecture radicalement plus simple sur ce point précis : chaque département y est un job indépendant, sans aucun circuit-breaker partagé — un blocage sur l'un n'affecte jamais les autres. Cette spec adapte cette idée à notre architecture (un seul script, pas des jobs CI séparés) en changeant la **portée** du circuit-breaker : du groupe vers le connecteur.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un connecteur en échec n'empêche plus les autres d'être tentés (Priority: P1)

En tant qu'opérateur qui lance une campagne de backfill historique, je veux que l'échec d'un connecteur (échecs réseau bas niveau répétés) n'empêche jamais les autres connecteurs du même groupe d'hébergement d'être tentés dans le même run, afin que la campagne couvre le plus grand nombre de départements possible à chaque exécution, même quand un ou plusieurs connecteurs rencontrent un problème.

**Pourquoi cette priorité** : c'est directement la cause du problème constaté (couverture réelle très inférieure au nombre de connecteurs fonctionnels). Sans cette story, aucune autre amélioration de la campagne n'a d'effet tant que le premier accroc arrête tout le reste de la file.

**Test indépendant** : peut être testé isolément en simulant, dans un test d'intégration à dépendances injectées (même patron que `backfill-historique.test.ts` existant), un groupe de connecteurs où le premier échoue 3 fois consécutivement puis les suivants réussissent — et en vérifiant que ces derniers obtiennent bien un succès dans le même run.

**Acceptance Scenarios** :

1. **Given** un groupe d'hébergement contenant plusieurs connecteurs avec des mois restants à traiter, **When** le premier connecteur traité rencontre des échecs réseau consécutifs au-delà du seuil configuré, **Then** les connecteurs suivants du même groupe sont malgré tout tentés dans le même run (au moins une tentative chacun), sans être sautés à cause de l'échec du premier.
2. **Given** un connecteur qui a rencontré des échecs réseau consécutifs au-delà du seuil, **When** le run se termine, **Then** les mois restants de ce connecteur ne sont pas retirés du checkpoint (comportement de reprise existant, inchangé) et restent éligibles à une prochaine exécution.
3. **Given** un connecteur qui alterne un échec réseau puis un succès (jamais deux échecs consécutifs), **When** la campagne s'exécute, **Then** ce connecteur n'est jamais écarté ni interrompu par ce mécanisme, quel que soit le nombre total (non consécutif) d'échecs rencontrés.
4. **Given** un connecteur qui rencontre un échec de type "page introuvable" (404, archives épuisées, `causeReseau: false`), **When** cet échec survient, **Then** il ne compte pas dans le seuil d'échecs consécutifs de ce mécanisme et ne provoque jamais le passage au connecteur suivant (comportement normal de fin d'archives, inchangé par rapport à l'existant).
5. **Given** un groupe ne contenant qu'un seul connecteur (Moselle ou Île-de-France), **When** ce connecteur échoue au-delà du seuil, **Then** le comportement est inchangé par rapport à aujourd'hui (aucun autre connecteur à préserver dans ce groupe) — cas trivial, à couvrir par un test de non-régression plutôt que par un nouveau comportement.

---

### User Story 2 - Visibilité sur une dégradation généralisée, sans jamais bloquer la campagne (Priority: P2)

En tant qu'opérateur, je veux être informé si un très grand nombre de connecteurs consécutifs échouent totalement sans aucun succès interposé (signe probable d'une dégradation généralisée de l'hébergeur mutualisé plutôt que de connecteurs individuellement défaillants), afin de décider moi-même s'il est utile d'interrompre manuellement une campagne visiblement inutile — sans que le script ne prenne cette décision à ma place.

**Pourquoi cette priorité** : purement informatif, n'affecte jamais la couverture (contrairement à l'ancien circuit-breaker de groupe). Utile mais non bloquant pour la User Story 1 ; peut être livré séparément ou omis dans une première itération.

**Test indépendant** : testable isolément en simulant un run où N connecteurs consécutifs (N = seuil configurable de détection) échouent totalement sans aucun succès interposé, et en vérifiant que le rapport de fin de run porte un signal dédié, sans que le traitement des connecteurs suivants n'ait été interrompu.

**Acceptance Scenarios** :

1. **Given** un nombre configurable de connecteurs consécutifs qui échouent chacun entièrement (aucun mois traité avec succès) sans aucun succès interposé, **When** ce seuil est atteint, **Then** le rapport de fin de run signale cette situation explicitement (ex. `degradationGeneraliseeDetectee: true` ou équivalent), à titre uniquement informatif.
2. **Given** ce signal déclenché, **When** le run se poursuit, **Then** les connecteurs restants sont malgré tout tentés normalement — ce signal ne modifie jamais le comportement du script, seulement son rapport.

### Edge Cases

- Un connecteur qui n'a plus qu'un seul mois restant à traiter (proche de la fin de son historique) et qui échoue une fois : le seuil s'applique en nombre d'échecs consécutifs, jamais en proportion des mois restants — il ne doit pas être pénalisé différemment d'un connecteur ayant 36 mois restants.
- Reprise après un run où plusieurs connecteurs ont été interrompus par ce mécanisme : un nouveau lancement du script doit retenter exactement les mois non résolus de chacun, sans duplication ni perte — déjà garanti par le mécanisme de checkpoint existant (feature 005 US3), à couvrir par un test de non-régression plutôt que réimplémenté.
- Un connecteur interrompu par ce mécanisme puis, lors d'une prochaine tentative de reprise, à nouveau interrompu : ne doit produire aucun état incohérent dans le checkpoint (toujours restauration additive, jamais de perte, cohérent avec le comportement déjà testé de `reactiver-mois-checkpoint.ts`).
- Un run où *tous* les connecteurs d'un groupe échouent (dégradation totale et confirmée de l'hébergeur) : le script doit tout de même se terminer proprement (pas de boucle infinie, pas de crash), avec un rapport clair indiquant 0 succès pour ce groupe — comportement à vérifier explicitement par un test dédié.
- Le mois `incertain` (feature 007, candidat non résolu) reste distinct de ce mécanisme : un mois marqué `incertain` ne doit toujours ni être retiré du checkpoint ni compter pour quelque seuil que ce soit (règle déjà en vigueur, à ne pas régresser).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** : Le système DOIT tenter chaque connecteur d'un groupe d'hébergement indépendamment des autres — l'échec (de quelque nature que ce soit) d'un connecteur ne DOIT jamais empêcher la tentative des connecteurs suivants du même groupe dans le même run.
- **FR-002** : Le système DOIT limiter, pour un même connecteur, le nombre de tentatives consécutives d'échec réseau bas niveau (`causeReseau: true`) avant de passer au connecteur suivant — seuil configurable par variable d'environnement dédiée (`BACKFILL_SEUIL_CONNECTEUR`, défaut 3), en remplacement de l'usage actuel de `BACKFILL_SEUIL_CIRCUIT` à l'échelle du groupe pour cette décision d'arrêt.
- **FR-003** : Quand un connecteur atteint ce seuil pour le run en cours, ses mois restants NE DOIVENT PAS être retirés du checkpoint — ils restent éligibles à une prochaine exécution du script (comportement de reprise inchangé, feature 005 US3).
- **FR-004** : Un échec de type "page introuvable" (`causeReseau: false`, ex. HTTP 404 / archives épuisées) NE DOIT JAMAIS compter dans le seuil défini par FR-002, et NE DOIT PAS déclencher ce mécanisme d'arrêt par connecteur — comportement inchangé par rapport à l'existant (feature 005) : le connecteur s'arrête pour cause d'archives épuisées, pas pour cause d'échecs réseau consécutifs.
- **FR-005** : Le compteur d'échecs consécutifs DOIT être propre à chaque connecteur (jamais partagé entre deux connecteurs différents) et DOIT être réinitialisé dès qu'un succès survient pour le connecteur courant.
- **FR-006** : Le rapport de fin de run DOIT indiquer, pour chaque connecteur interrompu par ce mécanisme au cours du run, le nombre de mois qu'il n'a pas pu tenter et la raison (échecs réseau consécutifs au-delà du seuil) — au moins au même niveau de détail que ce qu'offre aujourd'hui le circuit-breaker de groupe.
- **FR-007** *(User Story 2, P2)* : Le système DEVRAIT détecter, à titre uniquement informatif et jamais bloquant, un nombre configurable de connecteurs consécutifs entièrement en échec sans aucun succès interposé, et le signaler dans le rapport de fin de run — sans jamais interrompre le traitement des connecteurs suivants sur la base de ce signal.
- **FR-008** : L'espacement minimum actuel entre requêtes (`BACKFILL_ESPACEMENT_MS`) DOIT rester appliqué à l'identique — ce changement ne modifie que la décision d'arrêt/poursuite par connecteur, jamais la politesse réseau déjà en place entre chaque requête.
- **FR-009** : Le traitement séquentiel par groupe d'hébergement (mutualisé / Moselle / Île-de-France, dans cet ordre) DOIT rester inchangé dans son principe — seule la portée de la décision d'arrêt change (du groupe vers le connecteur), pas l'existence ni l'ordre des groupes.
- **FR-010** : Le mode audit (`--audit`) et le mode pilote (sous-ensemble explicite de connecteurs) DOIVENT continuer à fonctionner à l'identique après ce changement.

### Key Entities

- **RapportGroupe** (existant, `backfill-historique.ts`) : étendu pour porter, en plus des compteurs déjà présents (dont `moisNonResolus`), le détail par connecteur des interruptions dues à ce nouveau mécanisme (`connecteursInterrompus: { connecteurId, moisRestants, raison }[]`) et, pour User Story 2, le signal de dégradation généralisée (`degradationGeneraliseeDetectee`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : Dans un run simulé (test d'intégration, dépendances injectées, réseau mocké) où un connecteur en tête de groupe échoue au-delà du seuil, 100% des connecteurs sains suivants du même groupe obtiennent au moins une tentative dans le même run (contre 0% aujourd'hui une fois le circuit de groupe ouvert).
- **SC-002** : Sur une campagne réelle ultérieure contre les 96 vrais connecteurs, le nombre de connecteurs ayant obtenu au moins un succès réel lors d'un même run dépasse significativement les 7/91 observés lors de la campagne du 2026-09-02 — mesure qualitative à confirmer par l'opérateur lors de la prochaine campagne réelle, hors périmètre des tests automatisés de cette feature.
- **SC-003** : Aucune régression sur les mécanismes déjà couverts par les tests existants des features 005 et 007 (reprise par checkpoint, distinction 404/réseau, statut `incertain`, mode pilote, mode audit) — suite de tests existante intégralement verte après implémentation.
- **SC-004** : Le rapport de fin de run permet à l'opérateur d'identifier sans ambiguïté, pour chaque connecteur interrompu par ce mécanisme, combien de mois restent en attente pour une prochaine reprise.

## Assumptions

- Le mécanisme de checkpoint sur disque (feature 005 US3) et la distinction `causeReseau`/404 (feature 005/007) restent inchangés et sont réutilisés tels quels — cette feature ne touche que la logique d'arrêt/poursuite dans `backfill-historique.ts`, pas le moteur `page_web` ni les modèles `ExecutionCollecte`/`AnomalieCollecte`.
- Le seuil par connecteur (FR-002, `BACKFILL_SEUIL_CONNECTEUR`) est fixé à 3 par défaut : la valeur de 6 retenue le 2026-09-03 pour l'ancien seuil de groupe compensait le fait que les échecs de plusieurs connecteurs différents s'accumulaient dans un seul compteur partagé — une fois le compteur ramené à l'échelle d'un seul connecteur, ce raisonnement ne s'applique plus et la valeur d'origine (3) redevient le compromis pertinent entre absorber un blip transitoire et ne pas marteler un hôte en difficulté.
- User Story 2 (signal de dégradation généralisée) est un enrichissement optionnel du rapport, sans dépendance technique bloquante vis-à-vis de User Story 1 — livrée dans le même lot ici, mais son seuil (variable d'environnement dédiée) est indépendant de celui de US1.
- `prefecture-75` (Cloudflare) et l'OCR des PDF scannés (ex. Moselle) restent explicitement hors scope de cette feature, quel que soit leur impact sur la couverture — traités comme des chantiers séparés, par décision explicite de l'utilisateur (priorité à la largeur de couverture sur les correctifs de cas particuliers).
- Aucun parallélisme réel entre connecteurs n'est introduit par cette feature — le traitement reste séquentiel au sein de chaque groupe (round-robin mois par mois, feature 005), seule la règle d'arrêt change. Un chantier de parallélisme réel serait une feature distincte et plus risquée (cf. l'incident `fileParallelism` du 2026-08-28 documenté dans `etat-connecteurs.md`, qui a montré les effets de bord d'une concurrence non maîtrisée contre ce même hébergeur mutualisé).
