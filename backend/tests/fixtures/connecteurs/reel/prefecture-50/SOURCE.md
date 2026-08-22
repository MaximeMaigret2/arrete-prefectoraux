# Source — prefecture-50 (Manche)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 47-51).

**URL cible** : `https://www.manche.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Structure confirmée en live

- Navigation à TROIS niveaux : racine → carte de l'année (`/{annee}$`) →
  [étape de pagination CONDITIONNELLE] → carte du mois (`-{mois_fr}$`,
  ancré en fin de nom, car les cartes portent un préfixe numérique
  "9.-Aout", "13.-Novembre" en plus d'une catégorie non-mois intercalée
  "2. Délégations de signatures du Préfet de la Manche").
- **PIÈGE DE PAGINATION NOUVEAU CETTE SESSION** : la page de l'année liste
  10 cartes par page. En 2026, page 1 = Janvier→Septembre (10 cartes,
  categories incluses), page 2 (`.../2026/(offset)/10`) = Octobre→Décembre.
  À la différence de prefecture-46 (bulletins individuels, la dernière
  page contient toujours les plus récents), ici la pagination ne doit être
  suivie QUE pour les mois d'automne — sinon un mois déjà présent page 1
  (ex. août) ne serait plus trouvable après un saut inconditionnel vers la
  dernière page. Résolu avec la forme `periodes` appliquée à l'étape de
  PAGINATION elle-même : motif délibérément inatteignable pour les mois
  1-9 (étape `optionnelle`, silencieusement sautée) et motif réel de la
  dernière page pour les mois 10-12. Vérifié dans les deux sens par cette
  suite (système figé en août ET test dédié en novembre).
- Page du mois : chaque bulletin est un `<p>` SANS attribut class
  (`p:not([class])`) contenant le texte suivi d'un `a.fr-link` — nouvelle
  famille de balisage, comptage exact confirmé en live (5 = 5 = 5 sur la
  page d'août 2026). `selecteur_titre` volontairement non-satisfaisable
  (comme prefecture-46/77) pour retomber sur `$publication.text()`.
- Signataire réel : M. Marc Chappuis, préfet de la Manche (décret de
  nomination du 27 août 2025, Légifrance — confirmé aussi par le
  communiqué de presse officiel de la préfecture).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
synthétiques, `reportlab`). Les fixtures `13.-Novembre.html` et
`bulletin-novembre-*.pdf` sont des reconstructions plausibles pour
valider le mécanisme de pagination conditionnelle (pas une capture live
de novembre, mois non encore atteint au 2026-08-19).
