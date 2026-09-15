# Carte des Arrêtés Rave/Teknival

Application web qui affiche une carte interactive de la France, département par département,
indiquant si un arrêté préfectoral interdisant les rassemblements musicaux non déclarés (rave
parties, teknivals, free parties) est actuellement en vigueur.

## Le problème

Il n'existe ni API nationale, ni format commun : chacune des 96+ préfectures françaises publie
son propre Recueil des Actes Administratifs (RAA) en PDF, sur son propre site, avec sa propre
structure HTML. Ce projet construit et maintient un connecteur par préfecture pour collecter,
historiser et exposer ces données de façon uniforme.

## Fonctionnalités

- **Carte interactive** : code couleur par département (🟢 pas d'arrêté actif · 🔴 arrêté actif ·
  ⚪ département non couvert par un connecteur — jamais assimilé à "pas d'interdiction")
- **Historique jour par jour** : curseur temporel pour visualiser l'état à une date donnée
- **Calendrier** avec infobulles indiquant les dates exactes des arrêtés
- **API publique en lecture seule** exposant l'état des départements et l'historique complet des
  événements

## Architecture

Monorepo à deux applications, consommant un jeu de données JSON versionné et historisé (aucune
base de données) :

```
backend/    API publique en lecture seule (Fastify + TypeScript)
frontend/   Carte interactive (React 18 + Vite + TypeScript)
specs/      Spécifications, plans et contrats (méthodologie Spec Kit)
```

Principes directeurs :

- **Connecteurs enfichables** : un connecteur par préfecture (96 au total, 95+ implémentés à ce
  jour), avec ses propres sélecteurs et son propre parsing PDF
- **Historisation en écriture seule (append-only)** : rien n'est écrasé, tout est traçable
- **Traçabilité de la source** : chaque événement référence le document/l'URL dont il provient
- **Neutralité factuelle et politique** : le projet ne fait que refléter l'état légal publié par
  chaque préfecture
- **Absence de connecteur ≠ absence d'interdiction** : un département non couvert s'affiche en
  gris, jamais en vert

Voir `backend/README.md` et `frontend/README.md` pour l'installation et le lancement de chaque
application, et le dossier `specs/` pour le détail des spécifications par fonctionnalité.

## Démarrage rapide

Prérequis : Node.js 20 LTS.

```bash
# Backend — http://localhost:3000
cd backend && npm install && npm run dev

# Frontend — http://localhost:5173 (dans un autre terminal)
cd frontend && npm install && npm run dev
```

## État du projet

Projet en développement actif. La collecte s'exécute quotidiennement de façon automatisée sur les
connecteurs actifs ; la fiabilité réseau des campagnes de rattrapage (backfill) historique reste un
sujet de travail en cours (voir `specs/008-isolation-echecs-backfill/`).
