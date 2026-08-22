# Source réelle — prefecture-55 (Meuse)

Capture live (navigateur Chrome réel) le 2026-08-19 (lot 52-56), avant
l'écriture de la config.

- Racine : SANS carte DSFR — sélecteur d'année directement en
  `<select id="Liste-des-recueils-liste-docs" class="fr-select">` (aucun
  `<a>` équivalent ailleurs sur la page — même idiome V011 que
  prefecture-17, `attribut_lien: "value"` dès la première étape de
  navigation). Chaque `<option value="Publications/...">` (SANS "/" de
  tête) mène directement à la page de l'année.
- Page de l'année : liste PLATE, 108 publications au 2026-08-19 (comptage
  exact confirmé en live : `div[class='']:has(a.fr-link--download)` = 108
  = 108 liens réels) — même famille exacte que prefecture-37/41/45/49.
  Lien PDF direct, pas de `page_detail`.
- Signataire confirmé par décret de nomination (Légifrance) : Mme
  Anne-Florence CANTON, préfète de la Meuse (décret du 8 avril 2026,
  effective au 6 mai 2026 — succède à M. Xavier Delarue).

Fixtures synthétiques (`raa-n-108.pdf` pertinent, `raa-n-107.pdf` non
pertinent) — hrefs/format réalistes issus de la capture live, texte des
PDF reconstruit.
