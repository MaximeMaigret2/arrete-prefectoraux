# Implementation Plan: Isolation des échecs de backfill par connecteur

**Branch**: `008-isolation-echecs-backfill` | **Date**: 2026-09-11 | **Spec**: `specs/008-isolation-echecs-backfill/spec.md`

**Input**: Feature specification from `specs/008-isolation-echecs-backfill/spec.md`

## Summary

Une seule story P1 porte tout le correctif : dans `backend/src/scripts/backfill-historique.ts`, le compteur d'échecs réseau consécutifs (`echecsReseauConsecutifs`) passe de la portée « groupe d'hébergement » (une seule variable partagée par tous les connecteurs de la file round-robin) à la portée « connecteur » (un compteur par `FileConnecteur`). Quand un connecteur atteint son propre seuil, seul CE connecteur est retiré du round-robin en cours (ses mois restants ne sont jamais retirés du checkpoint) — la boucle du groupe ne s'arrête plus jamais (`break tourBoucle` disparaît de ce chemin). `RapportGroupe.circuitOuvert` (bit unique, désormais sans objet) est remplacé par `connecteursInterrompus` (détail par connecteur, FR-006). User Story 2 (P2, signal informatif de dégradation généralisée) est livrée dans le même lot : un compteur de connecteurs consécutifs totalement en échec (aucun succès dans le run) déclenche `degradationGeneraliseeDetectee: true` sur le rapport du groupe, sans jamais interrompre le traitement.

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20, ES modules) — identique à l'existant.

**Primary Dependencies**: Aucune nouvelle dépendance de production (Principe 5) — un changement de portée d'un compteur déjà en place, plus deux nouveaux champs de rapport (tableau + booléen).

**Storage**: Aucun changement de `backfill-checkpoint.json` (feature 005, hors modèle applicatif) ni de son schéma (`EtatConnecteurCheckpoint`, `VERSION_CHECKPOINT` inchangée) — cette feature ne touche que la logique de décision d'arrêt/poursuite en mémoire durant un run, jamais ce qui est lu ou écrit sur disque. Aucun nouveau fichier de données applicatif, aucune nouvelle route API.

**Testing**: Vitest côté backend. Réécriture ciblée de `backend/tests/integration/connecteurs/backfill-historique.test.ts` : les tests existants qui exercent l'ancien circuit-breaker de groupe (`circuitOuvert`, seuil partagé entre connecteurs) sont réécrits pour la nouvelle portée par connecteur ; nouveaux tests pour FR-001 (connecteurs suivants tentés malgré l'échec du premier), FR-006 (détail `connecteursInterrompus`), et US2/FR-007 (`degradationGeneraliseeDetectee`). Aucun test contre les sites réels dans la suite automatisée (convention déjà établie).

**Target Platform**: Backend Node.js existant — script CLI opérateur (`backfill:audit`, `backfill:historique`), jamais appelé par le cycle planifié.

**Project Type**: Web application (`backend/` + `frontend/`), déjà en place. Cette feature ne touche QUE `backend/src/scripts/backfill-historique.ts` et son test associé — aucune donnée ni route nouvelle exposée au frontend (la carte continue de résoudre l'état d'un département uniquement depuis `events/<code>.json`, non affecté par cette feature).

**Performance Goals**: Sans objectif de performance propre — le coût par requête est inchangé (même espacement `BACKFILL_ESPACEMENT_MS`, FR-008) ; seule la décision d'arrêt/poursuite change, pas le nombre ni le rythme des requêtes tentées avec succès.

**Constraints**: Ne jamais retirer du checkpoint les mois d'un connecteur interrompu par ce mécanisme (FR-003) ; ne jamais faire compter une page introuvable (`causeReseau: false`) ni un mois `incertain` (candidat non résolu, feature 007) dans le seuil par connecteur (FR-004, non-régression) ; ne jamais interrompre le traitement des connecteurs suivants sur la base du signal de dégradation généralisée (FR-007) ; conserver à l'identique le traitement séquentiel par groupe d'hébergement et son ordre (FR-009), le mode `--audit` et le mode pilote (FR-010).

**Scale/Scope**: 96 connecteurs réels, dont 94 partagent le groupe `mutualise` — c'est ce groupe qui bénéficie de l'essentiel du changement (Moselle et Île-de-France restent des groupes à un seul connecteur, cas trivial d'après l'edge case 5 du spec).

## Constitution Check

*GATE: doit passer avant toute implémentation.*

- **Principe 5 (pas de dépendance externe superflue)** : respecté — aucune nouvelle bibliothèque ; changement de portée d'une variable existante, deux nouveaux champs de rapport.
- **Principe 1/Principe 2 (traçabilité, historisation append-only)** : renforcé — `connecteursInterrompus` rend visible, par connecteur, une information qui n'existait avant qu'à l'échelle binaire du groupe (`circuitOuvert`).
- **Contrat connecteur (`connecteur-interface.md`)** : non concerné — cette feature ne touche à aucun moteur de connecteur ni à `ResultatCollecte`, uniquement à l'orchestration du backfill qui consomme leurs résultats.
- **Point d'attention (revue de cette feature)** : `RapportGroupe.circuitOuvert` (champ public, exporté depuis feature 005, lu uniquement par la suite de tests interne à ce jour — vérifié par recherche dans `backend/src` et `backend/tests`, aucun autre consommateur) est retiré plutôt que conservé en parallèle de `connecteursInterrompus`, pour éviter un champ devenu structurellement toujours `false` (le groupe ne "s'ouvre" plus jamais) qui laisserait croire à tort qu'un circuit-breaker de groupe existe encore. Entrée en Complexity Tracking (changement de forme d'un champ de rapport déjà exporté).
- Aucune violation bloquante.

## Project Structure

### Documentation (this feature)

```text
specs/008-isolation-echecs-backfill/
├── spec.md                  # Spécification (committée, 4f65efd)
├── plan.md                  # Ce fichier
├── tasks.md                 # Détail des tâches (/speckit-tasks)
└── checklists/
    └── requirements.md      # Checklist qualité (committée avec spec.md)
```

Pas de `research.md`/`data-model.md` dédiés : mêmes raisons que les features 005/007 — la seule inconnue technique (où et comment le compteur est actuellement partagé) a été levée par lecture complète de `backfill-historique.ts` et de son test avant d'écrire ce plan ; aucune nouvelle entité de données.

### Source Code (repository root)

```text
backend/
├── src/
│   └── scripts/
│       └── backfill-historique.ts   # Coeur du changement : voir détail ci-dessous
└── tests/
    └── integration/connecteurs/
        └── backfill-historique.test.ts   # Réécriture des tests (b), (b bis) ; nouveaux tests US1/US2
```

**Détail des changements dans `backfill-historique.ts`** :

- `SEUIL_CIRCUIT_BREAKER_DEFAUT` / `BACKFILL_SEUIL_CIRCUIT` → renommés `SEUIL_ECHECS_CONNECTEUR_DEFAUT` / `BACKFILL_SEUIL_CONNECTEUR`, défaut `3` (FR-002, Assumptions du spec).
- Nouvelle constante `SEUIL_DEGRADATION_GENERALISEE_DEFAUT` (env `BACKFILL_SEUIL_DEGRADATION`, défaut `8`) pour US2/FR-007.
- `OptionsBackfill.seuilCircuitBreaker` → renommé `seuilEchecsConnecteur` ; nouveau champ optionnel `seuilDegradationGeneralisee`.
- `FileConnecteur` (interface locale) gagne deux champs : `echecsConsecutifs: number` (init `0`) et `aEuUnSucces: boolean` (init `false`).
- La variable `echecsReseauConsecutifs` (une par groupe) est supprimée ; le compteur d'échec réseau vit désormais sur `file.echecsConsecutifs`, incrémenté/réinitialisé exactement comme avant mais par connecteur.
- Quand `file.echecsConsecutifs` atteint le seuil : plus de `break tourBoucle` — à la place, ajout d'une entrée à `rapportGroupe.connecteursInterrompus` (FR-006) et `file.cibles = []` (le connecteur sort du round-robin au prochain nettoyage de tour, exactement comme le fait déjà `archivesEpuisees` aujourd'hui) ; le `for` sur `filesActives` continue vers le connecteur suivant du même tour (`continue`, jamais `break`) — c'est le coeur de FR-001.
- `RapportGroupe.circuitOuvert` supprimé ; nouveaux champs `connecteursInterrompus: ConnecteurInterrompu[]` et `degradationGeneraliseeDetectee: boolean` (nouveau type exporté `ConnecteurInterrompu { connecteurId: string; moisRestants: number; raison: 'echecs_reseau_consecutifs' }`).
- Comptage US2 : au moment où un connecteur quitte `filesActives` (nettoyage de fin de tour, pour n'importe quelle raison — file épuisée normalement, archives épuisées, ou interrompu par le nouveau mécanisme), si `file.aEuUnSucces` est resté `false`, incrémente un compteur local `connecteursEchecTotalConsecutifs` ; sinon le réinitialise à `0`. Dès que ce compteur atteint `seuilDegradationGeneralisee`, `rapportGroupe.degradationGeneraliseeDetectee = true` (jamais réinitialisé une fois `true` pour ce groupe — signal informatif, pas un état oscillant).
- Aucun changement à la branche `incertain` (candidat non résolu, feature 007) : elle continue à ne toucher ni `file.echecsConsecutifs` ni `file.aEuUnSucces` (FR-004/US2 — un mois incertain n'est ni un échec réseau, ni un succès, cohérent avec le fait qu'il ne doit jamais être compté dans aucun seuil).
- Branche succès : `file.echecsConsecutifs = 0` (comme avant, portée simplement changée) et `file.aEuUnSucces = true` (nouveau, pour US2).

**Structure Decision** : Un seul fichier de production modifié (déjà identifié comme le point d'entrée unique de cette logique par la spec elle-même) — aucun nouveau module, aucune nouvelle route, cohérent avec le périmètre volontairement resserré de cette feature (spec.md, Assumptions : « cette feature ne touche que la logique d'arrêt/poursuite »).

## Complexity Tracking

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée |
|---|---|---|
| `RapportGroupe.circuitOuvert` (champ public exporté depuis feature 005) est retiré plutôt que déprécié en place | FR-006 exige un détail par connecteur, pas un bit de groupe ; garder les deux aurait laissé un champ `circuitOuvert` structurellement toujours `false` (plus aucun mécanisme ne "ferme" tout un groupe), ce qui induirait en erreur tout futur lecteur du rapport plutôt que de documenter honnêtement le nouveau comportement | Garder `circuitOuvert` à `false` en permanence et ajouter `connecteursInterrompus` à côté : rejeté — un champ mort dans une interface publique est plus trompeur qu'un renommage propre, et seule la suite de tests interne au fichier le consomme aujourd'hui (vérifié, aucune rupture pour un consommateur externe) |
