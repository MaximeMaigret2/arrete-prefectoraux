# Lot Qualité — Durcissement (pré-chantier 57/Moselle)

**Statut** : proposé, non démarré
**Rattachement** : session de suivi, hors périmètre connecteurs ordinaire (95/96 déjà livrés)
**Dépend de** : rien (peut démarrer immédiatement)
**Bloque** : le chantier 57/Moselle (cookies) — prérequis obligatoire, pas seulement recommandé : ce lot doit être terminé (au minimum Q-001 à Q-003, le filet de sécurité) avant de démarrer le chantier 57, qui touchera le moteur `page_web` partagé par les 95 connecteurs déjà déployés

## Contexte

Après 19 lots de connecteurs (95/96 départements du périmètre), le journal `etat-connecteurs.md` documente plusieurs points de dette technique récurrents, chacun rencontré ou contourné à plusieurs reprises sans jamais être traité à la racine. C'est le moment naturel pour s'en occuper : plus aucun lot ordinaire en attente, et le chantier 57/Moselle (extension moteur pour les cookies) sera plus sûr à mener sur une base assainie.

## Objectif

Réduire la duplication de tests, blinder les points de fragilité déjà documentés comme récurrents, et automatiser des vérifications aujourd'hui faites à la main à chaque lot — sans toucher au périmètre fonctionnel ni au comportement produit.

## Hors scope

- 57 (Moselle) — chantier dédié séparé, non traité ici
- Toute nouvelle fonctionnalité produit (ex. la piste "résilience aux blocages IP / date de dernière mise à jour par préfecture" reste une idée à creuser séparément)
- Modification du moteur `page_web` au-delà du point Q-001 ci-dessous
- Refonte du modèle de données ou de l'API

## Principe d'ordonnancement

Les items de sécurité (Q-001 à Q-003) passent en premier : ils posent un filet qui doit détecter toute régression introduite par les refactors de duplication qui suivent (Q-004 à Q-006). Le housekeeping (Q-007, Q-008) peut se faire n'importe quand, y compris en parallèle.

## Q-001 — Faire échouer bruyamment le piège `page_detail` au niveau moteur

**Priorité** : P0

**Constat** : `selecteur_publications` pointant sur un conteneur (ex. `.fr-card`) au lieu de l'élément portant `href`/`value` produit un échec silencieux (`candidats: []`, aucune erreur). Rencontré et corrigé après-coup sur 58, 60, 70, 71, 81 — cinq fois le même piège malgré la documentation de la règle.

**Action** : dans `resoudreUrlPdfPublication()` (`moteurs/pageWeb/moteur.ts`), quand `page_detail` est actif et que l'attribut lu est `undefined` sur tous les éléments matchés par `selecteur_publications`, lever une erreur explicite plutôt que retourner une liste vide.

**Critère de fait** : un test unitaire dédié reproduit le cas (fixture avec `.fr-card` comme `selecteur_publications` + `page_detail`) et vérifie que l'erreur est levée avec un message actionnable. Les 95 connecteurs réels existants continuent de passer sans modification (aucun n'est dans ce cas puisqu'ils ont déjà été corrigés).

**Risque** : faible — changement additif (nouveau cas d'erreur), ne modifie aucun chemin déjà valide.

## Q-002 — Automatiser la cohérence `registre-sources.yaml` ↔ `connecteurs.json`

**Priorité** : P0

**Constat** : à chaque lot, un script Python `yaml.safe_load` ad hoc revérifie manuellement "pas de manquant ni de doublon" entre les deux fichiers. Jamais formalisé en test permanent.

**Action** : ajouter un test dans `registreSourcesSchema.test.ts` (ou nouveau fichier `coherenceRegistre.test.ts`) qui charge les deux fichiers et vérifie : (a) tout code `connecteur_developpe` dans `registre-sources.yaml` a une entrée `actif: true` correspondante dans `connecteurs.json`, et inversement ; (b) aucun doublon de code département dans les deux fichiers ; (c) le total correspond à 96.

**Critère de fait** : test vert sur l'état actuel du dépôt ; le script Python ad hoc peut être retiré du rituel de fin de lot.

**Risque** : nul — test en lecture seule, aucun changement de comportement runtime.

## Q-003 — Verrouiller par des tests deux comportements découverts "par chance"

**Priorité** : P1

**Constat** : l'insensibilité à la casse du matching de `{mois_fr}` (flag `'i'`) a sauvé la config 93 (mois en majuscules sans accent) sans avoir jamais été testée intentionnellement. Le motif d'élision `d(e)?` (69, 82) n'a pas de test de régression dédié.

**Action** : ajouter deux tests unitaires ciblés sur le moteur de résolution de pattern : un cas mois en majuscules/minuscules mixtes, un cas élision d/de sur un mois à voyelle initiale et un mois à consonne initiale.

**Critère de fait** : 2 nouveaux tests verts ; un futur refactor du moteur de pattern casserait ces tests avant de casser un connecteur en production.

**Risque** : nul.

## Q-004 — Suite d'intégration data-driven (remplace ~95 fichiers quasi-identiques)

**Priorité** : P1

**Constat** : chaque lot a créé un `reel-prefecture-XX.test.ts` par département, même gabarit à chaque fois (résolution navigation/liste + extraction de pertinence). ~95 fichiers pour ~8-10 familles structurelles réelles. Conséquence directe : le test "43 connecteurs réels" de `configsSchema.test.ts` est resté figé depuis le lot 47-51, jamais étendu — trou de couverture silencieux documenté mais jamais corrigé.

**Action** : écrire une suite unique qui itère sur `configs/*.yaml` + son dossier de fixtures associé (`backend/tests/fixtures/connecteurs/reel/prefecture-*/`), applique les mêmes 2 assertions génériquement. Garder les fichiers actuels en `_archive/` (ou les supprimer après un run de non-régression comparatif) plutôt que les éditer un par un.

**Critère de fait** : la suite data-driven couvre les 95 connecteurs (compte vérifié par assertion `toHaveLength(95)` ou équivalent) ; suite `tests/unit` toujours à un total cohérent après suppression des doublons ; `tsc --noEmit` propre.

**Risque** : moyen — c'est le refactor le plus large du lot. À faire après Q-001/Q-002/Q-003 pour bénéficier du filet de sécurité pendant la manipulation. Prévoir un commit intermédiaire pour pouvoir revenir en arrière facilement.

## Q-005 — Retirer le test figé "43 connecteurs réels"

**Priorité** : P1 (sous-produit direct de Q-004)

**Constat** : ce test dans `configsSchema.test.ts` vérifie un sous-ensemble volontairement partiel (37-41) depuis le lot 47-51, documenté comme "non bloquant" à chaque lot depuis — c'est du bruit de maintenance qui aurait dû soit être étendu, soit supprimé il y a longtemps.

**Action** : une fois Q-004 en place (couverture générique de tous les connecteurs réels), supprimer ce test spécifique devenu redondant.

**Critère de fait** : suite verte sans lui ; plus aucune mention de liste figée à maintenir dans `configsSchema.test.ts`.

**Risque** : nul si Q-004 est fait avant.

## Q-006 — `ajoutConnecteur.test.ts` : ne plus écrire dans les vrais fichiers de données

**Priorité** : P1

**Constat** : ce test écrit dans `events/57.json`/`anomalies.json`/`executions.json` réels et restaure en `afterEach` — mécanisme déjà auto-contaminé une fois (kill mi-test par le plafond `device_bash`, `afterEach` jamais exécuté, pollution auto-perpétuante détectée et corrigée manuellement le 2026-08-21/22).

**Action** : faire pointer ce test vers un répertoire temporaire (injection du chemin de données via config de test, ou répertoire dédié `tests/tmp/`) plutôt que les fichiers de production. Si la convention documentée ("pas de répertoire temporaire possible sur ce point de montage") tient toujours, envisager un mock du module de lecture/écriture plutôt que le filesystem réel.

**Critère de fait** : un kill forcé du process en cours de test ne laisse plus aucune trace dans `events/57.json`/`anomalies.json`/`executions.json` réels (vérifié en tuant volontairement le process mi-run). Le rôle de "département témoin gris" (57) reste inchangé pour les autres tests (`departement-history.test.ts`, `departements.test.ts`).

**Risque** : moyen si la contrainte de montage empêche vraiment un répertoire temporaire — dans ce cas, le mock est le repli, un peu plus de travail.

## Q-007 — Durcir `httpClient.ts`

**Priorité** : P2

**Constat** : `EN_TETES_HTTP_DEFAUT` n'a ni timeout ni retry/backoff (explicitement repoussé en 2026-08-19/20) ; le `User-Agent` n'a pas d'URL de contact (noté "à enrichir plus tard").

**Action** : ajouter un timeout raisonnable (`AbortSignal.timeout(...)`) sur les `fetch()` du module, un retry simple avec backoff exponentiel sur erreurs réseau transitoires (type `SocketError` déjà observé sur 01/03/12), et une URL de contact dans le `User-Agent`.

**Critère de fait** : tests unitaires `moteurPageWeb.test.ts`/`moteurPdf.test.ts`/`moteurRss.test.ts` toujours verts (mocks `fetch` à adapter si le retry change le nombre d'appels) ; nouveau test couvrant le retry sur un mock qui échoue puis réussit.

**Risque** : faible à moyen — touche un module partagé par les 3 moteurs, donc bien re-tester les 95 connecteurs après (échantillon suffit, comme d'habitude).

## Q-008 — Housekeeping dépôt

**Priorité** : P2 (peut se faire en parallèle de tout le reste, indépendant)

**Constat** : ~20 fichiers modifiés/non trackés jamais committés depuis plusieurs sessions ; débris `_incoming/lot*.tar.gz`, `_to_delete/*`, `vitest.config.ts.timestamp-*.mjs` non supprimables via le pont `device_bash`.

**Action** : committer l'état actuel du working tree (95/96 connecteurs) avant de commencer les refactors ci-dessus — sert aussi de point de retour en arrière propre. Supprimer manuellement les débris. Ajouter les patterns de débris (`_incoming/`, `_to_delete/`, `vitest.config.ts.timestamp-*.mjs`) au `.gitignore` pour éviter la récidive.

**Critère de fait** : `git status` propre après commit ; `.gitignore` empêche la réapparition des mêmes fichiers de transfert dans les prochains lots.

**Risque** : nul.

## Stretch (proposé en lot séparé, pas dans celui-ci)

**Q-009 — Templates de famille pour réduire la duplication des 95 YAML**

Regrouper les configs par famille structurelle (`.fr-card` direct, `page_detail`, `div[class='']`, `p:has`, `select`, SPIP, zéro-niveau, `periodes`...) derrière un template avec overrides par département. Volontairement exclu de ce lot : touche les 95 fichiers de config en production, risque plus élevé que tout le reste combiné, mérite son propre lot avec sa propre validation live comme les lots de connecteurs.

## Définition de "lot terminé"

- `npx tsc -p tsconfig.json --noEmit` : 0 erreur
- Suite `tests/unit` complète verte (nouveau total à documenter, actuellement 113 + les ajouts Q-001/Q-003)
- Suite d'intégration : soit exhaustive si Q-004 est fait (data-driven, tient dans la fenêtre `device_bash` puisqu'un seul fichier), soit échantillon représentatif sinon
- Aucune régression sur les 95 connecteurs déjà déployés (même échantillon de non-régression que les lots précédents : 77, 01, 59, 66, `runner.test.ts`, `ajoutConnecteur.test.ts`, `registreSources.test.ts`, `configsSchema.test.ts`)
- `git status` propre, commit fait
- Mise à jour de `etat-connecteurs.md` avec le bilan du lot, dans le même format que les lots précédents
