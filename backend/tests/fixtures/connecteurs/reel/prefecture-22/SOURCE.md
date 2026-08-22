# Source réelle — prefecture-22 (Côtes-d'Armor)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.cotes-darmor.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste DIRECTEMENT une carte DSFR par MOIS × ANNÉE (`.fr-card__title a`), sans carte année intermédiaire — contrairement à prefecture-01/06/09/18/24. Href de la forme `/AOUT-2026`, `/AVRIL-2026`, en MAJUSCULES et sans accent. Navigation à UN SEUL niveau (racine → mois), `pattern_lien: "{mois_fr}-{annee}$"` matche `AOUT-2026` grâce à la compilation insensible à la casse (flag `i`) du moteur.
- **Page du mois (`AOUT-2026`)** : liste chaque bulletin comme une carte DSFR complète (`div.fr-card`, comme prefecture-17), avec le lien PDF DIRECT porté par `h2.fr-card__title a` (`class="fr-card__link menu-item-link"`) — pas de page de détail intermédiaire.
- **Pagination présente mais NON nécessaire** : `fr-pagination` avec un lien "Suivant" vers `/AOUT-2026/(offset)/10` (10 bulletins/page). Contrairement à prefecture-02/05 (qui sautent vers la DERNIÈRE page pour atteindre les entrées les plus récentes, l'ordre y étant croissant), l'ordre ici est **décroissant** (le plus récent en tête, comme prefecture-01/03/13/17/18/21/33) : la page 1 contient déjà les publications les plus récentes (le 14/08/2026, jour de la capture, y est représenté par les bulletins n°271-273). Aucune étape de pagination ajoutée à `navigation` — le moteur ne visite que la première page résolue, ce qui suffit ici.
- Aucun `id=` vide/malformé détecté sur cette page (contrairement à 2A/2B/05).
- Texte du lien ("Recueil administratif normal N°22-2026-273 du 14 août 2026") : ne mentionne jamais le contenu réglementaire — d'où le recours systématique au scan du contenu PDF.

## Signataire réel confirmé

1 vrai PDF téléchargé et scanné (`pdftotext`, bulletin n°273, 49 pages, portant sur des mesures de contrôle administratif diverses) : signataire **« Le Préfet des Côtes-d'Armor »** — confirmé également par le logo textuel de chaque carte (« préfet des Côtes-d'Armor »).

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun mot-clé rave/teknival/rassemblement musical trouvé dans le PDF réel téléchargé — comme la plupart des connecteurs précédents (à l'exception de prefecture-23/Creuse, déployé la même session). Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) restent donc **synthétiques** (`reportlab`), la formulation exacte d'un vrai arrêté anti rave-party des Côtes-d'Armor demeurant non vérifiée.

`racine.html`/`aout-2026.html` ne reproduisent que quelques éléments (sur 3+ cartes mois racine / 10+ bulletins réels de la page du mois au moment de la capture) — une reconstruction fidèle des classes/attributs/structure observés en direct, pas un dump complet de chaque page.
