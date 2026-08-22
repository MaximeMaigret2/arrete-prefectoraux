# Source réelle — prefecture-12 (Aveyron)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle** : `https://www.aveyron.gouv.fr/Publications/Recueil-des-actes-administratifs`

## Ce qui a été vérifié en direct

- Page racine listant, entre autres cartes (`.fr-card__title a`), une carte "Recueils 2026" (href se terminant par `-2026`) — la page racine liste aussi des cartes non pertinentes (autres affaires administratives type "Extraction de matériaux...") qui ne matchent jamais le motif `-{annee}$`, sans conséquence sur la résolution.
- La carte "Recueils 2026" mène à une page listant une carte par mois (href se terminant par `/Aout-2026`), page elle-même paginée à 10 mois/page (Janvier-Octobre sur la page 1) — le mois courant (août, 8e mois) reste donc toujours accessible depuis la page 1 pour une collecte en cours d'année ; **limitation documentée** : Novembre/Décembre basculeraient en page 2, hors de portée de la config actuelle (aucune étape de navigation supplémentaire vers cette page 2 n'a été ajoutée, situation à réévaluer avant la fin de l'année si ce connecteur reste actif).
- La page du mois liste les bulletins en PLATE (`.fr-downloads-group li`), non paginée : 40 bulletins pour août 2026 au moment de la capture, ordre chronologique croissant (03/08 → 14/08/2026).
- **TOUS** les liens de téléchargement portent le bug de markup réel `<a id= class="fr-link fr-link--download">` — identique à prefecture-05/07/08/09/11. `selecteur_titre`/`selecteur_lien_pdf` ciblent donc `a[href$='.pdf']`.
- Nom de fichier ("RAA N°12-2026-553 du 13 août 2026") : **seul connecteur de cette session** où le nom de fichier reprend directement une numérotation séquentielle globale exploitable (`12-2026-{num}`), utilisée pour choisir le numéro de référence des PDF synthétiques.
- Texte du lien : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 12-2026-08-553`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-12.yaml`), mais la formulation exacte d'un vrai bulletin RAA de l'Aveyron reste à confirmer contre un vrai PDF téléchargé manuellement avant la mise en production de ce connecteur.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-12.yaml` matchent la formulation réelle ; revalider aussi la couverture Novembre/Décembre (limitation de pagination ci-dessus) avant la fin de l'année civile.
