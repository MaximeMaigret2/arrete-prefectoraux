# Source réelle — prefecture-33 (Gironde)

**Capturé le** : 2026-08-13, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu — ce site DSFR ne dépend pas du JS pour son contenu, un `fetch`+cheerio verrait la même structure).

**URL réelle (racine)** : `https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

## Ce qui a été vérifié en direct

- **3 niveaux de navigation**, aucun découpage flat contrairement à prefecture-13 :
  1. Racine → 18 cartes `.fr-card` (une par année, 2009-2026 au moment de la capture), chacune `h2.fr-card__title > a` avec un `href` se terminant par `-de-l-annee-<AAAA>`.
  2. Page d'une année (ex. `.../Recueil-des-Actes-Administratifs-de-l-annee-2026`) → 10 cartes `.fr-card` (une par mois), même sélecteur `.fr-card__title a`, `href` se terminant par `/<Mois>-<AAAA>` où `<Mois>` est le nom français **sans accent, capitalisé** (`Aout-2026`, jamais `Août-2026` — vérifié en direct, même piège que documenté pour prefecture-13/77).
  3. Page d'un mois (ex. `.../Aout-2026`) → 10 cartes `.fr-card` (une par bulletin RAA), `h3.fr-card__title > a.fr-card__link` = titre ET lien PDF **direct** en un seul élément (pas de page de détail intermédiaire, à la différence de prefecture-77) ; `p.fr-card__detail` = `"Publié le DD/MM/YYYY"`.
- Comme prefecture-13 : le texte du lien d'un bulletin (`"RAA 33 SPECIAL N°2026-243"`) ne mentionne **jamais** le contenu réel — un bulletin regroupe potentiellement plusieurs arrêtés, dont certains peuvent concerner rave/teknival sans que le titre ne le laisse jamais paraître. La pertinence ne peut donc se décider que sur le texte du PDF (moteur `page_web`, extension du 2026-08-13).

## Ce qui N'A PAS été vérifié (limite de cette capture)

Comme pour prefecture-13, aucun outil de cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF gironde.gouv.fr. `bulletin-avec-arrete.pdf` et `bulletin-sans-arrete-pertinent.pdf` sont donc **synthétiques** (générés avec `reportlab`), reproduisant un texte plausible (`Arrêté n° ...`, `à compter du .../jusqu'au ...`) conforme aux patterns de `prefecture-33.yaml`, mais la formulation exacte d'un vrai bulletin RAA de la Gironde reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur — même recommandation que `reel/prefecture-13/SOURCE.md`.

`racine.html`/`annee-2026.html`/`aout-2026.html` ne reproduisent que 2 éléments par niveau (sur 18/10/10 réels au moment de la capture) — une reconstruction fidèle des classes/attributs DSFR observés en direct, pas un dump complet de chaque page.
