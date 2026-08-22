# Source — prefecture-47 (Lot-et-Garonne)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 47-51).

**URL cible** : `https://www.lot-et-garonne.gouv.fr/Publications/Publications-legales/RAA`

## Structure confirmée en live

- Navigation à DEUX niveaux : racine → carte de l'année
  (`annee-{annee}$`) → carte du mois. PIÈGE CONFIRMÉ EN LIVE : chaque lien
  de mois porte un suffixe "2" inattendu (`.../annee-2026/Aout2`, jamais
  `/Aout` seul) — vérifié sur les 8 mois déjà publiés (Janvier2..Aout2) —
  motif `/{mois_fr}2$`.
- Page du mois : liste plate `.fr-downloads-group li` / `a` / `a`, lien
  PDF direct (pas de `page_detail`) — même famille que prefecture-42/43.
  Aucune pagination observée sur une page mensuelle (12 items réels sur
  août, largement sous tout seuil de pagination DSFR usuel).
- Signataire réel : M. Bruno André, préfet de Lot-et-Garonne (décret de
  nomination du 17 décembre 2025, Légifrance).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
