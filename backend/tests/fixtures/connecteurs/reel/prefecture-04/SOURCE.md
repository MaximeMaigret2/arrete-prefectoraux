# Source réelle — prefecture-04 (Alpes-de-Haute-Provence)

**Capturé le** : 2026-08-14, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu).

**URL réelle** : `https://www.alpes-de-haute-provence.gouv.fr/Publications/Publications-administratives-et-legales/Recueil-des-Actes-Administratifs`

## Ce qui a été vérifié en direct

- Page racine listant une carte par SEMESTRE IRRÉGULIER (pas par année ni par mois) — "2026 de janvier à juillet" (7 mois) et "2026 de août à décembre" (5 mois), découpage inégal qui varie aussi d'une année à l'autre pour les années plus anciennes. Le nom du mois courant n'apparaît dans l'URL que pour les 4 mois de bornes (janvier/juillet/août/décembre) — d'où l'extension générique du moteur `page_web`, `navigation.periodes` (V009, `contracts/connecteur-interface.md` §2ter) : le moteur choisit le motif dont la plage `[mois_debut, mois_fin]` contient le mois courant.
- La page de semestre est déjà la liste complète, en liste PLATE, ordre chronologique DÉCROISSANT — pas de pagination ni de niveau de navigation supplémentaire. Chaque bulletin est rendu dans une structure `<table><tr><td><div><a class="fr-link--download">` (`.fr-table td > div`).
- Cette page affiche aussi le sommaire détaillé de chaque arrêté contenu dans le bulletin (sujet, date, service signataire), mais ce texte n'est volontairement pas exploité ici, par cohérence avec le traitement des autres connecteurs de cette session (contrat §5, règle 7 : pas de comportement spécifique à un connecteur) — seul le scan du texte du PDF détermine la pertinence.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF. Les 2 PDF de cette fixture sont donc **synthétiques** (reportlab) — la formulation exacte d'un vrai bulletin RS/RAA des Alpes-de-Haute-Provence reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-04.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (semestre courant → liste plate → PDF → scan de contenu) ET l'extension moteur `periodes` (V009), pas la formulation exacte du texte réglementaire.
