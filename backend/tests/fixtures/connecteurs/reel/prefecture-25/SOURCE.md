# Source réelle — prefecture-25 (Doubs)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.doubs.gouv.fr/Publications/Publications-Legales/Recueil-des-Actes-Administratifs-RAA`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## ⚠️ Découverte : second arrêté anti rave-party RÉEL confirmé (même session que prefecture-23/Creuse)

Le bulletin **`recueil-25-2026-188-...special.pdf`** (RAA spécial n°25-2026-188, publié le 13/08/2026) contient un arrêté réel et actuellement en vigueur :

> ARRÊTÉ N°25-2026-08-13-00001
> portant interdiction d'une manifestation de type rassemblement festif à caractère musical et interdiction de circulation de tout véhicule transportant du matériel de son à destination d'un rassemblement festif à caractère musical non autorisé dans le département du Doubs

« un rassemblement non autorisé de type rave-party pouvant regrouper plusieurs centaines de participants est susceptible d'être organisé dans le département du Doubs du vendredi 14 août 2026 - 15H00 au lundi 17 août 2026 - 12H00 ». **Le même week-end que l'arrêté trouvé en Creuse** (cf. `fixtures/connecteurs/reel/prefecture-23/SOURCE.md`) — laisse penser à un événement itinérant ou à plusieurs événements coordonnés sur cette période, ou simplement à une pratique préventive concertée entre préfectures voisines pendant l'été. Signé « Le préfet du Doubs » (Monsieur Rémi Bastille), par délégation de Mme Jennifer Rousselle, sous-préfète, directrice de cabinet.

### Limite technique importante : PDF scanné (pas de texte natif dans le corps de l'arrêté)

Contrairement au PDF réel trouvé en Creuse (texte nativement sélectionnable), **les pages portant le corps de cet arrêté (VU/CONSIDÉRANT/ARRÊTE, articles, dates, signature) sont des images scannées** — vérifié avec `pdfimages -list` (JPEG/CCITT fax, pages 4-6 du PDF). Le contenu ci-dessus n'a pu être lu qu'en générant des images des pages (`pdftoppm`) puis en les passant à l'OCR `tesseract` (paquet `tesseract-ocr-fra`, installé pour cette inspection) — PAS la méthode utilisée par le moteur `pdf` en production.

Le moteur `pdf` du projet (`pdf-parse`) **n'effectue jamais d'OCR** — contrainte déjà actée dans le code (`LONGUEUR_TEXTE_MINIMALE`, `moteurs/pdf/moteur.ts` : « PDF scanné/image sans texte, FR-005 — jamais d'OCR »), pas une découverte de cette session. Exécution du VRAI `telechargerEtExtraireTextePdf` du projet contre ce PDF réel (vérifié directement dans le sandbox) : **2067 caractères récupérés, mais uniquement depuis le sommaire/en-tête/pied de page** (texte natif, hors zone scannée) — aucune date, aucune référence d'arrêté au format attendu (ces éléments ne vivent que dans les pages scannées, illisibles pour `pdf-parse`).

Le texte récupéré contient néanmoins littéralement **"rassemblement festif à caractère musical"** (présent dans le titre répété en en-tête/pied de page de chaque page, et dans le sommaire) : la **pertinence** serait donc correctement détectée pour ce cas réel (d'où l'ajout de cette expression à `mots_cles_filtrage` dans `configs/prefecture-25.yaml`), mais **pas l'extraction des champs** (référence/dates resteraient `null`) — un candidat serait tout de même produit (jamais d'échec pour un champ manquant, contrat §5), à charge du `runner`/opérateur de le traiter comme une anomalie plutôt qu'une publication automatique propre.

**C'est une limite documentée du système, pas un bug de ce connecteur** — inhérente au fait que cette préfecture publie (au moins parfois) ces arrêtés comme des scans de l'original signé papier plutôt que des PDF nativement numériques. `bulletin-avec-arrete.pdf` de cette fixture reste donc **synthétique** (comme la majorité des connecteurs) : un vrai PDF scanné ne démontrerait pas le chemin d'extraction nominal du moteur (le cas réel, lui, produirait des champs `null`, documenté ci-dessus plutôt que testé littéralement).

**Recommandation opérationnelle** : comme pour prefecture-23/Creuse, envisager de déclencher une VRAIE collecte manuelle pour ce département compte tenu de cet arrêté réel actif — et, plus largement, envisager une intervention manuelle (relecture humaine du PDF, saisie manuelle des champs) pour tout candidat sans référence/dates extraites mais dont la pertinence est détectée, plutôt que de l'écarter silencieusement.

## Ce qui a été vérifié en direct (structure)

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`). Nommage d'URL INCOHÉRENT selon l'ancienneté — `.../pour-le-Doubs-{annee}` pour 2021+ mais `.../pour-le-departement-du-Doubs-{annee}` pour 2017-2020 — sans incidence, `pattern_lien: "{annee}$"` matche les deux formes. Racine PAGINÉE (`fr-pagination` présent, 8 occurrences de la classe) mais l'année 2026 est déjà présente sur la page 1 (vérifié directement) — aucune étape de pagination nécessaire.
- **Page de l'année 2026** : liste DIRECTEMENT tous les bulletins (189 au moment de la capture, 14/08/2026), chaque bulletin étant un `<div class="">` contenant un unique `<a class="fr-link fr-link--download">` (texte "Télécharger {titre complet}") avec lien PDF DIRECT — pas de page de détail. `selecteur_publications: "div:has(a.fr-link--download)"` (comme prefecture-21/23) car d'autres `<div class="">` sans rapport existent ailleurs sur la page.
- Page NON paginée (189 bulletins de 2026, tous sur une seule page HTML).
- Aucun `id=` vide/malformé détecté sur cette page.
- Texte du lien ("Télécharger Recueil des actes administratifs n°25-2026-189 du 14 août 2026") : mentionne la date mais jamais le contenu réglementaire.

`racine.html`/`annee-2026.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 189 bulletins réels de l'année au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page.
