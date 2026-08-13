# Feature Specification: Connecteurs de collecte automatique des arrêtés préfectoraux

**Feature Branch**: `002-connecteur-collecte-prefecture`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Implémenter les connecteurs de collecte automatique des arrêtés préfectoraux d'interdiction de rassemblements musicaux non déclarés (rave party, teknival), un connecteur indépendant par département/préfecture, capable de récupérer les publications brutes de la source (pages web du Recueil des Actes Administratifs et/ou fichiers PDF), d'en extraire les informations pertinentes (référence de l'arrêté, dates de début/fin, autorité signataire) y compris par lecture de PDF quand c'est le format obtenu, et de produire des événements conformes au modèle de données existant. Publication automatique par défaut : pas d'étape de relecture systématique — une intervention humaine n'est requise que lorsque l'extraction rencontre une erreur, une ambiguïté ou une difficulté à traiter la donnée."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Constituer un registre des sources par département (Priority: P1)

En tant qu'opérateur du projet, je veux disposer d'un registre recensant, pour chaque département, où trouver la publication officielle de ses arrêtés (préfecture ou portail régional, point d'accès/URL connu, format probable de la publication — page web, PDF, ou autre), afin de savoir précisément où pointer un connecteur avant de le développer.

**Why this priority**: C'est un préalable à tout le reste : sans savoir où se trouve la donnée pour un département, impossible de développer un connecteur (US2) ni d'anticiper le type de traitement nécessaire (page web, PDF...). Cette étape découle aussi du Principe 10 de la constitution : les sources préfectorales ne sont pas centralisées, il faut d'abord cartographier cette hétérogénéité avant de coder quoi que ce soit.

**Independent Test**: Consulter le registre pour un département donné et vérifier qu'il indique au minimum l'autorité source, son point d'accès connu, et le format attendu de la publication — ou une mention explicite qu'aucune source n'a encore été identifiée pour ce département — sans qu'aucun connecteur n'ait encore été développé.

**Acceptance Scenarios**:

1. **Given** un département quelconque, **When** on consulte le registre des sources, **Then** on trouve soit une entrée décrivant où et sous quel format chercher la donnée pour ce département, soit une mention explicite qu'aucune source n'a encore été identifiée.
2. **Given** une source nouvellement identifiée pour un département non couvert, **When** elle est ajoutée au registre, **Then** elle devient disponible pour prioriser ou développer le connecteur correspondant, sans déclencher par elle-même de collecte automatique.
3. **Given** un département déjà couvert par un connecteur en production, **When** son entrée dans le registre est consultée, **Then** elle reste cohérente avec la source réellement utilisée par le connecteur.

---

### User Story 2 - Ajouter un connecteur pour une nouvelle préfecture (Priority: P2)

En tant qu'opérateur du projet, je veux pouvoir ajouter un connecteur pour une préfecture donnée afin que son département cesse d'être affiché "non couvert" (gris) sur la carte dès que des événements vérifiés existent pour lui.

**Why this priority**: Sans cette capacité, la couverture du produit reste figée aux départements de test actuels ; c'est le mécanisme fondateur qui permet toute extension future, conformément au Principe 10 de la constitution (connecteurs indépendants et pluggables). S'appuie directement sur le registre des sources (US1) pour savoir où pointer le nouveau connecteur.

**Independent Test**: Ajouter un connecteur pour un département actuellement gris, exécuter une collecte, laisser au moins un événement s'extraire sans ambiguïté, et vérifier que la carte affiche désormais ce département en rouge ou vert à la date attendue — sans avoir modifié le code du cœur applicatif (API, calcul d'état, carte).

**Acceptance Scenarios**:

1. **Given** un département sans connecteur actif (affiché gris), **When** un connecteur est déclaré et exécuté avec succès pour ce département et qu'au moins un événement est extrait sans ambiguïté, **Then** le département reflète l'état issu de cet événement aux dates concernées, sans qu'une intervention humaine ait été nécessaire.
2. **Given** un connecteur nouvellement ajouté, **When** son code est déployé, **Then** aucune modification du cœur applicatif (routes API, `computeDepartementState`, composants carte) n'est nécessaire.

---

### User Story 3 - Collecter et publier automatiquement les arrêtés sans ambiguïté (Priority: P3)

En tant qu'opérateur, je veux qu'un connecteur récupère périodiquement les nouvelles publications de sa source (page web du Recueil des Actes Administratifs et/ou fichiers PDF), en extraie les arrêtés pertinents et les publie directement dans l'historique dès que l'extraction est complète et non ambiguë, afin de maintenir l'historique à jour sans ressaisie ni relecture manuelle systématique.

**Why this priority**: C'est la valeur récurrente du connecteur une fois ajouté (US2) ; sans collecte périodique et sans publication directe des extractions propres, chaque mise à jour resterait un geste manuel, ce qui ne passe pas à l'échelle sur la durée.

**Independent Test**: Déclencher la collecte d'un connecteur pointant vers un jeu de pages/PDF de test connu et bien formé, et vérifier que les arrêtés qu'il contient (référence, dates, autorité) sont directement publiés comme événements dans l'API et la carte, sans étape intermédiaire, y compris lorsque la source est un PDF.

**Acceptance Scenarios**:

1. **Given** une source publiée en page web contenant un arrêté d'interdiction dont tous les champs requis sont lisibles, **When** le connecteur collecte cette source, **Then** un événement est publié directement (API + carte) avec référence, date de début, date de fin (si présente) et autorité signataire correctement extraites, sans intervention humaine.
2. **Given** une source publiée uniquement sous forme de fichier PDF contenant du texte extractible et sans ambiguïté, **When** le connecteur collecte cette source, **Then** le texte du PDF est lu et un événement est publié directement, au même titre qu'à partir d'une page web.
3. **Given** une source déjà collectée sans nouvelle publication depuis la dernière exécution, **When** le connecteur est réexécuté, **Then** aucun événement dupliqué n'est publié.

---

### User Story 4 - Résoudre une anomalie de collecte avant publication (Priority: P4)

En tant qu'opérateur du projet, je veux être alerté uniquement lorsqu'un connecteur rencontre une erreur, une ambiguïté ou une difficulté à traiter une donnée (champ manquant, date illisible, doublon suspecté, source illisible), afin de trancher ces cas précis avant publication sans avoir à relire chaque événement extrait avec succès.

**Why this priority**: Découle du Principe 1 (traçabilité) et de la nécessité de ne jamais publier une donnée douteuse comme un fait administratif certain, tout en laissant l'automatisation de US3 fonctionner sans friction pour les extractions propres, qui restent la majorité des cas.

**Independent Test**: Provoquer volontairement une extraction ambiguë ou en échec (champ manquant, doublon) via un jeu de test, vérifier qu'aucun événement n'est publié automatiquement mais qu'une anomalie de collecte apparaît dans l'espace de résolution avec sa source brute ; la résoudre, et vérifier que l'événement (ou son rejet) est ensuite traité en conséquence. En parallèle, vérifier qu'une extraction propre exécutée au même moment n'apparaît jamais dans cet espace.

**Acceptance Scenarios**:

1. **Given** une source dont l'extraction échoue ou reste ambiguë (champ requis manquant ou illisible, date de fin non déterminable, doublon potentiel détecté), **When** le connecteur la traite, **Then** aucun événement n'est publié et une anomalie de collecte est créée, visible dans l'espace de résolution avec les champs partiellement extraits et un accès à la source brute originale.
2. **Given** une extraction complète et non ambiguë, **When** le connecteur la traite, **Then** aucune anomalie n'est créée et l'événement est publié directement (cf. US3) — l'espace de résolution reste vide en l'absence de difficulté.
3. **Given** une anomalie de collecte en attente, **When** l'opérateur la résout en confirmant les valeurs (avec correction si besoin), **Then** un événement est publié avec `methode_collecte = manuelle_verifiee`.
4. **Given** une anomalie de collecte en attente, **When** l'opérateur la rejette, **Then** aucun événement n'est créé ; l'anomalie reste tracée en interne comme rejetée mais n'apparaît jamais dans l'API publique ni sur la carte.

---

### User Story 5 - Désactiver un connecteur défaillant sans impact sur le reste du produit (Priority: P5)

En tant que mainteneur technique, je veux pouvoir désactiver un connecteur en échec (source indisponible, format de publication changé) indépendamment des autres connecteurs, afin que son département repasse en gris de façon prévisible sans casser l'historique déjà validé ni les autres connecteurs.

**Why this priority**: Complète le Principe 10 (isolation des connecteurs) ; moins critique que les trois premiers récits car il s'agit d'un cas de maintenance plutôt que du chemin principal de valeur, mais nécessaire pour que la dégradation d'une source reste sans risque pour le reste du produit.

**Independent Test**: Désactiver un connecteur existant et vérifier que (a) les autres connecteurs continuent de fonctionner normalement, (b) le département concerné affiche "non couvert" pour les dates postérieures à la désactivation, (c) l'historique déjà validé avant désactivation reste intact et consultable.

**Acceptance Scenarios**:

1. **Given** un connecteur actif avec un historique déjà validé, **When** il est désactivé, **Then** son département affiche "non couvert" pour toute date postérieure à la désactivation, sans effacer les événements déjà validés aux dates antérieures.
2. **Given** plusieurs connecteurs actifs, **When** l'un d'eux échoue ou est désactivé, **Then** l'exécution et l'état des autres connecteurs ne sont pas affectés.

---

### Edge Cases

- Que se passe-t-il quand un PDF collecté est un scan/image sans texte extractible (nécessitant une reconnaissance optique) ?
- Que se passe-t-il quand la structure d'une page web ou d'un PDF change et que l'extraction ne trouve plus les champs attendus (échec silencieux vs erreur signalée) ?
- Que se passe-t-il quand un événement extrait automatiquement correspond à un arrêté déjà saisi manuellement pour le même département et la même période (doublon potentiel) ?
- Que se passe-t-il quand un arrêté extrait ne mentionne pas de date de fin lisible (formulation ambiguë dans le texte source) ?
- Que se passe-t-il quand deux connecteurs différents couvrent le même département (ex. portail régional et préfecture) et produisent des événements concurrents ?
- Que se passe-t-il quand la source d'un connecteur est temporairement indisponible (site en panne) au moment d'une collecte planifiée ?
- Que se passe-t-il quand une source répertoriée change d'adresse ou disparaît avant même qu'un connecteur n'ait été développé pour elle ?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT permettre d'ajouter un connecteur pour une nouvelle préfecture ou un nouveau portail régional sans modifier le code du cœur applicatif (API, calcul d'état, carte).
- **FR-002**: Chaque connecteur DOIT être développable, testable et désactivable indépendamment des autres connecteurs.
- **FR-003**: Le système DOIT pouvoir récupérer la publication brute d'une source dans au moins deux formats : page web (HTML) et fichier PDF.
- **FR-004**: Quand la source obtenue est un PDF contenant du texte extractible, le système DOIT lire ce texte pour y repérer les informations d'un arrêté (référence, dates de début/fin, autorité signataire).
- **FR-005**: Quand la source obtenue est un PDF sans texte extractible (scan/image), le système NE DOIT PAS tenter de reconnaissance optique de caractères (OCR) — ce cas est explicitement hors périmètre. Le connecteur DOIT signaler l'échec d'extraction (sans produire d'événement candidat), et le département concerné reste "non couvert" (gris) pour cette source tant qu'aucun événement validé n'existe par ailleurs.
- **FR-006**: Chaque événement produit par un connecteur DOIT porter `connecteur_id`, `autorite_signataire` (conformément au Principe 1 de la constitution — traçabilité de l'autorité signataire), et `methode_collecte = automatique` s'il est publié sans intervention humaine, ou `manuelle_verifiee` s'il est publié après résolution d'une anomalie de collecte par l'opérateur. Ceci nécessite l'extension du schéma `Evenement` existant (specs/001) avec un champ `autorite_signataire`, ce champ n'y étant pas encore porté (voir data-model.md, « Entité Événement (extension) »).
- **FR-007**: Un événement extrait par un connecteur DOIT être publié directement dans l'API publique et sur la carte dès que son extraction est complète et non ambiguë et qu'aucun doublon n'est détecté — sans étape de relecture humaine par défaut.
- **FR-008**: Le système DOIT créer une anomalie de collecte, à la place d'une publication directe, lorsque l'extraction rencontre l'un des cas suivants : champ requis manquant ou illisible (référence, date de début, autorité signataire), date de fin ambiguë dans le texte source, doublon potentiel détecté (FR-010), ou échec de lecture de la source (page/PDF inaccessible, vide, ou dans un format non supporté).
- **FR-009**: Le système DOIT fournir un espace de résolution listant uniquement les anomalies de collecte en attente, avec les champs partiellement extraits (le cas échéant) et un accès à la publication brute originale (lien ou document source), permettant à l'opérateur de confirmer l'événement (avec correction si besoin) ou de le rejeter.
- **FR-010**: Le système DOIT détecter les doublons potentiels (même département, référence d'arrêté proche ou période fortement chevauchante avec un événement déjà publié) et créer une anomalie de collecte plutôt que de publier automatiquement l'événement en doublon.
- **FR-011**: Le système DOIT journaliser chaque exécution de connecteur (date, statut succès/échec, nombre d'événements publiés automatiquement, nombre d'anomalies produites) et mettre à jour la date de dernière collecte du connecteur.
- **FR-012**: Un connecteur en échec persistant DOIT pouvoir être désactivé sans supprimer l'historique déjà publié qui lui est rattaché ; son département affiche alors "non couvert" pour les dates postérieures à la désactivation.
- **FR-013**: Le système DOIT exécuter automatiquement la collecte de chaque connecteur actif une fois par jour.
- **FR-014**: Le système DOIT permettre de déclencher manuellement la collecte d'un connecteur donné, en dehors de son cycle quotidien, pour rattraper une publication manquée.
- **FR-015**: L'espace de résolution des anomalies DOIT être protégé par une authentification dédiée (connexion administrateur), distincte et indépendante de l'API publique et de la carte qui restent sans authentification ; dans cette première version, seul l'opérateur du projet dispose d'un accès (pas de gestion multi-comptes).
- **FR-016**: Une anomalie de collecte rejetée par l'opérateur DOIT rester tracée en interne (source, raison) mais NE DOIT jamais produire d'événement visible dans l'API publique ou sur la carte.
- **FR-017**: Le système DOIT maintenir un registre des sources couvrant l'ensemble des départements, indiquant pour chacun soit une source identifiée (autorité, point d'accès/URL, format attendu de la publication), soit l'absence explicite de source connue à ce jour.
- **FR-018**: Le registre des sources DOIT pouvoir être consulté et mis à jour indépendamment du développement ou du déploiement d'un connecteur — identifier une source ne doit pas nécessiter d'écrire du code.

### Key Entities

- **Connecteur**: (déjà défini en specs/001) — étendu ici avec la notion d'exécution planifiée/déclenchable et de format(s) de source supporté(s) (page web, PDF).
- **Exécution de collecte**: Trace d'un run d'un connecteur donné — date, statut (succès/échec/partiel), nombre d'événements publiés automatiquement, nombre d'anomalies produites, message d'erreur éventuel. Alimente la fraîcheur des données (Principe 7).
- **Événement**: (déjà défini en specs/001) — peut désormais être créé directement par un connecteur, sans étape intermédiaire, dès que l'extraction est complète et non ambiguë (`methode_collecte = automatique`).
- **Anomalie de collecte**: Cas où un connecteur n'a pas pu produire un événement fiable automatiquement (champ manquant, ambiguïté, doublon suspecté, échec de lecture de la source). Créée uniquement dans ce cas — il n'existe pas d'étape intermédiaire pour les extractions réussies. Reste en attente de résolution par l'opérateur : confirmation (avec correction si besoin) produisant un événement `methode_collecte = manuelle_verifiee`, ou rejet ne produisant aucun événement.
- **Source brute**: Document ou page originale collectée (URL de la page, ou fichier PDF récupéré) à partir de laquelle un événement ou une anomalie a été produit ; conservée pour la traçabilité (Principe 1) et, en cas d'anomalie, pour la résolution par l'opérateur.
- **Entrée du registre des sources**: Pour un département donné — autorité source (préfecture ou portail régional), point d'accès/URL connu, format attendu de la publication (page web, PDF, autre), et statut (source identifiée / connecteur développé / à investiguer). Existe indépendamment de l'existence d'un connecteur ; précède et documente son développement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un nouveau connecteur pour une préfecture peut être ajouté et mis en service sans qu'aucune ligne du cœur applicatif (API, calcul d'état, composants carte) ne soit modifiée.
- **SC-002**: 100% des événements visibles dans l'API publique ou sur la carte et issus d'un connecteur sont rattachés à une source consultable (lien ou document original).
- **SC-003**: 0% des anomalies de collecte non résolues n'apparaissent dans l'API publique ou sur la carte.
- **SC-004**: Après désactivation d'un connecteur, son département affiche "non couvert" pour les nouvelles dates en un cycle de collecte au plus, sans perte des événements déjà publiés aux dates antérieures.
- **SC-005**: L'opérateur peut passer d'une anomalie de collecte à la décision (confirmation ou rejet) sans quitter l'espace de résolution, source brute originale comprise dans la même vue.
- **SC-006**: Pour une source bien structurée et stable, une extraction propre (sans champ manquant ni doublon) est publiée sans qu'aucune action humaine ne soit nécessaire.
- **SC-007**: 100% des départements disposent d'une entrée dans le registre des sources — identifiée ou explicitement marquée "à investiguer" — jamais d'absence non documentée.

## Assumptions

- Cette spécification porte sur la collecte, l'extraction et le traitement des anomalies ; elle réutilise le modèle de données et l'API définis dans `specs/001-carte-arretes-rave-teknival` (departement_code, type_evenement, date_debut, date_fin, reference_arrete, source_url, date_saisie, connecteur_id, methode_collecte), en ajoutant une entité séparée "anomalie de collecte" (créée uniquement sur erreur/ambiguïté) plutôt qu'un statut de relecture systématique sur chaque événement.
- Par défaut, il n'existe pas d'étape intermédiaire pour une extraction propre : un connecteur publie directement l'événement dès qu'il est complet et non ambigu. La résolution humaine est l'exception, réservée aux anomalies (échec, champ manquant, ambiguïté, doublon suspecté).
- Le stockage reste un fichier de données structuré (JSON), cohérent avec le Principe 5 de simplicité d'architecture, tant que le volume d'anomalies reste faible.
- Chaque connecteur reste un module dédié à une source précise (Principe 10) ; cette spec ne vise pas un connecteur générique universel capable de couvrir n'importe quelle préfecture sans développement dédié.
- La couverture reste progressive : au terme de cette spec, seul un sous-ensemble de départements dispose d'un connecteur fonctionnel ; les autres continuent d'être affichés "non couvert" (gris), conformément au Principe 3.
- L'opérateur (compte admin unique dans cette première version) n'intervient que pour résoudre les anomalies de collecte, pas pour valider systématiquement chaque événement ; l'espace de résolution est un outil interne distinct de l'API publique en lecture seule et du site carte. La gestion multi-comptes n'est pas dans le périmètre.
- L'extraction automatique se limite aux PDF contenant du texte extractible ; les PDF scannés/images sont explicitement hors périmètre (pas d'OCR) — ce cas produit un échec de lecture (FR-008), donc une anomalie de collecte, et non une publication automatique.
- Cette spec s'appuie sur un assouplissement de la règle de gouvernance "toute donnée ajoutée doit être relue avant fusion" (voir amendement de la constitution) : cet assouplissement ne vaut que pour les données produites automatiquement par un connecteur ; toute saisie manuelle hors connecteur reste soumise à relecture systématique.
- Le registre des sources est un artefact léger (ex. fichier structuré tenu à jour manuellement), pas un service à part entière : l'identifier comme un livrable distinct des connecteurs n'implique pas de développement spécifique au-delà de sa structure et de son suivi. Le découpage technique des connecteurs par type de source (accès via API, scraping + lecture de PDF, etc.) et le degré de généricité/configuration au sein d'un même type seront précisés lors de `/speckit-plan` : cette spec fixe le besoin (registre préalable, publication directe vs anomalie) sans imposer d'architecture.
- Le registre des sources n'est PAS automatiquement synchronisé avec le cycle de vie d'un connecteur : désactiver un connecteur (US5, FR-012) ne modifie pas automatiquement le `statut`/`connecteur_id` de son entrée dans le registre — celle-ci reste `connecteur_developpe` jusqu'à mise à jour manuelle par l'opérateur. Ce choix découle directement de FR-018 (le registre s'édite indépendamment du code) : introduire une synchronisation automatique créerait un couplage entre le registre et le déploiement des connecteurs, contraire à cette indépendance voulue.
