# Source — prefecture-51 (Marne)

**VALIDÉE PAR CAPTURE LIVE** (navigateur Chrome réel, accès réseau réel côté
utilisateur) dès la construction initiale : 2026-08-19 (lot 47-51).

**URL cible** : `https://www.marne.gouv.fr/Publications/Publications-administratives-et-legales/RAA-Recueils-des-actes-administratifs/RAA-Recueils-des-actes-administratifs-de-la-prefecture-de-la-Marne`

## Structure confirmée en live

- Racine → 2 cartes (RAA départemental actuel + ancien RAA "région
  Champagne-Ardenne", jamais confondus).
- Navigation à UN niveau (`Annee-{annee}$`) vers `RAA-Annee-2026`, page
  listant TOUT le RAA de l'année en une seule page (pas de subdivision par
  mois), organisée en 8 `<select class="fr-select">` réels (un par mois
  publié). **PIÈGE CONFIRMÉ EN LIVE** : les `id` de ces `<select>` sont
  dupliqués/incohérents entre mois ("Liste-des-RAA--liste-docs" pour
  janvier — double tiret — vs "Liste-des-RAA-liste-docs" pour les 7
  autres mois) — d'où l'usage de `select.fr-select` (classe) plutôt qu'un
  id comme racine de `selecteur_publications`.
- Chaque `<option value="Media/Files/.../RAA-N-...">` (SANS "/" de tête,
  comme prefecture-77) mène à une page de détail HTML, jamais directement
  à un PDF — `page_detail.attribut_lien: "value"`. Sur la page de détail,
  un seul lien `a.fr-link--download` vers le PDF réel (pas de piège de
  balisage, comme prefecture-46/77) — MÊME FAMILLE que prefecture-77, à
  la différence près du sélecteur racine (classe plutôt qu'id).
- 8 options placeholder (une par `<select>`, `value=""`) sans effet :
  `page_detail.attribut_lien` résout une chaîne vide, traitée comme
  absente par le moteur.
- Signataire réel : M. Romain Royet, préfet de la Marne (décret de
  nomination du 23 juillet 2025, Légifrance).

**Ce qui reste NON vérifié** : contenu binaire d'un vrai PDF (fixtures
synthétiques, `reportlab`).
