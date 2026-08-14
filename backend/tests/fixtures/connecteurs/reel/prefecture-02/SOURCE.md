# Source réelle — prefecture-02 (Aisne)

**Capturé le** : 2026-08-14, par inspection directe (Chrome + `javascript_tool`, DOM déjà rendu).

**URL réelle** : `https://www.aisne.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- La page de l'année n'est PAS découpée par mois : elle liste TOUTES les publications de l'année en une seule collection, PAGINÉE (10 par page), en ordre chronologique CROISSANT — la page 1 montre donc les publications les plus anciennes. La navigation saute directement vers la dernière page de pagination via `.fr-pagination__link--last` (offset dynamique dans le href, jamais un numéro de page codé en dur).
- En tout début d'année, l'année entière peut tenir sur une seule page : le lien "dernière page" n'existe alors pas du tout dans le DOM (vérifié empiriquement, cf. `moteur page_web` V010 "étape de navigation optionnelle" — `contracts/connecteur-interface.md` §2quater). Cette fixture ne couvre que le cas "lien présent" ; le cas "lien absent" est couvert génériquement par `moteurPageWeb.test.ts`.
- Chaque publication de la dernière page est directement l'ancre `.fr-card__link` (texte direct, aucun descendant pertinent), qui mène vers une page de DÉTAIL HTML (pas de PDF direct) où `a.fr-link--download` porte le vrai lien PDF.
- Ni le texte de l'ancre ("RAA_Août_02-2026-163") ni le libellé de la page de détail ne mentionnent jamais le contenu du bulletin — seul le scan du texte du PDF permet de décider de la pertinence.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF. Les 2 PDF de cette fixture sont donc **synthétiques** (reportlab) — la formulation exacte d'un vrai bulletin RAA de l'Aisne reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-02.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation année → dernière page → détail → PDF → scan de contenu), pas la formulation exacte du texte réglementaire.
