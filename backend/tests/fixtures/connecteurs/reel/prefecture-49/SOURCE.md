# Source — prefecture-49 (Maine-et-Loire)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 47-51).

**URL cible** : `https://www.maine-et-loire.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

## Structure confirmée en live

- Navigation à UN niveau : racine → carte de l'année (`Annee-{annee}$`).
- Liste PLATE de 165 publications réelles sur la seule page de l'année
  (aucune subdivision par mois, à la différence de 42-48) —
  `div[class='']:has(a.fr-link--download)`, même famille que
  prefecture-37/41/45. Comptage exact confirmé en live (165 = 165 = 165).
- Signataire réel : M. François Pesneau, préfet de Maine-et-Loire (décret
  de nomination du 2 décembre 2025, Légifrance).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
