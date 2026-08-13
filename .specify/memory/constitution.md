# Constitution du projet : Carte des Arrêtés Rave/Teknival

**Version** : 2.3.0
**Ratifiée le** : 2026-08-10
**Dernière modification** : 2026-08-12

## Contexte

Ce projet affiche une carte de France où chaque département reflète l'un de
trois états : **vert** (aucun arrêté d'interdiction en vigueur, source
couverte), **rouge** (arrêté préfectoral d'interdiction des rassemblements
musicaux non déclarés — rave party, teknival — en vigueur), ou **gris**
(aucun connecteur actif pour ce département : la donnée est simplement
absente, ce qui n'équivaut pas à "aucune interdiction"). L'application est
historisée (navigation jour par jour sur un intervalle de dates) et affiche,
au survol, les dates exactes de l'arrêté concerné (ou l'absence de
couverture).

---

## Principes fondamentaux

### Principe 1 : Fidélité et traçabilité à la source
**Règle** : Aucun changement d'état d'un département NE DOIT être affiché sans
être rattaché à un arrêté identifiable : numéro/référence, autorité signataire
(préfecture), date de signature, date de début et de fin d'application (si
connue), et si possible un lien vers le texte source (Légifrance, RAA de la
préfecture, presse officielle).
**Justification** : L'outil prétend refléter un fait administratif réel ; une
donnée non sourcée expose à la désinformation et à la remise en cause de la
fiabilité de l'outil entier.

### Principe 2 : Historisation immuable (append-only)
**Règle** : Le statut d'un département n'est JAMAIS stocké comme une valeur
unique écrasée à chaque mise à jour. Chaque changement (interdiction posée,
interdiction levée, prolongation) est un événement horodaté et conservé. L'état
affiché à une date T DOIT être *calculé* à partir de la liste des événements,
jamais lu depuis un champ "statut actuel" muté en place.
**Justification** : C'est la condition sine qua non pour que la réglette
jour-par-jour et le calendrier d'intervalle fonctionnent et restent cohérents
avec ce qui a réellement été affiché dans le passé.

### Principe 3 : Neutralité factuelle
**Règle** : L'interface DOIT se limiter à l'affichage d'un fait administratif
("un arrêté d'interdiction est en vigueur ici, entre telle et telle date").
Aucun vocabulaire, icône ou couleur ne doit suggérer un jugement sur la
légitimité de l'arrêté ou sur les rassemblements eux-mêmes. Un département
sans connecteur actif DOIT être affiché dans un état distinct ("non couvert"),
jamais assimilé à "aucune interdiction" : l'absence de donnée n'est pas une
donnée.
**Justification** : Le sujet est sensible et politiquement chargé ; la valeur
de l'outil dépend de sa perception comme source neutre plutôt que comme
plaidoyer. Afficher "vert" faute de collecte reviendrait à affirmer un fait
qu'on n'a pas vérifié.

### Principe 4 : Accessibilité — la couleur seule ne suffit jamais
**Règle** : Les trois états (vert / rouge / gris) NE DOIVENT PAS reposer sur
la seule couleur (~8% des hommes présentent une forme de daltonisme,
principalement deutéranomalie/protanomalie, qui rend le rouge/vert difficile
à distinguer, et le gris peut se confondre avec un vert ou rouge désaturé).
Chaque département DOIT porter un second indicateur redondant : motif/texture,
icône, ou label textuel ("Interdiction en vigueur" / "Aucune restriction" /
"Non couvert") visible au survol ou dans une légende, conforme aux critères
WCAG 2.1 AA sur le contraste et l'usage de la couleur.
**Justification** : Il s'agit d'une carte d'information publique ; l'exclure
d'une partie significative des utilisateurs par un simple choix de palette est
évitable et disqualifiant.

### Principe 5 : Simplicité d'architecture, même avec une API
**Règle** : Toutes les données (statuts par département, historique des
événements) DOIVENT être exposées via une API publique (voir Principe 9). Ceci
justifie l'introduction d'un backend, mais celui-ci DOIT rester aussi simple
que possible : API en lecture seule pour les consommateurs publics, stockage
pouvant rester un fichier de données structuré (JSON) tant que le volume reste
faible (~100 départements, quelques centaines à milliers d'événements par an),
sans authentification requise pour la consultation. La complexité
(base de données, cache, authentification) ne DOIT être ajoutée que si un
besoin concret l'exige (ex. saisie collaborative multi-utilisateurs, fort
trafic nécessitant un cache).
**Justification** : L'obligation d'API ne doit pas servir de prétexte à une
architecture backend surdimensionnée ; le principe de simplicité reste valable
pour tout ce qui n'est pas strictement requis par l'exposition des données.

### Principe 6 : Rigueur temporelle
**Règle** : Toutes les dates DOIVENT être stockées en ISO 8601 (UTC), et
affichées/calculées dans le fuseau Europe/Paris. Le calcul de l'état d'un
département à une date T DOIT gérer explicitement : arrêté sans date de fin
connue (considéré actif jusqu'à preuve du contraire), chevauchement de
plusieurs arrêtés sur une même période, et arrêté couvrant une portion de
journée.
**Justification** : Une erreur de fuseau horaire ou de gestion des bornes de
dates fausse directement la lecture historique, qui est la fonctionnalité
centrale du produit.

### Principe 7 : Transparence et fraîcheur des données
**Règle** : L'interface DOIT indiquer la date de dernière mise à jour du jeu
de données global, ainsi que, pour chaque événement, sa date de saisie dans le
système (distincte de la date de l'arrêté lui-même).
**Justification** : Permet à l'utilisateur d'évaluer la fiabilité et
l'actualité de ce qu'il consulte.

### Principe 8 : Ne remplace pas une vérification officielle
**Règle** : Le produit DOIT afficher une mention rappelant qu'il s'agit d'un
outil d'information et non d'une source juridique faisant foi, invitant à
vérifier auprès de la préfecture concernée ou du Recueil des Actes
Administratifs (RAA) en cas de doute.
**Justification** : Limite le risque qu'une donnée manquante, en retard, ou
mal interprétée soit prise pour une réalité juridique certaine.

### Principe 9 : Toutes les données DOIVENT être accessibles via une API
**Règle** : L'intégralité des données du projet (état courant de chaque
département, historique complet des événements, métadonnées de source) DOIT
être consultable via une API publique, versionnée (ex. `/api/v1/...`),
documentée (OpenAPI/Swagger), et distincte de l'interface web elle-même. La
carte et la réglette front-end DOIVENT elles-mêmes consommer cette API — pas
de jeu de données parallèle propre au front. L'API DOIT permettre au minimum :
lister les événements par département, obtenir l'état de tous les départements
à une date donnée, et récupérer l'historique complet d'un département sur un
intervalle.
**Justification** : Garantir une source de vérité unique (l'UI n'est qu'un
client parmi d'autres de l'API) et permettre la réutilisation des données par
des tiers (journalistes, chercheurs, autres applications) sans dépendre du
frontend.

### Principe 10 : Connecteurs de collecte indépendants et pluggables
**Règle** : Chaque source de données (une préfecture, ou un portail régional
groupant plusieurs préfectures) DOIT être implémentée comme un connecteur
indépendant, développé et testable isolément, dont la seule responsabilité est
de transformer la publication brute de sa source (PDF, page web, etc.) en
événements conformes au modèle de données commun (Principe 9). Le cœur de
l'application (API, historisation, carte) NE DOIT PAS supposer une source ou
un format unique, et l'ajout d'un nouveau connecteur NE DOIT PAS nécessiter de
modification du cœur applicatif. Chaque événement DOIT porter un champ
indiquant sa provenance (`connecteur_id`) et sa méthode de collecte
(automatique / saisie manuelle vérifiée).
**Justification** : Les recueils des actes administratifs (RAA) des
préfectures françaises ne sont pas centralisés — chaque préfecture ou portail
régional publie dans un format, une structure de site et une fréquence qui lui
sont propres, sans API nationale unifiée à ce jour. Une architecture rigide
empêcherait toute extension département par département et forcerait à
attendre une couverture complète avant de livrer quoi que ce soit.

---

## Contraintes techniques

- **Carte** : fond de carte des départements français (SVG ou TopoJSON),
  coloration dynamique calculée côté client à partir de la date sélectionnée,
  sur 3 états : vert (aucun arrêté actif), rouge (arrêté actif), gris (non
  couvert par un connecteur).
- **Modèle de données minimal** (par événement) :
  `departement_code`, `type_evenement` (interdiction | levee | prolongation),
  `date_debut`, `date_fin` (nullable), `reference_arrete`, `source_url`
  (optionnel), `date_saisie`, `connecteur_id`, `methode_collecte`
  (automatique | manuelle_verifiee).
- **Calendrier** : sélection d'une date unique ou d'un intervalle.
- **Réglette (slider)** : défilement jour par jour sur l'intervalle
  sélectionné, recalcul de la carte à chaque pas.
- **Tooltip au survol** : référence de l'arrêté + dates exactes de début/fin
  applicables au jour affiché.
- **API** :
  - Format : JSON, versionnée dans l'URL (`/api/v1/...`).
  - Endpoints minimaux :
    - `GET /api/v1/departements?date=YYYY-MM-DD` → état (vert/rouge/gris) de
      tous les départements à la date donnée, avec le connecteur associé pour
      les départements couverts.
    - `GET /api/v1/departements/{code}/evenements` → historique complet d'un
      département (tous les arrêtés, dates, références, sources), ou liste
      vide + statut "non couvert" si aucun connecteur n'existe pour ce
      département.
    - `GET /api/v1/evenements?debut=...&fin=...` → tous les événements sur un
      intervalle, tous départements confondus.
  - Lecture seule et publique (pas d'authentification pour la consultation),
    CORS ouvert pour permettre la réutilisation par des tiers.
  - Documentée via un schéma OpenAPI accessible publiquement.
  - Le frontend est un client de cette API comme un autre (aucune donnée
    embarquée directement dans le bundle front en dehors du fond de carte
    géographique statique).
- **Connecteurs** :
  - Un connecteur = un module autonome par source (préfecture ou portail
    régional), avec une interface commune en entrée (rien d'imposé) et une
    sortie normalisée (événements conformes au modèle de données du
    Principe 9).
  - Chaque connecteur est déployable, testable et désactivable indépendamment
    des autres.
  - Couverture progressive assumée dès la conception : au lancement, seuls
    quelques départements peuvent avoir un connecteur actif ; les autres sont
    affichés en gris ("non couvert"), jamais en vert par défaut (voir
    Principe 3).

## Workflow de développement

- Toute nouvelle fonctionnalité suit le cycle `/specify` → `/plan` → `/tasks`
  avant implémentation.
- Le calcul "état d'un département à la date T" DOIT être couvert par des
  tests unitaires incluant au minimum : absence d'arrêté, arrêté en cours sans
  date de fin, chevauchement de deux arrêtés, date exactement égale à une
  borne (début/fin).
- Toute donnée ajoutée (nouvel arrêté) DOIT être rattachée à une source
  identifiable (Principe 1) — pas de saisie non sourcée acceptée dans les jeux
  de données versionnés.
- Une donnée produite automatiquement par un connecteur (Principe 10) DOIT être
  publiée sans relecture humaine préalable lorsque son extraction est complète
  et non ambiguë. Elle DOIT en revanche être mise en attente de résolution par
  un opérateur, avant toute publication, lorsque l'extraction échoue, reste
  ambiguë (champ manquant, date illisible) ou révèle un doublon potentiel avec
  un événement déjà publié.
- Toute donnée saisie manuellement, hors d'un connecteur automatisé, DOIT
  toujours être relue/vérifiée avant fusion dans les jeux de données
  versionnés — cet assouplissement ne vaut que pour les connecteurs.

## Gouvernance

- Cette constitution prévaut sur toute décision contraire prise dans les
  specs, plans ou tâches.
- Toute modification suit le versionnage sémantique : **MAJOR** si un principe
  est supprimé ou radicalement redéfini, **MINOR** si un principe est ajouté,
  **PATCH** pour une clarification mineure.
- Toute modification est datée et justifiée dans ce document.

## Historique des amendements

- **2.3.0** (2026-08-12) : Assouplissement de la règle de relecture (Workflow
  de développement) — une donnée produite automatiquement par un connecteur
  peut être publiée sans relecture humaine si l'extraction est complète et non
  ambiguë ; la relecture/résolution par un opérateur reste obligatoire en cas
  d'anomalie (échec, ambiguïté, doublon potentiel) ou pour toute saisie
  manuelle hors connecteur.
- **2.2.0** (2026-08-10) : Passage d'un modèle 2 états (vert/rouge) à 3 états
  (vert/rouge/gris "non couvert") ; mise à jour des Principes 3 et 4, du
  modèle de données et des endpoints API en conséquence.
- **2.1.0** (2026-08-10) : Ajout du Principe 10 (connecteurs de collecte
  indépendants et pluggables) ; ajout de la section Connecteurs dans les
  contraintes techniques.
- **2.0.0** (2026-08-10) : Ajout du Principe 9 (exposition obligatoire des
  données via une API publique) ; redéfinition du Principe 5 (un backend est
  désormais requis, mais doit rester minimal) ; ajout de la section API dans
  les contraintes techniques.
- **1.0.0** (2026-08-10) : Version initiale (8 principes fondamentaux).
