# Frontend — Carte des arrêtés d'interdiction de rassemblements musicaux non déclarés

Application React 18 + Vite + TypeScript. Consomme exclusivement l'API publique du backend
(`../backend`) — aucun jeu de données parallèle en dehors du fond de carte statique (FR-011).

## Prérequis

- Node.js 20 LTS
- Le backend doit tourner sur `http://localhost:3000` (voir `../backend/README.md`), ou définir
  `VITE_API_BASE_URL` pour pointer ailleurs.

## Installation

```bash
npm install
```

## Lancement

```bash
npm run dev       # http://localhost:5173
npm run build     # build de production dans dist/
npm run preview   # sert le build de production localement
```

## Tests

```bash
npm run test:unit   # composants (Vitest + Testing Library)
npm run test:e2e     # parcours de bout en bout (Playwright ; démarre backend + frontend)
```

`npm run test:e2e` nécessite `npx playwright install` (téléchargement des navigateurs) au
préalable.

## Fond de carte

`src/assets/departements.topojson` est actuellement un **placeholder** généré
programmatiquement (grille de 101 carrés, un par département, avec les bons codes/noms) — voir
`src/assets/README.md` pour le détail et la procédure de remplacement par le tracé réel
(`gregoiredavid/france-geojson`).

## Constat d'environnement (transparence)

Ce projet a été généré dans un environnement d'exécution dont l'accès réseau sortant est
restreint (registre npm et `raw.githubusercontent.com` inaccessibles). `npm install`,
l'installation des navigateurs Playwright et l'exécution des suites de tests n'ont donc pas pu
être validés dans cet environnement — à faire en premier lieu après clonage sur une machine avec
accès réseau standard.
