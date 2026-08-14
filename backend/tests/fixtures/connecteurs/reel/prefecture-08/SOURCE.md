# Source réelle — prefecture-08 (Ardennes)

**Capturé le** : 2026-08-14, par `fetch` direct (accès réseau sortant disponible depuis le sandbox cloud vers ce domaine).

**URL réelle** : `https://www.ardennes.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Ce qui a été vérifié en direct

- Page racine listant plusieurs cartes, dont "Les actes administratifs de l'année 2026" (href se terminant par `-annee-2026`, donc par `-2026`) — à distinguer de la carte "années antérieures" qui ne se termine jamais par une année.
- Cette carte mène DIRECTEMENT à la liste complète et déjà PLATE des 258 bulletins de l'année (vérifié : `.fr-col-md-8 li` → 258 correspondances, exactement le nombre de liens `.pdf` sur la page) — **aucun découpage par mois dans l'URL** (les mois n'apparaissent que comme intertitres visuels `<b>Août 2026</b>` au sein de la même page), **aucune pagination**. Un seul niveau de `navigation` suffit, le plus simple des 5 connecteurs de cette session avec prefecture-10.
- Ordre chronologique **DÉCROISSANT** (le mois courant, août 2026, en tête de page).
- **Bug de markup partiel confirmé** : 129 des 258 liens de téléchargement portent le bug `<a id= class="fr-link fr-link--download">` (id vide, casse `class`) — mais pas tous (certains ont un id hexadécimal valide). `selecteur_titre`/`selecteur_lien_pdf` ciblent donc `a[href$='.pdf']` de façon uniforme plutôt que de dépendre d'une classe tantôt cassée, tantôt intacte.
- Texte du lien (`"Télécharger RAA 8-2026-129 du 12 aout 2026"`) : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` (`Arrêté n° 08-2026-08-129`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-08.yaml`), mais la formulation exacte d'un vrai bulletin RAA des Ardennes reste à confirmer avant mise en production.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-08.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → liste annuelle plate → PDF direct par `href` en contournant le bug `class` intermittent → scan de contenu), pas la formulation exacte du texte réglementaire.
