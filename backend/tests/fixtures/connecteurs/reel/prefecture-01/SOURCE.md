# Source réelle — prefecture-01 (Ain)

**Capturé le** : 2026-08-14, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu — pas un simple `fetch`, pour être sûr de voir la structure serveur telle qu'un scraper `fetch`+cheerio la verrait aussi).

**URL réelle** : `https://www.ain.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA`

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- Chaque année mène à une page listant une carte par mois, format `{numéro}-{MOIS_FR}` (ex. `08-AOUT`, majuscules sans accent) — même famille de structure que prefecture-33 (Gironde), mais découpage mensuel au lieu d'annuel-plat.
- Chaque page de mois liste les bulletins RAA en liste PLATE (`div.fr-text--lead > div`), lien direct vers le PDF (`a.fr-link--download`, même lien porte le titre et l'URL) — pas de page de détail intermédiaire, comme prefecture-13.
- Texte du lien : `"Télécharger <nom-de-fichier> du <date>"` — ne contient jamais de mot-clé rave/teknival, même quand le bulletin en contient un.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`à compter du DD/MM/YYYY`, `jusqu'au DD/MM/YYYY`, `Arrêté n° ...`, conformes aux patterns de `prefecture-01.yaml`), mais la formulation exacte d'un vrai bulletin RAA de l'Ain reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-01.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation année → mois → PDF → scan de contenu), pas la formulation exacte du texte réglementaire.
