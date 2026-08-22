# Source réelle — prefecture-24 (Dordogne)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.dordogne.gouv.fr/Publications/Recueil-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `Annee-{annee}`), comme prefecture-01/13/18/19/23/33/77.
- **Page de l'année (`Annee-2026`)** : liste une carte DSFR par MOIS (`.fr-card__title a`, href se terminant par `{Mois}-{annee}`, ex. `Aout-2026`, `Janvier-2026`) — sans accent, majuscule initiale seulement (à la différence de prefecture-22 qui utilise des majuscules intégrales `AOUT-2026`). Tous les 12 mois de l'année sont déjà des cartes (y compris les mois futurs, ex. `Decembre-2026`) — sans incidence, seul `Aout-2026` (mois courant) est suivi. Navigation à TROIS niveaux (racine → année → mois), comme prefecture-01/06/09/18.
- **Page du mois (`Aout-2026`)** : liste chaque bulletin comme une carte DSFR complète (`div.fr-card`, comme prefecture-17/22), avec le lien PDF DIRECT porté par `h2.fr-card__title a` (`class="fr-card__link menu-item-link"`) — pas de page de détail intermédiaire. 4 bulletins recensés pour août 2026 au moment de la capture (14/08/2026), le mois n'ayant débuté que le 05/08 — le plus récent (`recueil-24-2026-082`, nommé "RAAA" avec une faute de frappe réelle sur le site source) correspond bien au 14/08/2026, confirmant la fraîcheur de la source.
- Page NON paginée (seulement 4 bulletins pour ce mois).
- Aucun `id=` vide/malformé détecté sur cette page.
- Texte du lien ("RAA normal n°1 du 05 aout 2026") : ne mentionne jamais le contenu réglementaire — d'où le recours systématique au scan du contenu PDF.

## Signataire réel

Confirmé par le logo textuel DSFR de chaque carte : « préfète<br />de la Dordogne » (Madame [nom non capturé], féminin). Les 2 vrais PDF échantillonnés (72 pages « RAA normal n°1 » ; 10 pages « RAA spécial n°1 ») portent sur des sujets de délégation/subdélégation de signature interne et ne contiennent aucun bloc de signature explicite du type "Fait à ... / La préfète," — `autorite_signataire` s'appuie donc sur le logo DSFR (source directe du site, fiable) plutôt que sur un PDF échantillonné.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun mot-clé rave/teknival/rassemblement musical trouvé dans les 2 PDF réels téléchargés — comme la plupart des connecteurs précédents (à l'exception de prefecture-23/Creuse, déployé la même session). Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) restent donc **synthétiques** (`reportlab`), la formulation exacte d'un vrai arrêté anti rave-party de la Dordogne demeurant non vérifiée.

`racine.html`/`annee-2026.html`/`aout-2026.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 12 cartes mois / 4 bulletins réels du mois au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page.
