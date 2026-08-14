# Source réelle — prefecture-77 (Seine-et-Marne)

**Capturé le** : 2026-08-13, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu — ce site DSFR ne dépend pas du JS pour son contenu, un `fetch`+cheerio verrait la même structure).

**URL réelle (racine)** : `https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA`
(l'ancienne `url_liste` de `prefecture-77.yaml`, `.../Publications/RAA`, était une **404** — confirmé en direct.)

## Ce qui a été vérifié en direct

- **4 niveaux de navigation**, le plus profond des 3 connecteurs réels :
  1. Racine → cartes `.fr-card` : une carte "à la une" pointant **directement** vers un PDF (`href` se terminant par `.pdf`), puis une carte par année (`RAA 2026`, `RAA 2025`, ...), toutes `h3.fr-card__title > a`. Piège réel : la carte "à la une" contient elle aussi "2026" dans son texte — le motif de `navigation` matche sur l'**URL** (`/RAA-2026$`), jamais le texte affiché, pour ne jamais la confondre avec la carte année.
  2. Page d'une année (ex. `.../RAA-2026`) → `<select id="Liste-liste-docs">` avec ~248 `<option>` (un par RAA journalier, ~200+/an), prembattier `<option value="">Liste</option>` placeholder inclus. Chaque option réelle : `value="Publications/Recueils-des-actes-administratifs-RAA/RAA-2026/RAA-n-D77-JJ-MM-AAAA"` (**sans** `/` de tête, à la différence d'un `href` — vérifié en direct, cf. moteur `resoudreUrl`) et `title="RAA n° D77-JJ-MM-AAAA"`.
  3. Chaque `<option>` → une page de détail HTML (PAS un PDF direct) contenant **exactement un** lien `a.fr-link--download` vers le PDF réel — vérifié sur 2 jours différents (`RAA-n-D77-13-08-2026` et `RAA-n-D77-12-08-2026-nominatifs`, tous deux avec 1 seul lien `.fr-link--download`).
  4. Le PDF lui-même (téléchargement direct depuis la page de détail).
- Un même jour calendaire peut avoir **plusieurs options distinctes** dans le `<select>` (ex. `RAA-n-D77-12-08-2026` et `RAA-n-D77-12-08-2026-nominatifs`) — chacune est sa PROPRE entrée avec sa propre page de détail et son propre PDF, jamais plusieurs PDF sur une même page de détail.
- Le libellé d'une option est une date/référence de bulletin ("RAA n° D77-13-08-2026"), jamais un sujet — la pertinence ne peut donc se décider que sur le texte du PDF réel (moteur `page_web`, extension du 2026-08-13), exactement comme prefecture-13/33.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Comme pour prefecture-13/33, aucun outil de cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF seine-et-marne.gouv.fr. `RAA-n-D77-13-08-2026.pdf` et `RAA-n-D77-12-08-2026-nominatifs.pdf` sont donc **synthétiques** (générés avec `reportlab`), reproduisant un texte plausible conforme aux patterns de `prefecture-77.yaml`, mais la formulation exacte d'un vrai bulletin RAA de Seine-et-Marne reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

`racine.html`/`annee-2026.html` ne reproduisent que 2-3 éléments (sur ~250 options réelles au moment de la capture) — une reconstruction fidèle des classes/attributs/structure observés en direct, pas un dump complet de chaque page.
