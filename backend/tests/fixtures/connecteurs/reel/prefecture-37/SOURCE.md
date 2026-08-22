# Source — prefecture-37 (Indre-et-Loire)

**Tentative de capture le** : 2026-08-15 (lot 37-41).

**URL cible** : `https://www.indre-et-loire.gouv.fr/Publications/Recueil-actes-administratifs`

## AVERTISSEMENT — structure NON vérifiée par capture live

À la différence de TOUS les connecteurs précédents (où la page HTML de
liste restait accessible même quand l'endpoint de téléchargement PDF était
bloqué), l'outil de fetch web de cette session a échoué sur tous les
sous-chemins des 5 domaines de ce lot, y compris `/robots.txt`
lui-même (`"Failed to fetch or parse robots.txt"` / `"Server disconnected
without sending a response"`). Seule la racine du domaine (`/`) a pu être
récupérée, et son contenu s'est révélé être un instantané manifestement
ancien (actualités 2021 : restrictions Covid, prime inflation), donc
inexploitable pour la structure RAA.

**Ce qui a pu être établi** (recherche web uniquement, résultats indexés) :

- `url_liste` réel : `https://www.indre-et-loire.gouv.fr/Publications/Recueil-actes-administratifs` — confirmé, les pages `.../Annee-2026` et `.../Annee-2025` apparaissent dans l'index.
- Anciens PDF indexés utilisant deux conventions de nommage successives (`/content/download/...` avant ~2018, `/contenu/telechargement/...` depuis ~2023) — confirme la migration vers la plateforme DSFR déjà observée sur tous les autres départements.
- Signataire réel : décret de nomination (Légifrance) — M. Thomas Campeaux, "Le préfet d'Indre-et-Loire".

**Ce qui N'A PAS été vérifié** (limite de cette session, plus sévère que
les lots précédents) :

- La structure DOM de la page racine et de la page d'année (`.fr-card`, `div[class='']:has(a.fr-link--download)`) : ces fixtures sont une **reconstruction PAR EXTRAPOLATION** de la structure DSFR majoritaire (validée sur 38 connecteurs précédents), pas une capture réelle.
- La présence ou l'absence de pagination sur la page d'année.
- Le contenu binaire d'un vrai PDF (comme pour tous les connecteurs précédents) : `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont synthétiques (`reportlab`).

**Recommandation avant activation réelle** : capture directe prioritaire de
ce site dès qu'un outil de fetch fonctionnel est disponible — cette
fixture valide uniquement la cohérence interne du connecteur (schéma,
moteur), pas sa structure réelle.
