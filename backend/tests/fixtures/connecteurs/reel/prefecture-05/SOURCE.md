# Source réelle — prefecture-05 (Hautes-Alpes)

**Capturé le** : 2026-08-14, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu — vérifié aussi contre le texte brut de la réponse serveur via `fetch()` depuis la page, pour confirmer que cheerio verrait la même structure malformée que Chrome).

**URL réelle** : `https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Ce qui a été vérifié en direct

- Structure la plus profonde des 5 connecteurs de cette session : racine (`.fr-card` par année) → page de l'année (`.fr-card` par mois, `/Aout-2026`) → page du mois, PAGINÉE (ordre chronologique croissant comme prefecture-02), d'où un saut vers la DERNIÈRE page (`.fr-pagination__link--last`, offset dynamique), `optionnelle: true` : absente si le mois tient déjà sur une seule page.
- Chaque publication (`.fr-card__link`) pointe vers une page de détail HTML → `page_detail`, où le vrai lien PDF est présent.
- **Bug d'attribut confirmé sur la page de détail** : le HTML réel contient `<a id= class="fr-link fr-link--download" href="...">` (`id` sans valeur, immédiatement suivi d'un espace puis `class=...`) — ce qui casse l'attribut `class` pour TOUT parseur HTML conforme au tokenizer HTML5 (vérifié identique dans Chrome ET en lisant le texte brut de la réponse serveur, ce que cheerio verrait aussi) : le tokenizer consomme `class="fr-link` comme valeur de `id`, et ce qui suit devient un attribut `fr-link--download"=""` séparé — la classe CSS `fr-link--download` n'existe donc, structurellement, jamais sur cet élément. `selecteur_lien_pdf` cible directement l'attribut `href` (`a[href$='.pdf']`), insensible à ce bug, plutôt que la classe cassée.
- Le nom du bulletin ("RAA N°05-2026-317 SPECIAL AOUT 2026") ne mentionne jamais son contenu — seul le scan du texte du PDF permet de décider de la pertinence.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF. Les 2 PDF de cette fixture sont donc **synthétiques** (reportlab) — la formulation exacte d'un vrai bulletin RAA des Hautes-Alpes reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-05.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (année → mois → dernière page → détail → PDF → scan de contenu) ET le contournement du bug de markup, pas la formulation exacte du texte réglementaire.
