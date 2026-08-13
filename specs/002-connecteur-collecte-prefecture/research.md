# Phase 0 — Research: Connecteurs de collecte automatique des arrêtés préfectoraux

Ce document résout les inconnues du Technical Context du plan et documente les choix techniques structurants. Aucun marqueur `NEEDS CLARIFICATION` ne subsiste après cette phase.

## 1. Architecture des connecteurs (moteurs génériques par type + configuration)

**Decision**: Les connecteurs sont découpés en deux couches strictement séparées :

1. **Un moteur générique par type de source**, implémenté une seule fois sous `backend/src/connecteurs/moteurs/<type>/moteur.ts`. Chaque moteur sait, de façon générique, récupérer sa source et en extraire des candidats, piloté entièrement par une **configuration déclarative** (sélecteurs CSS, patterns de dates, mots-clés de filtrage — détail dans `contracts/connecteur-interface.md`).
2. **Une configuration par connecteur concret** (une préfecture ou un portail régional), sous `backend/src/connecteurs/configs/<id>.yaml`, qui ne contient aucun code — seulement les paramètres nécessaires au moteur de son `type_connecteur` pour cibler et interpréter cette source précise.

**L'inventaire des types n'est pas figé par ce plan.** Seuls `page_web` et `pdf` sont retenus dès maintenant, parce que ce sont les deux formats explicitement exigés par le spec (FR-003, FR-004, FR-005). Le spec précise lui-même (Assumptions) que « le découpage technique des connecteurs par type de source ... sera précisé lors de `/speckit-plan` » sans imposer de liste — et l'US1 (registre des sources) est explicitement le préalable qui doit, département par département, faire l'inventaire réel des formats de publication rencontrés avant qu'un connecteur ne soit développé. Ce plan fixe donc le *patron* (moteur générique + configuration), pas la liste finale des types : tout type supplémentaire (ex. un flux structuré, si l'analyse du registre en révèle un pour un portail donné) sera ajouté au moment où un besoin réel et concret apparaît, en suivant exactement le même patron (nouveau dossier sous `connecteurs/moteurs/`, nouveau schéma de configuration, nouvelle valeur de `type_connecteur`), sans jamais toucher au `runner`, à l'API ou à la carte.

Le `registry.ts` instancie chaque connecteur actif en chargeant sa configuration et en l'associant au moteur de son type ; l'objet résultant expose la même interface commune qu'avant (`collecter(): Promise<ResultatCollecte>`) consommée par `runner.ts`, qui reste, lui, totalement inchangé et ignorant du type sous-jacent :

```ts
interface Connecteur {
  id: string;
  departements: string[];
  collecter(): Promise<ResultatCollecte>; // fetch + extract, ne publie rien lui-même
}
```

**Rationale**: Répond au Principe 10 (connecteurs indépendants, testables isolément, ajout sans modification du cœur applicatif) tout en répondant à la demande explicite de généricité et de lisibilité : la plupart des sources préfectorales se ramènent en pratique à un petit nombre de mécaniques (scraper une page RAA + suivre un lien PDF, télécharger un PDF directement, ou consommer un flux structuré) plutôt qu'à une variabilité réellement infinie. Factoriser le code par **type** plutôt que par préfecture élimine la duplication entre connecteurs similaires (même logique de reconnaissance de dates françaises, même gestion des erreurs, mêmes tests du moteur), et rend chaque connecteur concret lisible en un coup d'œil : un court fichier de configuration déclaratif, sans logique métier à relire. Deux connecteurs du même type se comportent nécessairement de façon homogène puisqu'ils partagent le même moteur — un bug corrigé dans un moteur profite à tous ses connecteurs. Chaque moteur reste testable unitairement avec des fixtures HTML/PDF figées, sans réseau (§9).

**Alternatives considered**:
- Un module TypeScript bespoke et autonome par préfecture, sans moteur partagé par type (option initialement envisagée) : rejeté — duplique la logique d'extraction (dates, regex de référence) entre connecteurs similaires, rend chaque nouveau connecteur plus coûteux à relire/auditer et plus sujet à divergence de comportement entre deux sources pourtant structurellement identiques, contraire à la demande de généricité et de lisibilité.
- Un moteur générique unique, universel, pour tous les types de source confondus (un seul schéma de configuration "à tout faire") : rejeté — les mécaniques de récupération (parcourir une page HTML vs télécharger un PDF isolé, et potentiellement d'autres à découvrir) sont trop différentes pour être exprimées proprement dans un schéma de configuration unique sans que celui-ci devienne un mini-langage complexe et peu lisible (Principe 5). Scinder par type garde chaque schéma de configuration simple, court et spécifique à sa mécanique.
- Anticiper et construire dès ce plan un moteur pour des types de source non encore confirmés par une source réelle (ex. un moteur `api` générique "au cas où") : rejeté — construirait un schéma de configuration spéculatif avant qu'aucune source concrète n'en ait révélé la forme exacte (contraire au Principe 5, et à l'ordre US1 → US2 du spec lui-même : le registre des sources précède et documente le connecteur, pas l'inverse). Le patron moteur+configuration reste identique le jour où un tel besoin est confirmé ; seul son schéma précis, propre à la source réellement rencontrée, ne peut être écrit à l'avance sans risquer de devoir le refaire.
- Un script unique par connecteur, autonome de bout en bout (fetch → publish, sans passer par un runner commun) : rejeté, dupliquerait en plus la logique de détection de doublons/anomalies dans chaque connecteur, avec un risque de divergence contraire au Principe 1 (fidélité).

## 2. Récupération de la publication brute (HTTP)

**Decision**: `fetch` natif de Node 20 (aucune dépendance supplémentaire) pour récupérer pages HTML et fichiers PDF binaires (`arrayBuffer()`).

**Rationale**: Node 20 LTS (déjà la cible du projet) expose `fetch` nativement ; suffisant pour de simples requêtes GET vers des sites publics, sans session ni JavaScript côté client à exécuter (Principe 5 : pas de dépendance supplémentaire pour un besoin déjà couvert par le runtime).

**Alternatives considered**:
- `axios` : rejeté, apporte des fonctionnalités (intercepteurs, annulation avancée) non nécessaires ici alors que `fetch` natif suffit.
- Navigateur headless (Playwright/Puppeteer) pour sites nécessitant du JavaScript : rejeté par défaut — non requis par les sources RAA connues (pages HTML statiques ou PDF téléchargeables) ; à réévaluer connecteur par connecteur si une préfecture spécifique l'exige (le registre des sources, §3, documente ce cas au besoin), sans imposer cette dépendance à tous les connecteurs.

## 3. Extraction du texte HTML

**Decision**: `cheerio` pour parser le HTML récupéré et cibler les éléments pertinents (liens vers PDF, tableaux de publications) via sélecteurs CSS.

**Rationale**: API légère de type jQuery côté serveur, largement utilisée pour du scraping ciblé sans exécution de JavaScript ; chaque connecteur définit ses propres sélecteurs adaptés à la structure de sa source, cohérent avec l'indépendance des connecteurs (Principe 10).

**Alternatives considered**:
- Expressions régulières directes sur le HTML brut : rejeté, fragile face à des variations mineures de balisage, plus difficile à maintenir par connecteur.
- `jsdom` : rejeté, empreinte mémoire/CPU plus lourde qu'utile pour une simple extraction de liens/texte sans manipulation du DOM interactive.

## 4. Extraction du texte PDF

**Decision**: `pdf-parse` pour extraire le texte brut d'un PDF téléchargé, puis expressions régulières/heuristiques par connecteur pour repérer référence, dates, autorité signataire dans ce texte.

**Rationale**: Bibliothèque simple et largement adoptée pour l'extraction de texte PDF en Node, sans dépendance native lourde. Couvre exactement le besoin de FR-004 (PDF avec texte extractible). Conforme à FR-005 : si le texte extrait est vide ou insuffisant (PDF scanné/image), le connecteur le détecte (chaîne vide ou trop courte) et déclare un échec de lecture — aucune tentative d'OCR n'est introduite, explicitement hors périmètre.

**Alternatives considered**:
- `pdfjs-dist` (moteur de Firefox) : rejeté, API plus bas niveau et plus lourde à intégrer pour un simple besoin d'extraction de texte séquentiel.
- OCR (`tesseract.js` ou équivalent) : explicitement rejeté par le spec (FR-005) — hors périmètre de cette feature.

## 5. Détection de doublons (FR-010)

**Decision**: Règle heuristique appliquée par le `runner` (pas par chaque connecteur) avant publication : un candidat est un doublon potentiel s'il existe déjà, pour le même `departement_code`, un événement publié dont (a) la `reference_arrete` est identique ou très proche (distance de Levenshtein normalisée en dessous d'un seuil, pour tolérer une erreur de casse/espace d'extraction), **ou** (b) l'intervalle `[date_debut, date_fin ?? +∞)` chevauche fortement (>50 %) celui du candidat. Dans les deux cas → anomalie de collecte plutôt que publication automatique.

**Rationale**: Répond à FR-010 sans confier cette décision à chaque connecteur (qui n'a pas connaissance de l'historique déjà publié) ; centraliser la règle dans le runner garantit un comportement homogène quelle que soit la source (Principe 1, cohérence des règles de publication).

**Alternatives considered**:
- Comparaison stricte uniquement sur `reference_arrete` identique : rejeté, une extraction automatique peut légèrement mal lire une référence (espace, tiret) — un seuil de similarité réduit les faux négatifs sans complexifier l'algorithme.
- Détection par apprentissage automatique / similarité sémantique du texte source : rejeté, disproportionné (Principe 5) pour un besoin résolu efficacement par une règle simple et explicable — ce qui compte aussi pour la traçabilité de la décision (Principe 1).

## 6. Ordonnancement de la collecte quotidienne (FR-013, FR-014)

**Decision**: `node-cron`, exécuté en tâche de fond dans le même processus backend Fastify déjà en place, planifié une fois par jour (heure creuse, ex. 05:00 Europe/Paris). Déclenchement manuel (FR-014) via un endpoint admin authentifié qui invoque directement le même `runner` pour un connecteur donné, hors du cycle planifié.

**Rationale**: Évite d'introduire une infrastructure d'ordonnancement séparée (queue de jobs, service cron externe) pour un besoin d'une exécution par jour sur un nombre de connecteurs restant modeste (Principe 5). Le déclenchement manuel réutilise exactement le même code que le cycle automatique (un seul chemin d'exécution testé), limitant le risque de divergence de comportement.

**Alternatives considered**:
- Cron système (crontab) appelant un script Node séparé : rejeté, ajoute une dépendance opérationnelle à l'environnement de déploiement (configuration crontab hors du dépôt applicatif) sans bénéfice net face à un scheduler in-process pour ce volume.
- File de tâches (BullMQ + Redis) : rejeté, surdimensionné — aucun besoin de reprise sur erreur distribuée ni de traitement concurrent à haut volume à ce stade (Principe 5).

## 7. Authentification de l'espace de résolution (FR-015)

**Decision**: HTTP Basic Auth (`@fastify/basic-auth`) sur le sous-groupe de routes `/api/v1/admin/*`, identifiants stockés en variable d'environnement (un seul compte, pas de gestion multi-utilisateurs — conforme à l'Assumption du spec). Le frontend expose une page `/admin` distincte qui s'appuie sur le challenge natif du navigateur (aucune gestion de session/JWT côté frontend à développer).

**Rationale**: Répond à FR-015 (authentification dédiée, indépendante de l'API publique) avec la complexité minimale suffisante pour un compte unique, conformément au Principe 5 ("la complexité ne doit être ajoutée que si un besoin concret l'exige" — ici le besoin concret est l'accès à l'espace de résolution, pas la consultation publique qui reste inchangée). N'affecte en rien les endpoints publics existants (`/api/v1/departements`, `/api/v1/evenements`), qui restent sans authentification.

**Alternatives considered**:
- Session + cookie avec formulaire de connexion : rejeté, complexité de gestion de session non justifiée pour un compte unique.
- JWT avec service d'identité externe : rejeté, largement disproportionné (Principe 5) pour un seul opérateur.

## 8. Stockage des nouvelles entités (anomalies, exécutions, registre des sources)

**Decision**: Extension du même mécanisme fichier JSON déjà en place (§3 de `specs/001/research.md`) :
- `backend/src/data/anomalies.json` : liste des anomalies de collecte (append-only en pratique ; une résolution modifie le statut d'une entrée existante plutôt que la supprimer, pour conserver la trace de la décision — cf. FR-016).
- `backend/src/data/executions.json` : journal des exécutions de collecte (append-only strict, une entrée par run de connecteur — Principe 2 appliqué par analogie).
- `backend/src/data/registre-sources.yaml` : registre des sources, au format **YAML** plutôt que JSON.

**Rationale**: Reste cohérent avec le Principe 5 et le choix déjà fait pour les événements/connecteurs. Le registre des sources est explicitement décrit dans le spec comme « un artefact léger tenu à jour manuellement » (Assumptions) : le YAML est plus lisible et éditable à la main (commentaires possibles, syntaxe moins verbeuse) qu'un JSON strict, ce qui sert directement FR-018 (mise à jour indépendante du code). La dépendance `js-yaml` est déjà présente dans `backend/package.json` (devDependencies), confirmant ce choix comme cohérent avec la trajectoire déjà engagée du projet.

**Alternatives considered**:
- Registre au format JSON, aligné mécaniquement sur `connecteurs.json` : rejeté au profit du YAML pour la lisibilité/éditabilité manuelle (FR-018), le registre n'étant pas consommé par un chemin de code aussi performance-sensible que les événements.
- Base de données pour les anomalies (au lieu de fichier JSON) : rejeté, le volume attendu d'anomalies (exceptions à la collecte automatique, minoritaires par construction — FR-007) reste très inférieur au seuil justifiant une base de données (Principe 5).

## 9. Stratégie de test des connecteurs

**Decision**: Fixtures HTML/PDF statiques versionnées sous `backend/tests/fixtures/connecteurs/<type>/` pour les tests unitaires **des moteurs** (pas d'appel réseau réel dans les tests) — chaque moteur (`page_web`, `pdf`, et tout type ajouté ultérieurement) est testé une seule fois de façon générique, avec plusieurs configurations de test représentatives, plutôt qu'un jeu de tests dupliqué par préfecture. Les configurations concrètes (`connecteurs/configs/<id>.yaml`) sont elles-mêmes validées par un test de schéma (zod) qui tourne sur tous les fichiers de config présents, pour détecter une configuration mal formée sans avoir à exécuter une collecte réelle. Tests d'intégration du `runner` avec un connecteur factice (« fake connector ») couvrant les 3 chemins : publication directe, anomalie (champ manquant/doublon), échec de lecture. Tests de contrat (Supertest) pour les nouveaux endpoints admin, y compris le rejet sans authentification (401).

**Rationale**: Prolonge la stratégie de test déjà retenue (`specs/001/research.md` §7 : Vitest + Supertest) sans introduire de nouvel outil. Des fixtures figées rendent les tests d'extraction déterministes et indépendants de la disponibilité réelle des sites de préfectures. Tester le moteur plutôt que chaque connecteur individuellement est la conséquence directe de la généricité par type (§1) : un connecteur concret n'ajoute qu'une configuration, dont la correction est vérifiée par la validation de schéma plutôt que par une suite de tests dédiée.

**Alternatives considered**:
- Tests d'intégration frappant les vraies sources en ligne : rejeté, non déterministe (site indisponible, contenu changeant) et contraire à des tests reproductibles en CI.
