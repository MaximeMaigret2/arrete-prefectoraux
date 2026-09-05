# Feature Specification: Un échec de téléchargement PDF ne doit plus jamais ressembler à « rien à signaler »

**Feature Branch**: `007-fiabilisation-echec-telechargement-pdf`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description : suite à la découverte, le 2026-09-05, d'un arrêté préfectoral réel du Morbihan (interdiction rave-party du 3 au 28 septembre 2026, signé le 26/08/2026) totalement absent de nos données malgré une collecte annuelle « réussie » sur ce connecteur le jour même, l'utilisateur a demandé de spécifier comment faire en sorte qu'un échec de téléchargement PDF ne soit plus compté comme un succès silencieux — en soulignant explicitement que cela peut remettre en cause tout l'historique déjà collecté (« potentiellement tout notre historique est à reprendre »).

## Contexte

### Le bug tel qu'observé en conditions réelles (2026-09-05)

Lors d'une campagne de backfill priorisant les connecteurs à liste annuelle (cf. `claude/2026-09-05-backfill-priorite-annuelle.md`), `prefecture-56` (Morbihan) a produit deux exécutions `statut: 'succes'` (`nombre_evenements_publies: 0`), chacune retirant du checkpoint la totalité d'une année (2026 puis 2025, granularité annuelle). L'utilisateur a ensuite signalé l'existence d'un arrêté réel (`https://www.morbihan.gouv.fr/Actualites/Actus/Septembre-2026-Interdiction-des-rassemblements-de-type-rave-party`, signé le 26/08/2026, interdiction du 3 au 28 septembre 2026) totalement absent de nos données.

Investigation menée le jour même :

1. Le Morbihan ne publie pas un PDF par arrêté : le Recueil des Actes Administratifs (`https://www.morbihan.gouv.fr/RAA/Annee-2026`) liste des **bulletins compilés** au titre purement administratif (ex. `56-2026-103 - RAA spécial du 28 août 2026`), qui ne mentionnent jamais « rave » — seul le contenu du PDF joint peut révéler la pertinence.
2. Le moteur `page_web` (`backend/src/connecteurs/moteurs/pageWeb/moteur.ts`) est déjà conçu pour ce cas : il télécharge systématiquement le PDF joint à chaque candidat et réévalue la pertinence sur son texte réel si le titre seul ne suffit pas (commentaire du code, ligne ~505 : *« Le PDF joint est tenté dès qu'il existe, pas seulement quand le titre est déjà pertinent : sur un bulletin RAA compilé [...], le titre de la publication ne reflète jamais le contenu — seule une lecture du texte du PDF peut révéler la pertinence. »*).
3. Le téléchargement de ce PDF a échoué (`HTTP 503`) — reproduit en direct le 2026-09-05 sur les 4 bulletins RAA les plus récents du Morbihan, dont celui du 28 août, et cohérent avec deux anomalies `echec_lecture_source` déjà journalisées ce jour-là pour `prefecture-56` sur la page racine du RAA (mêmes symptômes que l'ensemble des connecteurs de l'hébergeur mutualisé, documentés de façon extensive dans `claude/etat-connecteurs.md` depuis fin août).
4. **Le code documente lui-même la limite, sans la traiter** (`moteur.ts`, commentaire juste avant `if (!pertinent) continue;`) : *« Si le titre seul n'était pas pertinent, ce candidat est perdu (échec isolé, pas de remontée en anomalie possible sans texte à examiner). »* — le candidat disparaît sans laisser aucune trace (pas d'anomalie, pas de mention dans `ResultatCollecte`), et l'exécution se termine avec `0 publiée, 0 anomalie`, indiscernable d'un mois où il n'y avait réellement rien de nouveau (`runner.ts`, `determinerStatut`, commentaire : *« succes sinon — y compris quand la collecte n'a rien publié ni signalé »*).

### Portée du problème — pas un cas isolé du Morbihan

- **96/96 connecteurs réels** déclarent `selecteur_lien_pdf` (vérifié sur `backend/src/connecteurs/configs/*.yaml`) — chacun télécharge donc un PDF par candidat et est structurellement exposé à ce même angle mort, pas seulement les connecteurs à bulletins compilés comme le Morbihan (pour un connecteur à titres descriptifs, le risque est moindre en pratique — le titre seul suffit souvent à révéler la pertinence avant même d'avoir besoin du PDF — mais reste possible dès qu'un titre ambigu dépend du contenu du PDF pour être tranché).
- **18/96 connecteurs** utilisent en plus `page_detail` (une requête HTTP intermédiaire avant même d'atteindre le PDF) : le même patron de silence existe une étape plus tôt — `resoudreUrlPdfPublication` lève une exception si la page de détail est inaccessible, et l'appelant l'avale dans un `catch { urlPdf = null; }` sans laisser de trace non plus.
- L'historique du projet documente une instabilité réseau majeure et récurrente de l'hébergeur mutualisé (`77.159.252.140`, ~94 connecteurs) depuis fin août, avec des rafales de `HTTP 503` observées à de multiples reprises, y compris lors de chacune des trois campagnes de backfill du 2026-09-05 elles-mêmes. **Chaque exécution `succes` à `0 évènement` enregistrée depuis le début du projet est donc a priori suspecte** : rien ne permet aujourd'hui de distinguer, après coup, un mois réellement vide d'un mois où un candidat a été perdu par un échec de téléchargement transitoire.
- **Amplification par le backfill** (`backend/src/scripts/backfill-historique.ts`) : toute exécution dont le statut n'est pas `'echec'` retire son mois cible du checkpoint (`moisRestants`) — et pour un connecteur `granularite_liste: 'annuelle'`, un seul succès retire d'un coup TOUS les mois restants de l'année entière (`anneesCouvertes`). Un faux succès sur ce type de connecteur ne coûte donc pas un mois de couverture perdue, mais une année entière qui ne sera plus jamais retentée automatiquement.

### Ce qui n'est PAS en cause

Ni le stockage (`events/<code>.json`, append-only), ni la détection de doublon (`dedupe.ts`), ni la logique de décision `champ_manquant`/`date_ambigue`/`doublon_potentiel` du runner ne sont concernés — le problème se situe exclusivement en amont, au moment où le moteur décide qu'un candidat n'est « pas pertinent » alors que cette décision n'a en réalité jamais pu être vérifiée.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un échec de téléchargement (PDF ou page de détail) laisse une trace exploitable (Priority: P1)

En tant que système de collecte, quand je ne parviens pas à télécharger le PDF joint à un candidat (ou, pour un connecteur `page_detail`, sa page de détail intermédiaire), je dois produire un signal explicite et consultable — jamais laisser ce candidat disparaître silencieusement comme s'il n'avait jamais existé ou comme s'il avait été examiné et jugé non pertinent.

**Why this priority** : c'est la cause racine du bug découvert le 2026-09-05 — sans ce signal, aucune des autres user stories n'a de matière à travailler.

**Independent Test** : sur un connecteur de test dont le candidat a un titre non pertinent mais un PDF fourni via un serveur simulé qui renvoie une erreur réseau (ou un `page_detail` qui renvoie une page inaccessible), vérifier que le résultat de la collecte porte une trace explicite de ce candidat non résolu (distincte des candidats retenus et de `echec_global`), plutôt qu'un simple `candidats: []`.

**Acceptance Scenarios**:

1. **Given** un candidat dont le titre seul n'est pas pertinent et dont le PDF joint échoue au téléchargement (erreur réseau bas niveau, ou réponse HTTP non-2xx), **When** la collecte s'exécute, **Then** le résultat de la collecte signale explicitement que ce candidat n'a pas pu être évalué complètement — il n'est ni publié comme événement, ni traité comme silencieusement écarté.
2. **Given** un connecteur `page_detail` dont la page de détail d'un candidat est inaccessible, **When** la collecte s'exécute, **Then** le même signal est produit, pour la même raison (impossibilité de vérifier la pertinence réelle), avant même d'avoir tenté le PDF.
3. **Given** un candidat dont le titre SEUL est déjà pertinent (mots-clés présents), **When** le PDF joint échoue malgré tout au téléchargement, **Then** le candidat est publié normalement à partir du texte du titre (comportement actuel inchangé, FR-002) — le nouveau signal ne concerne que les candidats dont la pertinence n'a jamais pu être établie.
4. **Given** un candidat dont le PDF se télécharge et s'extrait avec succès, **When** le texte extrait ne contient aucun mot-clé, **Then** ce candidat est bien écarté silencieusement comme aujourd'hui (comportement actuel inchangé, FR-002) — ce n'est PAS un cas d'incertitude, la pertinence a réellement été vérifiée et est négative.

---

### User Story 2 - Le statut d'une exécution reflète l'incertitude, jamais un faux « rien à signaler » (Priority: P1)

En tant qu'opérateur consultant l'historique des exécutions, je dois pouvoir distinguer, sans avoir à relire les journaux bruts, une exécution qui n'a réellement rien trouvé de nouveau d'une exécution où au moins un candidat n'a pas pu être vérifié à cause d'un problème technique — ces deux cas ne doivent jamais porter le même statut.

**Why this priority** : c'est ce qui a permis au faux succès du Morbihan de passer inaperçu deux fois dans la même journée — sans statut distinct, aucune alerte ni aucun rapport ne peut jamais signaler le problème à un humain.

**Independent Test** : injecter une exécution avec zéro candidat retenu mais un candidat non résolu (US1) et vérifier que le statut retourné diffère de celui d'une exécution avec zéro candidat retenu et zéro candidat non résolu.

**Acceptance Scenarios**:

1. **Given** une exécution avec zéro événement publié et au moins un candidat non résolu (US1), **When** le statut de l'exécution est déterminé, **Then** il ne s'agit ni de `succes` ni de `echec` au sens actuel — l'exécution est reconnaissable comme incomplète/incertaine, distinctement d'un mois réellement vide.
2. **Given** une exécution avec zéro événement publié et zéro candidat non résolu, **When** le statut est déterminé, **Then** il reste `succes` — aucune régression sur le cas normal (US3 de la feature 005, déjà acquis).
3. **Given** une exécution avec au moins un événement publié ET au moins un candidat non résolu (les deux à la fois), **When** le statut est déterminé, **Then** l'incertitude reste visible malgré la présence d'un événement publié — un succès partiel ne doit jamais masquer l'incertitude résiduelle.
4. **Given** une exécution marquée incertaine, **When** un opérateur consulte la liste des connecteurs/mois à surveiller, **Then** il peut la retrouver explicitement (pas seulement en inspectant chaque exécution une par une).

---

### User Story 3 - Le backfill ne considère jamais un mois/année comme définitivement acquis tant qu'un candidat reste non résolu (Priority: P1)

En tant que système de backfill, je ne dois jamais retirer du checkpoint un mois cible (ni, pour un connecteur à granularité annuelle, l'année entière) si l'exécution correspondante contient un candidat non résolu (US1/US2) — ce mois doit rester éligible à une reprise ultérieure, exactement comme un échec réseau bas niveau aujourd'hui.

**Why this priority** : sans ce changement, corriger US1/US2 ne suffit pas à éviter la perte réelle de couverture — c'est précisément la consommation prématurée du checkpoint qui a transformé un aléa réseau ponctuel en trou définitif et invisible sur toute une année pour le Morbihan.

**Independent Test** : simuler une exécution de backfill dont le résultat contient un candidat non résolu et vérifier que le mois cible (et, pour un connecteur `granularite_liste: annuelle`, le reste de l'année) demeure dans `moisRestants` après le run, contrairement à un run sans candidat non résolu.

**Acceptance Scenarios**:

1. **Given** un connecteur ordinaire (granularité mensuelle) dont l'exécution de backfill produit un candidat non résolu pour le mois cible, **When** le run se termine, **Then** ce mois reste dans le checkpoint comme restant à traiter.
2. **Given** un connecteur `granularite_liste: annuelle` dont l'exécution produit un candidat non résolu, **When** le run se termine, **Then** aucun mois de l'année ciblée n'est retiré du checkpoint (le raccourci `anneesCouvertes`, FR existant de la feature 005, ne DOIT jamais s'appliquer à une exécution comportant un candidat non résolu).
3. **Given** un mois cible resté dans le checkpoint pour cette raison, **When** le backfill est relancé ultérieurement (délai quelconque), **Then** ce mois est retenté normalement, sans intervention manuelle particulière.
4. **Given** un connecteur dont le circuit-breaker s'ouvre juste après une exécution à candidat non résolu, **When** le rapport de fin de run est produit, **Then** ce mois apparaît comme non résolu, pas comme une réussite masquée par l'arrêt du circuit.

---

### User Story 4 - Pouvoir rejouer, sans risque, les mois déjà collectés avant ce correctif (Priority: P2)

En tant qu'opérateur, après la mise en place du correctif, je dois pouvoir relancer une collecte historique sur des mois/années déjà marqués comme traités par une exécution ANTÉRIEURE au correctif — sans avoir besoin de savoir, au cas par cas, si cette exécution passée a réellement été fiable — afin de fermer le trou identifié le 2026-09-05 sans devoir auditer manuellement chaque connecteur.

**Why this priority** : c'est la réponse directe à la question posée par l'utilisateur (« potentiellement tout notre historique est à reprendre ») — sans un moyen sûr de rejouer largement, la seule option resterait un audit manuel connecteur par connecteur, infaisable à l'échelle de 91 connecteurs.

**Independent Test** : resolliciter volontairement un couple (connecteur, mois) déjà marqué traité par une exécution antérieure au correctif et vérifier qu'aucun événement n'est publié en double (`dedupe.ts`, déjà garanti par la feature 005) tout en confirmant qu'un nouveau candidat auparavant perdu peut désormais être détecté.

**Acceptance Scenarios**:

1. **Given** un mois déjà marqué comme traité par une exécution antérieure à ce correctif, **When** ce mois est resollicité volontairement après le correctif, **Then** un événement réel qui aurait été silencieusement perdu à l'époque (PDF alors inaccessible, désormais accessible) est correctement détecté et publié.
2. **Given** ce même mois, **When** il est resollicité alors que l'événement qu'il contient a en réalité déjà été publié entre-temps par un autre mécanisme, **Then** aucun doublon n'est créé (garantie déjà existante, `dedupe.ts`).
3. **Given** l'ensemble des mois déjà marqués traités avant le correctif, **When** l'opérateur souhaite les rejouer, **Then** un mécanisme explicite permet de les redésigner comme éligibles au backfill (à la demande, pas automatiquement au démarrage) — sans devoir reconstruire le checkpoint à la main ni perdre la progression des mois traités APRÈS le correctif.
4. **Given** le volume que représenterait un rejeu complet de tout l'historique déjà collecté, **When** l'opérateur décide de la stratégie de reprise, **Then** il peut choisir un périmètre restreint (ex. uniquement les connecteurs `granularite_liste: annuelle`, ou uniquement ceux ayant eu au moins une exécution `succes` à 0 événement) plutôt qu'un rejeu de la totalité — cette priorisation doit être objectivable, pas un simple « tout ou rien ».

### Edge Cases

- Un candidat sans aucun PDF déclaré (`selecteur_lien_pdf` absent de la configuration, cas hypothétique) : hors périmètre — aucun de nos 96 connecteurs réels n'est dans ce cas.
- Un PDF qui se télécharge avec succès mais dont le texte n'est pas extractible (scan sans OCR, cas déjà documenté pour la Moselle) : DOIT rester distinct d'un échec de *téléchargement* — c'est un cas déjà connu et déjà traité sans lever d'exception (`resultatPdf.texte === null`), à ne pas confondre avec le bug ciblé ici (qui porte sur l'échec de la requête HTTP elle-même, avant même d'avoir un texte à examiner).
- Un candidat dont le titre est déjà pertinent ET dont le PDF échoue au téléchargement : ne doit PAS être marqué incertain — la pertinence a déjà été établie par le titre seul (US1 Acceptance Scenario 3) ; seule l'extraction de champs plus précis à partir du PDF est perdue, ce qui reste le comportement actuel (repli sur le texte du titre pour l'extraction).
- Un connecteur dont TOUS les candidats d'un mois échouent au téléchargement de leur PDF : le mois entier doit rester non résolu, pas seulement partiellement.
- Un connecteur `granularite_liste: annuelle` dont un seul candidat sur douze mois est non résolu : la totalité de l'année doit rester éligible à une reprise (pas seulement le mois du candidat concerné), puisque `anneesCouvertes` s'applique à la page entière, pas à un mois isolé.
- Rejeu massif après correctif (US4) : ne doit pas reproduire les incidents de blocage réseau déjà documentés (circuit-breaker, espacement, séquentialité — mécanismes existants de la feature 005, à réutiliser tels quels, pas à redévelopper).
- Un candidat non résolu que le circuit-breaker interrompt avant même la tentative de PDF (le run s'arrête avant d'atteindre ce candidat) : distinct du cas ciblé ici — un run qui n'a jamais tenté un candidat n'est pas un run qui l'a perdu ; ce cas est déjà couvert (le mois reste dans le checkpoint, cf. feature 005 US3).

## Requirements *(mandatory)*

### Functional Requirements

**Détection (US1)**

- **FR-001**: Le moteur `page_web` DOIT distinguer explicitement, pour chaque candidat, trois issues possibles : pertinent (publié), non pertinent (pertinence réellement vérifiée, négative), ou **non résolu** (pertinence jamais vérifiable faute d'avoir pu lire le PDF et/ou la page de détail).
- **FR-002**: Un candidat DONT LE TITRE SEUL est déjà pertinent NE DOIT JAMAIS être marqué non résolu, même si son PDF joint échoue au téléchargement — le comportement actuel (publication à partir du texte du titre) reste inchangé pour ce cas.
- **FR-003**: Un candidat dont le PDF se télécharge et s'extrait avec succès, mais dont le texte ne contient aucun mot-clé, DOIT rester non pertinent (écarté), jamais non résolu — l'incertitude ne concerne que l'impossibilité de lire la source, pas un résultat de lecture négatif.
- **FR-004**: Un échec de la page de détail (`page_detail`) DOIT produire le même signal de non-résolution qu'un échec de téléchargement du PDF lui-même — les deux sont des étapes de la même chaîne de vérification.
- **FR-005**: `ResultatCollecte` DOIT pouvoir porter, pour l'ensemble d'une collecte, le nombre (ou la liste) de candidats non résolus, sans confondre ce signal avec `echec_global` (réservé à l'inaccessibilité de la source elle-même, pas d'un candidat individuel).

**Statut et traçabilité (US2)**

- **FR-006**: Une exécution comportant au moins un candidat non résolu DOIT être identifiable comme telle dans son résultat persisté (`ExecutionCollecte` et/ou une anomalie dédiée), quel que soit par ailleurs le nombre d'événements publiés dans le même run.
- **FR-007**: Une exécution sans aucun candidat non résolu et sans aucun événement publié DOIT continuer à être `succes`, sans régression (cas normal existant, feature 002/005).
- **FR-008**: Chaque candidat non résolu DOIT être rattaché à une trace suffisante pour qu'un opérateur puisse comprendre pourquoi (connecteur, mois/date de collecte, URL ayant échoué, nature de l'échec) — sans nécessairement dupliquer toute la mécanique de résolution des anomalies existantes (`champ_manquant`/`date_ambigue`/`doublon_potentiel`), qui suppose un candidat déjà extrait.
- **FR-009**: Le système DOIT permettre de lister, à un instant donné, l'ensemble des connecteurs/mois portant au moins une exécution avec candidat(s) non résolu(s) — préalable nécessaire à toute décision de reprise (US4).

**Backfill et checkpoint (US3)**

- **FR-010**: `backend/src/scripts/backfill-historique.ts` NE DOIT PAS retirer du checkpoint un mois cible dont l'exécution correspondante comporte au moins un candidat non résolu.
- **FR-011**: Pour un connecteur `granularite_liste: 'annuelle'`, le raccourci qui retire d'un coup tous les mois restants de l'année (`anneesCouvertes`) NE DOIT JAMAIS s'appliquer à une exécution comportant au moins un candidat non résolu — même si d'autres candidats de la même page ont été correctement vérifiés.
- **FR-012**: Un mois cible laissé dans le checkpoint pour cette raison DOIT rester retentable par un run ultérieur exactement comme un échec réseau bas niveau aujourd'hui (même mécanisme de reprise, pas un chemin distinct à maintenir séparément).
- **FR-013**: Un candidat non résolu NE DOIT JAMAIS compter dans le seuil du circuit-breaker réseau (FR-014 de la feature 005) — ce n'est pas un échec réseau bas niveau au sens de ce mécanisme, seulement un signal d'incertitude sur le contenu.

**Remédiation de l'historique déjà collecté (US4)**

- **FR-014**: Le système DOIT permettre de redésigner comme éligibles à une nouvelle tentative de backfill des mois déjà marqués « traités » par une exécution antérieure à ce correctif, sans reconstruire manuellement l'intégralité du checkpoint.
- **FR-015**: Cette redésignation DOIT pouvoir cibler un périmètre choisi (ex. un ou plusieurs connecteurs, une plage de mois) plutôt que systématiquement la totalité de l'historique déjà collecté.
- **FR-016**: Resolliciter un mois déjà traité avant ce correctif NE DOIT produire aucun événement dupliqué (garantie déjà existante de `dedupe.ts`, à ne pas modifier).
- **FR-017**: Le système DOIT permettre d'identifier, parmi les connecteurs déjà marqués « traités », ceux pour lesquels le risque de candidat silencieusement perdu est le plus plausible (à défaut de savoir lequel l'a été réellement) — au minimum les connecteurs `granularite_liste: annuelle` (perte potentielle la plus large par exécution) et ceux ayant déjà une ou plusieurs exécutions `succes` à `0 évènement publié` sur la période concernée — afin de prioriser un rejeu partiel avant, le cas échéant, un rejeu complet.

### Key Entities

- **CandidatEvenement / ResultatCollecte** (existants, `backend/src/connecteurs/types.ts`) : gagnent la capacité de représenter un candidat « non résolu », distinct des candidats retenus et de `echec_global`.
- **ExecutionCollecte** (existant) : son schéma actuel (`StatutExecutionSchema: 'succes' | 'echec' | 'partiel'`, avec `partiel` contraint à exiger à la fois ≥1 événement publié ET ≥1 anomalie) ne permet pas aujourd'hui de représenter « 0 événement publié, mais au moins un candidat non résolu » — cette spécification n'impose pas la mécanique exacte (laissée à `plan.md`), mais exige que le résultat final permette de distinguer ce cas de `succes` au sens strict (FR-006).
- **AnomalieCollecte** (existant) : son énumération `TypeAnomalieSchema` (`champ_manquant`, `date_ambigue`, `doublon_potentiel`, `echec_lecture_source`) ne couvre pas explicitement « candidat non vérifiable » à l'échelle d'un seul candidat au sein d'un run par ailleurs réussi — à trancher en `plan.md` (nouvelle valeur dédiée, ou réutilisation élargie d'une valeur existante).
- **Checkpoint de backfill** (artefact opérationnel existant, `backfill-checkpoint.json`, feature 005) : son modèle par connecteur (mois restants, année couverte) doit pouvoir représenter qu'un mois déjà retiré AVANT ce correctif redevient éligible, sans perdre la progression des mois traités APRÈS le correctif.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Rejouer le scénario du Morbihan (candidat non pertinent au titre, PDF en échec de téléchargement) sur un connecteur de test produit un signal de non-résolution exploitable — 0 cas où le résultat final est indiscernable d'un mois réellement vide.
- **SC-002**: Après le correctif, aucune exécution de backfill comportant un candidat non résolu ne retire de mois (ni, pour un connecteur annuel, d'année) du checkpoint — vérifiable en comparant le checkpoint avant/après un run simulé avec candidat non résolu.
- **SC-003**: 0 régression sur le cas normal : une exécution sans aucun candidat non résolu produit exactement le même statut et la même consommation de checkpoint qu'avant ce correctif.
- **SC-004**: 0 événement dupliqué constaté après un rejeu volontaire (US4) d'un mois déjà traité avant le correctif.
- **SC-005**: L'opérateur peut obtenir, sans lecture manuelle des journaux bruts, la liste des connecteurs/mois à reprendre en priorité (US4, FR-017) en moins d'une commande/requête dédiée.
- **SC-006**: Le cas réel du Morbihan (arrêté du 26/08/2026), une fois le PDF de nouveau accessible, est effectivement détecté et publié par un rejeu du mois concerné — validation de bout en bout sur un cas réel, pas seulement sur des fixtures synthétiques.

## Assumptions

- Cette spécification porte sur la détection et la non-consommation prématurée du checkpoint ; elle ne couvre PAS la stratégie exacte de rejeu (ordre, volume par jour, seuils) — ce chiffrage relève de `plan.md`/`tasks.md`, comme pour la feature 005.
- La mécanique exacte de représentation d'un candidat « non résolu » dans les schémas de données existants (`ExecutionCollecte.statut`, `TypeAnomalieSchema`) n'est pas fixée ici — plusieurs options sont ouvertes (nouvelle valeur d'énumération, assouplissement de la contrainte `partiel`, ou nouvel objet dédié) et seront tranchées en `plan.md`, avec mise à jour du contrat `specs/002-connecteur-collecte-prefecture/contracts/connecteur-interface.md` si `ResultatCollecte` est étendu (même esprit que l'extension de ce contrat par la feature 005).
- Le rejeu de l'historique déjà collecté (US4) réutilise intégralement les mécanismes de sécurité réseau déjà en place (checkpoint, circuit-breaker, espacement, séquentialité par groupe d'hébergement, feature 005) — cette spécification n'introduit aucun nouveau mécanisme de prudence réseau, seulement un moyen de redésigner des mois comme éligibles.
- Il n'existe aujourd'hui aucun moyen de déterminer, pour une exécution `succes` passée, si elle a réellement perdu un candidat ou non (aucune trace n'a été conservée avant ce correctif) — FR-017 propose donc une priorisation par plausibilité (connecteurs annuels, exécutions à 0 événement), pas une identification certaine, et l'utilisateur reste décisionnaire du périmètre de rejeu effectivement lancé (US4 Acceptance Scenario 4).
- Le volume total de l'historique concerné est significatif (91 connecteurs suivis par le checkpoint au 2026-09-05, plusieurs dizaines de mois déjà marqués traités) — un rejeu complet de tout l'historique, si l'utilisateur le choisit, prendra probablement plusieurs sessions/jours au rythme déjà observé des campagnes de backfill, contrainte déjà connue et documentée (`claude/etat-connecteurs.md`), pas une nouveauté introduite par cette feature.
