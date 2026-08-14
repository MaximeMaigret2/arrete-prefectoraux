# Source réelle — prefecture-09 (Ariège)

**Capturé le** : 2026-08-14, par `fetch` direct (accès réseau sortant disponible depuis le sandbox cloud vers ce domaine).

**URL réelle** : `https://www.ariege.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Ce qui a été vérifié en direct

- Page racine listant TROIS collections d'archives successives ("Archives (avant le 1er novembre 2012)", "...à partir du 1er novembre 2012", "...à partir du 28 avril 2015") — la plus récente est la seule encore alimentée aujourd'hui (vérifié : contient un mois "Août 2026"). D'où un `pattern_lien` **littéral fixe** (pas de placeholder de date) pour la 1ère étape de `navigation` — ce segment d'URL ne varie jamais avec la date de collecte, à la différence d'un lien "carte de l'année".
- Cette collection liste une carte par mois (href se terminant par `-mois-Aout-2026`, donc par `-Aout-2026`), PAGINÉE mais en ordre chronologique **DÉCROISSANT** (le mois courant en tête de la page 1) — comme prefecture-06/08/10, aucune étape "dernière page" nécessaire ici (contrairement à prefecture-02/05).
- La carte du mois mène à la liste finale, en PLATE (`.fr-downloads-group ul li`), non paginée (7 bulletins pour août 2026 au moment de la capture, tous sur une seule page).
- **Bug de markup réel confirmé sur les 7 liens de cette page** : `<a id= class="fr-link fr-link--download" href="...">` (id vide, casse `class` — même bug que prefecture-05/07). `selecteur_titre`/`selecteur_lien_pdf` de `prefecture-09.yaml` ciblent donc `a[href$='.pdf']`.
- Texte du lien (`"Télécharger recueil-09-2026-124-recueil-des-actes-administratifs-special"`) : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` (`Arrêté n° 09-2026-08-124`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-09.yaml`), mais la formulation exacte d'un vrai bulletin RAA de l'Ariège reste à confirmer avant mise en production.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-09.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → collection fixe → mois → liste plate `fr-downloads-group` → PDF direct par `href` en contournant le bug `class` → scan de contenu), pas la formulation exacte du texte réglementaire.
