# Source réelle — prefecture-10 (Aube)

**Capturé le** : 2026-08-14, par `fetch` direct (accès réseau sortant disponible depuis le sandbox cloud vers ce domaine).

**URL réelle** : `https://www.aube.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA2` (voir correction de `point_acces` ci-dessous).

## Correction du `point_acces` par rapport au registre des sources initial

L'URL enregistrée le 2026-08-13 par recherche web (`.../Publications/RAA-Recueil-des-Actes-Administratifs`) redirige aujourd'hui (redirection serveur HTTP, suivie automatiquement par `curl -L` / `fetch`) vers `.../Publications/Recueil-des-Actes-Administratifs-RAA2` — c'est cette URL réelle, confirmée par un fetch direct (code HTTP 200 après redirection), qui est utilisée comme `url_liste` dans `prefecture-10.yaml` et `registre-sources.yaml`. Même situation que prefecture-04 en Phase 5bis élargie.

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- La page de l'année est DÉJÀ la liste finale, en PLATE : chaque bulletin ("RAA n°194 du 13 août 2026") est une carte `.fr-card` dont le titre EST le nom du fichier PDF et dont `.fr-card__title a` porte directement le lien PDF — pas de découpage par mois, pas de page de détail intermédiaire. Un seul niveau de `navigation` suffit, le plus simple des 5 connecteurs de cette session avec prefecture-08.
- La page est PAGINÉE (10 par page) mais en ordre chronologique **DÉCROISSANT** : la page 1 contient déjà les bulletins les plus récents (dates décroissantes 13→12→11→10→7→7 août sur cette seule page, vérifié) — comme prefecture-06/08/09, aucune étape "dernière page" nécessaire (contrairement à prefecture-02/05).
- Texte du lien (`"RAA n°194 du 13 août 2026"`) : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` (`Arrêté n° 10-2026-08-194`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-10.yaml`), mais la formulation exacte d'un vrai bulletin RAA de l'Aube reste à confirmer avant mise en production.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-10.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → liste annuelle plate déjà en ordre décroissant → PDF direct → scan de contenu), pas la formulation exacte du texte réglementaire.
