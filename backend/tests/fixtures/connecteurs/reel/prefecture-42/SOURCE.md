# Source — prefecture-42 (Loire)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 42-46).

**URL cible** : `https://www.loire.gouv.fr/Publications/Publications-legales/Recueil-des-Actes-Administratifs`

## Structure confirmée en live

- `url_liste` confirmé, menant à une carte unique "{annee} numéros
  spéciaux" (ex. "2026 numéros spéciaux") — le site a abandonné la
  déclinaison "numéros mensuels" pour les années récentes (2024-2026),
  encore présente pour 2022/2023 uniquement (non pertinent, non utilisé).
- La carte de l'année courante mène DIRECTEMENT à une liste plate de 146
  bulletins (aucun niveau de navigation supplémentaire, aucune pagination —
  tout tient sur une seule page HTML), ordre chronologique CROISSANT (le
  plus récent en dernier, ex. "..._2026_08_18.pdf" daté du jour de la
  capture).
- `selecteur_publications`/`selecteur_titre`/`selecteur_lien_pdf` :
  `.fr-downloads-group li` / `a` / `a` — CONFIRMÉS en live : 146
  correspondances exactes pour `.fr-downloads-group li` (un seul bloc sur
  la page), chaque `<li>` n'ayant qu'un seul enfant, l'ancre elle-même (pas
  de classe distinctive, ni sur le `<li>` ni sur l'ancre — famille
  différente de `a.fr-link--download` utilisée par 37/38/40/41).
- Signataire réel : décret de nomination du 22 avril 2026 (Légifrance),
  remplaçant Mme Muriel Nguyen (décret du 30 juillet 2025) — M.
  François-Xavier Bieuville, "Le préfet de la Loire" — confirmé par
  recherche web (Légifrance + actualité officielle du site), non par
  capture DOM directe (hors périmètre).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` toujours
synthétiques, `reportlab`).
