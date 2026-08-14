# Source réelle — prefecture-13 (Bouches-du-Rhône)

**Capturé le** : 2026-08-13, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu — pas un simple `fetch`, pour être sûr de voir la structure serveur telle qu'un scraper `fetch`+cheerio la verrait aussi, ce site ne dépendant pas du JS pour son contenu).

**URL réelle** : `https://www.bouches-du-rhone.gouv.fr/Publications/RAA-et-Archives/RAA-2026`
(l'ancienne `url_liste` de `prefecture-13.yaml`, `.../Publications/RAA-et-Archives`, n'est que la page d'index qui renvoie vers cette page — pas la liste elle-même.)

## Ce qui a été vérifié en direct

- Page **plate**, sans découpage par mois : 273 bulletins pour l'année 2026 au moment de la capture, tous sur cette seule URL.
- Chaque bulletin est un lien `a.fr-link--download` (attribut `id` aléatoire, sans intérêt), dans un conteneur `div.fr-text--lead.fr-my-3w > div` (le `div` per-item n'a pas de classe — le sélecteur doit passer par le parent).
- Texte du lien : `"Télécharger <nom-de-fichier> du <date>"` — **ne contient jamais** de mot-clé rave/teknival, même quand le bulletin en contient un : ce sont des bulletins compilés ("RAA SPECIAL", "RAA NOMINATIFS"...), pas un arrêté par entrée.
- Un `span.fr-link__detail` à l'intérieur du lien donne `"PDF - <taille> - <date>"`.
- `href` = lien PDF direct (pas de page de détail intermédiaire).

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF depuis le navigateur (le fetch direct de fichiers `.pdf` depuis l'environnement sandbox est bloqué, et `javascript_tool` ne retourne que du texte/JSON). Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (contenant `à compter du DD/MM/YYYY`, `jusqu'au DD/MM/YYYY`, `Arrêté n° ...`, conformes aux patterns de `prefecture-13.yaml`), mais la formulation exacte d'un vrai bulletin RAA des Bouches-du-Rhône (mise en page, formulation juridique précise) reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent contenant un arrêté connu (rave/teknival ou autre) et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-13.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (liste plate → PDF → scan de contenu), pas la formulation exacte du texte réglementaire.
