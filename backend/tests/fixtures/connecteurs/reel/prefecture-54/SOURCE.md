# Source réelle — prefecture-54 (Meurthe-et-Moselle)

Capture live (navigateur Chrome réel) le 2026-08-19 (lot 52-56), avant
l'écriture de la config.

- Racine : `.fr-card__title a`, 1 niveau, `annee-{annee}$` — EN MINUSCULE
  ici (vérifié en live : href se termine par
  ".../Recueils-des-actes-administratifs-annee-2026", pas "Annee-").
- Page de l'année : UN SEUL `<select id="Liste-liste-docs" class="fr-select">`
  listant 102 numéros (id vérifié unique sur la page, pas de duplication
  comme sur prefecture-51/Marne) ; chaque `<option value="Publications/...">`
  (SANS "/" de tête) mène à une page de détail HTML — jamais directement
  au PDF — même famille que prefecture-77/51 (`page_detail`).
- Page de détail : un seul lien `a.fr-link--download` vers le PDF réel
  (vérifié sur le numéro 102 du 17 août 2026).
- Signataire confirmé par décret de nomination (Légifrance) : M. Yves
  SEGUY, préfet de Meurthe-et-Moselle (décret du 23 juillet 2025).

Fixtures synthétiques (`numero-102.pdf` pertinent, `numero-101.pdf` non
pertinent) — structure/hrefs réalistes issus de la capture live (numéro
102 réel), numéro 101 construit par cohérence de numérotation, texte des
PDF reconstruit.
