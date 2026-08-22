# Source — prefecture-45 (Loiret)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 42-46).

**URL cible** : `https://www.loiret.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-departementaux`

## Structure confirmée en live

- **PIÈGE CONFIRMÉ EN LIVE** : le RAA du Loiret existe en deux
  déclinaisons — "régionaux" (Centre-Val de Loire) et "départementaux".
  `url_liste` cible directement la page "départementaux" (fixe), pas la
  page parente générique qui ne fait que lister ces 2 cartes.
- **PIÈGE CONFIRMÉ EN LIVE** : contrairement au reste du lot, PAS de carte
  "année" intermédiaire — les mois de l'année courante (Janvier→Septembre
  2026 constatés, y compris un mois futur vide "Septembre-2026") sont
  DIRECTEMENT des cartes sur la page "départementaux", à côté des cartes
  des années archivées. Un SEUL niveau de navigation suffit,
  `pattern_lien: "/{mois_fr}-{annee}$"`. Casse incohérente observée sur le
  site réel (ex. "JUIN-2026" en majuscules alors que les autres mois sont
  capitalisés) — sans impact, le moteur compile en regex insensible à la
  casse.
- Page du mois : liste plate `div[class='']:has(a.fr-link--download)` —
  CONFIRMÉE en live sur ".../Aout-2026" : 16 correspondances qualifiées vs
  20 pour le sélecteur non qualifié (même bug de sur-correspondance
  `:has()` documenté pour 37/41). Aucune pagination (16 bulletins tous sur
  une seule page).
- Signataire réel : décret de nomination du 22 avril 2026 (Légifrance) — M.
  Hugues Moutouh, préfet de la région Centre-Val de Loire, préfet du
  Loiret.

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
