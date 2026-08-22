# Source réelle — prefecture-15 (Cantal)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL initialement enregistrée (2026-08-13)** : `https://www.cantal.gouv.fr/Publications/Recueil-des-actes-administratifs`

**URL réelle (corrigée)** : `https://www.cantal.gouv.fr/Publications/Recueil-des-Actes-Administratifs`

`point_acces` corrigé dans `registre-sources.yaml` : l'URL initialement identifiée (casse minuscule sur "actes-administratifs") redirige aujourd'hui côté serveur (HTTP 301, vérifié par `curl -I`, suivi nativement par `fetch`) vers la même URL en casse majuscule sur "Actes-Administratifs" — même situation que prefecture-04/10 en Phase 5bis élargie 2.

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- La page de l'année est DÉJÀ la liste finale, en PLATE : chaque bulletin ("RAA spécial n° 15-2026-160 du 13 août 2026") est une carte `.fr-card` dont le titre EST le nom du fichier PDF et dont `.fr-card__title a` porte directement le lien PDF (pas de découpage par mois, pas de page de détail) — comme prefecture-10.
- La page de l'année est PAGINÉE (10 par page) mais en ordre **DÉCROISSANT** : la page 1 contient déjà les bulletins les plus récents (13/08 → 30 juillet 2026, vérifié par les dates décroissantes dans le titre) — comme prefecture-06/08/09/10, aucune étape de navigation supplémentaire n'est nécessaire ici.
- Nom de fichier ("recueil-15-2026-160-recueil-des-actes-administratifs-special") reprenant directement une numérotation séquentielle globale exploitable (`15-2026-{num}`), utilisée pour choisir le numéro de référence des PDF synthétiques.
- Texte du lien ("RAA spécial n° 15-2026-160 du 13 août 2026") : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 15-2026-08-160`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-15.yaml`), mais la formulation exacte d'un vrai bulletin RAA du Cantal reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-15.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → année → PDF direct → scan de contenu, page déjà en ordre décroissant), pas la formulation exacte du texte réglementaire.
