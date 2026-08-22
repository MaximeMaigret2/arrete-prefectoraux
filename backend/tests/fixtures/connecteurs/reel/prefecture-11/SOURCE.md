# Source réelle — prefecture-11 (Aude)

**Capturé le** : 2026-08-14, par `fetch` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle** : `https://www.aude.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA`

## Ce qui a été vérifié en direct

- Page racine listant une carte par année (`.fr-card__title a`, href se terminant par `-2026`).
- Chaque année mène à une page listant une carte par mois — **sans suffixe d'année dans l'URL du mois** (href se terminant par `/Aout`, pas `/Aout-2026`) — même particularité que prefecture-07.
- Chaque page de mois liste les bulletins en PLATE (`.fr-downloads-group li`), non paginée : 15 bulletins pour août 2026 au moment de la capture, ordre chronologique croissant (03/08 → 14/08/2026), tous déjà sur une seule page — aucune étape de navigation supplémentaire n'est nécessaire.
- **TOUS** les liens de téléchargement portent le bug de markup réel `<a id= class="fr-link fr-link--download">` (id sans valeur, casse l'attribut `class`) — identique à prefecture-05/07/08/09 — vérifié en lisant le texte brut de la réponse serveur. `selecteur_titre`/`selecteur_lien_pdf` ciblent donc `a[href$='.pdf']`.
- Nom de fichier ("RAA SPECIAL N° 15_AOÛT 2026") : numérotation séquentielle **mensuelle** (01 à N par mois), sans rapport avec un numéro de référence global d'arrêté — contrairement à prefecture-12/14/15/16.
- Texte du lien (`"Télécharger RAA SPECIAL N° 15_AOÛT 2026"`) : ne contient jamais de mot-clé rave/teknival.

## Ce qui N'A PAS été vérifié (limite de cette capture)

Aucun outil disponible dans cette session ne permet de télécharger le **contenu binaire** d'un vrai PDF de ce site. Les 2 PDF de cette fixture (`bulletin-avec-arrete.pdf`, `bulletin-sans-arrete-pertinent.pdf`) sont donc **synthétiques**, générés avec `reportlab` pour reproduire un texte plausible d'arrêté (`Arrêté n° 11-2026-08-320`, `à compter du 13/08/2026`, `jusqu'au 18/08/2026`, conformes aux patterns de `prefecture-11.yaml`). Le numéro de référence (`320`) est une hypothèse — aucune séquence globale d'arrêtés n'a pu être observée sur ce site (contrairement à prefecture-12/14/15/16 dont le nom de fichier reprend directement cette séquence) — mais le format `{dept}-2026-08-{num}` reste celui déjà utilisé, sans vérification, pour tous les connecteurs précédents.

**Recommandation avant activation réelle** : télécharger manuellement un bulletin RAA récent et vérifier que `pattern_reference`/`patterns_dates` de `prefecture-11.yaml` matchent la formulation réelle — cette fixture valide l'ARCHITECTURE (navigation année → mois → PDF direct → scan de contenu), pas la formulation exacte du texte réglementaire.
