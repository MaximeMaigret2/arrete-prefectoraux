# Source réelle — prefecture-14 (Calvados)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle** : `https://www.calvados.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Ce qui a été vérifié en direct

- Page racine listant SEULEMENT 2 cartes (`.fr-card__title a`) : "Recueil des actes administratifs départemental" (href se terminant par `-departemental`) et "...régional" (href se terminant par `-regional`) — les arrêtés d'interdiction relevant du niveau départemental, la 1ère étape de `navigation` utilise un motif littéral fixe (`-departemental$`) pour choisir la bonne branche, comme prefecture-09.
- La page "départemental" liste une carte par année (href se terminant directement par l'année, ex. `/2026`, **sans préfixe `Annee-`** contrairement aux autres connecteurs) — 2e étape de `navigation`, `pattern_lien: "/{annee}$"`.
- La page de l'année est DÉJÀ la liste finale, en PLATE (`.fr-downloads-group li`), **non paginée malgré son volume** : 323 bulletins pour 2026 au moment de la capture, ordre chronologique croissant (06/01 → 14/08/2026), pas de découpage par mois.
- **TOUS** les liens de téléchargement portent le bug de markup réel `<a id= class="fr-link fr-link--download">` — identique à prefecture-05/07/08/09/11/12. `selecteur_titre`/`selecteur_lien_pdf` ciblent donc `a[href$='.pdf']`.
- Nom de fichier ("recueil-14-2026-342-recueil-des-actes-administratifs") reprenant directement une numérotation séquentielle globale exploitable (`14-2026-{num}`), utilisée pour choisir le numéro de référence des PDF synthétiques.
- Texte du lien : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 14-2026-08-342`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-14.yaml`), mais la formulation exacte d'un vrai bulletin RAA du Calvados reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-14.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation racine → départemental → année → PDF direct → scan de contenu), pas la formulation exacte du texte réglementaire.
