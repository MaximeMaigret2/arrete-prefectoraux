# Source réelle — prefecture-21 (Côte-d'Or)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.cote-dor.gouv.fr/Publications/Recueils-des-Actes-Administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : liste DEUX cartes DSFR pertinentes (`.fr-card__title a`) — « Recueils des actes administratifs de l'année en cours » (`.../Recueils-des-actes-administratifs-de-l-annee-en-cours`) et « ... des années antérieures » — plus une FAQ sans rapport. Désambiguïsation nécessaire (comme prefecture-2A), `pattern_lien: "-de-l-annee-en-cours$"` cible la première.
- **Page « année en cours »** : liste DIRECTEMENT tous les bulletins de l'année 2026 (142 au moment de la capture, 14/08/2026), regroupés visuellement par des en-têtes `<p><b><b>Mois AAAA</b></b></p>` (purement indicatifs). Chaque bulletin est un `<li>` NU — sans classe, sans `<div>` englobant distinctif comme prefecture-19 (`div.fr-text--lead`) — contenant un unique `<a class="fr-link fr-link--download">` avec titre + lien PDF DIRECT. Comme d'autres `<li>` sans rapport existent ailleurs sur la page (menu latéral, fil d'Ariane, liens d'évitement), `selecteur_publications` utilise `"li:has(a.fr-link--download)"` (sélecteur CSS4 `:has()`, supporté nativement par la version de `cheerio` du moteur — vérifié directement en Node dans le sandbox avant de l'adopter — aucune extension moteur nécessaire).
- **`id=` non vide mais SANS guillemets** sur chaque lien de téléchargement (ex. `id=542e263b866a438c6b70ec12a913b761  target="_blank"`) — contrairement au bug rencontré sur 2A/2B (`id=` VIDE absorbant la classe suivante dans le tokenizer), un `id=` non vide sans guillemets est parsé correctement par cheerio/htmlparser2 : AUCUN contournement nécessaire ici.
- 142 bulletins recensés pour l'année 2026 au moment de la capture (14/08/2026), TOUS sur une seule page HTML sans pagination (aucune classe `.fr-pagination` détectée) — le bulletin le plus récent (`recueil-21-2026-142`) correspond bien au 14/08/2026, confirmant la fraîcheur de la source.
- Ordre chronologique **décroissant** (le plus récent en tête, comme prefecture-01/03/13/17/18/33).
- Texte du lien ("RAA n° 142 du 14 août 2026") : ne mentionne jamais le contenu réglementaire — d'où le recours systématique au scan du contenu PDF.

## Signataire réel confirmé

4 vrais PDF téléchargés et scannés (`pdftotext` sur les bulletins n°142, 138, 137, 133, tous entre 17 et 98 pages) : signataire **« La préfète de la Côte-d'Or »** (Madame Violaine Demaret, nommée par décret du 8 avril 2026), parfois « Pour la Préfète et par délégation » suivi d'une signature déléguée — sans incidence sur `autorite_signataire`, valeur déclarative fixe représentant l'autorité légale de l'arrêté, jamais extraite du texte (cf. `moteur.ts`, `construireCandidat`).

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun mot-clé rave/teknival/rassemblement musical trouvé dans les 4 PDF réels téléchargés (portant sur : dissolution d'un syndicat des eaux, agrément navigation, désignation d'experts, atlas de biodiversité) — comme pour tous les connecteurs précédents SAUF prefecture-23/Creuse (déployé la même session, où un vrai arrêté anti rave-party a été trouvé). Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) restent donc **synthétiques** (`reportlab`), la formulation exacte d'un vrai arrêté anti rave-party de la Côte-d'Or demeurant non vérifiée.

**Recommandation avant activation réelle** : télécharger manuellement un futur bulletin RAA « spécial » de la Côte-d'Or publié en amont d'un week-end à risque (cf. la méthode observée sur prefecture-23/Creuse, qui publie ce type d'arrêté en RAA spécial 2-3 jours avant l'événement) et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-21.yaml` matchent la formulation réelle.

`racine.html`/`annee-en-cours.html` ne reproduisent que quelques éléments (sur 3 cartes racine / 142 bulletins réels de l'année au moment de la capture) — une reconstruction fidèle des classes/attributs/structure observés en direct, pas un dump complet de chaque page.
