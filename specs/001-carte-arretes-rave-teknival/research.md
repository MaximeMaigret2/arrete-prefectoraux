# Phase 0 — Research: Carte interactive des arrêtés rave/teknival

Ce document résout les inconnues du Technical Context du plan et documente les choix techniques structurants. Aucun marqueur `NEEDS CLARIFICATION` ne subsiste après cette phase.

## 1. Source des tracés géographiques des départements

**Decision**: Utiliser le jeu de données [`gregoiredavid/france-geojson`](https://github.com/gregoiredavid/france-geojson) (fichier `departements.geojson`, converti en TopoJSON pour le frontend) comme fond de carte statique.

**Rationale**: Dérivé des tracés IGN Admin Express (édition 2018) et des codes INSEE officiels, publié sous Licence Ouverte Etalab (réutilisation libre, y compris commerciale, avec mention de la source). Fournit directement les codes de département nécessaires pour joindre les données de l'API (`departement_code`). Une version simplifiée (`departements-version-simplifiee.geojson`) réduit le poids transféré au client, pertinent pour SC-001 (temps de consultation) sans sacrifier la lisibilité à l'échelle nationale.

**Alternatives considered**:
- Tracés IGN bruts (non simplifiés, 143 Mo) : rejeté, poids incompatible avec un chargement web rapide et inutile à l'échelle d'affichage visée.
- Natural Earth / OpenStreetMap extraits à la main : rejeté, nécessite un travail de conversion et de jointure aux codes INSEE non nécessaire alors qu'une ressource prête à l'emploi et correctement sourcée existe déjà.
- Appel à une API cartographique tierce à chaque chargement (ex. tuiles vectorielles dynamiques) : rejeté, complexité et dépendance externe disproportionnées pour un fond de carte statique aux contours qui ne changent quasiment jamais (Principe 5 : simplicité).

## 2. Librairie de rendu cartographique interactif

**Decision**: `react-simple-maps` (wrapper de `d3-geo` + `topojson-client`) pour le rendu SVG des départements, avec gestion du survol/coloration au niveau composant React.

**Rationale**: API déclarative adaptée à React, consomme directement du TopoJSON, ne verrouille pas à un fond de carte particulier (le TopoJSON dérivé de france-geojson peut être utilisé tel quel). Le rendu SVG permet d'attacher facilement des motifs/textures par état (Principe 4, FR-002) via des `<pattern>` SVG, contrairement à une solution en tuiles raster (Leaflet) plus adaptée au zoom géographique fin, non requis ici (carte nationale figée, pas de panoramique/zoom profond attendu).

**Alternatives considered**:
- D3.js pur (sans wrapper React) : rejeté, plus verbeux à intégrer proprement dans le cycle de vie React (gestion manuelle du DOM en dehors du virtual DOM) pour un bénéfice marginal ici.
- Leaflet + GeoJSON : rejeté, orienté cartographie avec tuiles/zoom/panoramique, fonctionnalités non demandées par le spec (carte nationale statique, pas de navigation géographique) ; alourdirait inutilement le bundle.
- Bibliothèque de graphique généraliste (Chart.js, Recharts) : rejeté, pas de support choroplèthe géographique natif adapté à des polygones de département.

## 3. Stockage des données

**Decision**: Fichiers JSON versionnés (un fichier d'événements par département sous `backend/src/data/events/`, plus un registre `connecteurs.json`), chargés en mémoire au démarrage du serveur backend et recalculés à la demande à chaque requête.

**Rationale**: Conforme au Principe 5 de la constitution — le volume attendu (101 départements, quelques centaines à milliers d'événements par an) reste largement dans les capacités d'un chargement en mémoire, sans les coûts opérationnels d'une base de données (migration, connexion, sauvegarde) pour un besoin qui n'existe pas encore (pas de saisie concurrente multi-utilisateurs dans le périmètre de cette feature, voir Assumptions du spec). Le format JSON reste lisible et diffable dans un historique git, ce qui sert aussi le Principe 1 (traçabilité) et facilite la relecture avant fusion mentionnée dans la constitution.

**Alternatives considered**:
- SQLite : rejeté à ce stade — apporte des index et des transactions non nécessaires au volume actuel, mais reste l'option de repli documentée si le volume ou les besoins de concurrence augmentent (ex. connecteurs automatiques écrivant en parallèle).
- PostgreSQL / base managée : rejeté, surdimensionné et contraire explicitement au Principe 5 tant qu'aucun besoin concret ne l'exige.

## 4. Framework backend / exposition de l'API

**Decision**: Fastify 4.x avec `@fastify/swagger` (génération du schéma OpenAPI depuis les schémas de route) et `@fastify/cors` (CORS ouvert).

**Rationale**: Fastify offre une validation de schéma native rapide (utile pour valider les paramètres `date`, `debut`, `fin` de FR-010) et une génération d'OpenAPI intégrée qui répond directement à FR-009 sans outillage supplémentaire. Empreinte mémoire et complexité faibles, cohérent avec le Principe 5.

**Alternatives considered**:
- Express + `swagger-jsdoc` : rejeté, la documentation OpenAPI doit être maintenue séparément du code de route (source de dérive), alors que Fastify la dérive des schémas de validation eux-mêmes.
- NestJS : rejeté, framework orienté architecture modulaire/DI pensé pour des backends plus complexes ; disproportionné pour 3 endpoints en lecture seule.

## 5. Gestion des dates et fuseaux horaires

**Decision**: Stockage en ISO 8601 UTC dans les fichiers JSON ; conversion et affichage en Europe/Paris via `date-fns` + `date-fns-tz` côté frontend, et calculs de bornes de jour effectués côté backend en tenant explicitement compte du fuseau Europe/Paris avant comparaison aux événements.

**Rationale**: Répond directement au Principe 6 (rigueur temporelle). `date-fns-tz` est une extension légère de `date-fns` (déjà retenu pour la manipulation de dates du calendrier/réglette), évite d'introduire une deuxième dépendance de dates. Le calcul de l'état à une date T doit convertir la date "jour civil Europe/Paris" sélectionnée par l'utilisateur en bornes UTC avant de la comparer aux `date_debut`/`date_fin` des événements — logique isolée dans `computeDepartementState` et couverte par les tests unitaires exigés par la constitution (chevauchement, sans fin, borne exacte).

**Alternatives considered**:
- Luxon : rejeté, fonctionnalité équivalente à date-fns + date-fns-tz pour ce besoin, pas de raison d'ajouter une dépendance différente de celle déjà choisie pour les composants calendrier.
- API `Temporal` (proposition TC39) : rejeté pour cette itération, support navigateur encore inégal en 2026 sans polyfill ; à réévaluer une fois stabilisé nativement.

## 6. Composants calendrier et réglette

**Decision**: `react-day-picker` pour la sélection de date unique / intervalle, `@radix-ui/react-slider` (primitive accessible, sans style imposé) pour la réglette jour-par-jour.

**Rationale**: Les deux bibliothèques exposent des primitives accessibles au clavier et compatibles lecteurs d'écran par défaut, cohérent avec l'exigence WCAG 2.1 AA du Principe 4 (qui porte explicitement sur la carte mais dont l'esprit s'applique à l'ensemble de l'interface). `react-day-picker` supporte nativement le mode "range" nécessaire à la sélection d'intervalle du spec (US2).

**Alternatives considered**:
- Composants natifs HTML (`<input type="date">`, `<input type="range">`) : envisagé comme option plus simple encore (moins de dépendances) ; non retenu comme choix par défaut car le support du mode "intervalle" et la personnalisation du pas "jour" sont plus limités nativement, mais reste une alternative de repli si la complexité de dépendances devient un problème.
- Bibliothèque de composants complète (MUI, Ant Design) : rejeté, importer un design system entier pour deux composants est disproportionné (Principe 5, appliqué par analogie au frontend).

## 7. Stratégie de test

**Decision**: Vitest (tests unitaires backend et frontend), Supertest (tests de contrat des endpoints API), Playwright (tests de bout en bout des parcours utilisateurs du spec).

**Rationale**: Couvre explicitement l'exigence de la constitution : tests unitaires du calcul d'état incluant absence d'arrêté, arrêté sans fin, chevauchement, date exactement égale à une borne. Les tests de contrat garantissent SC-005 (réponse API identique à ce qu'affiche la carte). Playwright permet de valider US1 à US3 de bout en bout (chargement carte → sélection date/intervalle → réglette → survol).

**Alternatives considered**:
- Jest : rejeté au profit de Vitest, plus rapide et sans configuration supplémentaire dans un projet Vite déjà retenu pour le frontend.
- Cypress : rejeté au profit de Playwright pour le end-to-end, support multi-navigateurs natif équivalent avec une API considérée plus moderne pour ce projet.
