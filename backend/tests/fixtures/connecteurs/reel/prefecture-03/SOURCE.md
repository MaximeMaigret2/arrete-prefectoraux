# Source réelle — prefecture-03 (Allier)

**Capturé le** : 2026-08-14, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu).

**URL réelle** : `https://www.allier.gouv.fr/Publications/Recueil-des-actes-administratifs-arretes`

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- Le lien de cette carte redirige (redirection HTTP standard, suivie nativement par `fetch`) vers une page qui liste déjà TOUTES les publications de l'année en liste PLATE, sans pagination ni découpage par mois — comme prefecture-13. Un seul niveau de `navigation` suffit donc : la redirection serveur fait le reste sans qu'aucune étape supplémentaire ne soit nécessaire côté configuration. Dans cette fixture, `fetch` étant mocké par URL, l'URL de la carte année sert directement le contenu de la page finale (équivalent fonctionnel de la redirection suivie).
- Chaque bulletin (`div.fr-col-12.fr-col-md-8 > div`) porte un lien `a.fr-link--download` qui est à la fois le titre ET l'URL du PDF — comme prefecture-13.
- Le texte du lien ("recueil nominatif édité le 05 janvier 2026") ne mentionne jamais le contenu — seul le scan du texte du PDF permet de décider de la pertinence.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF. Les 2 PDF de cette fixture sont donc **synthétiques** (reportlab) — la formulation exacte d'un vrai bulletin RAA de l'Allier reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-03.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (année → redirection → liste plate → PDF → scan de contenu), pas la formulation exacte du texte réglementaire.
