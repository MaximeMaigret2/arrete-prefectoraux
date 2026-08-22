# Source — prefecture-48 (Lozère)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 47-51).

**URL cible** : `https://www.lozere.gouv.fr/Publications/Recueil-des-Actes-Administratifs-R.A.A`

## Structure confirmée en live

- Navigation à TROIS niveaux (nouvelle famille cette session) : racine →
  carte de l'année (`/{annee}$`) → carte du TRIMESTRE (périodes
  irrégulières : "1er-trimestre"/"2eme-trimestre"/"3eme-trimestre"/
  "4eme-trimestre", forme `periodes`) → carte du mois (`/{mois_fr}$`).
- Racine : piège "à la une" (carte PDF directe, même sélecteur que les
  cartes de navigation) — non confondu car les motifs sont ancrés en fin
  de chaîne (même principe que prefecture-44/77). Carte "ARCHIVES"
  également non confondue.
- Page du mois : `.fr-card__title` / `a.fr-card__link`, lien PDF direct
  (pas de `page_detail`) — même famille que prefecture-44.
- Signataire réel : M. Gilles Quénéhervé, préfet de la Lozère (décret de
  nomination du 6 novembre 2024, Légifrance — toujours en poste, aucun
  décret de remplacement trouvé au 2026-08-19).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
