# Source réelle — prefecture-23 (Creuse)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine).

**URL réelle (racine)** : `https://www.creuse.gouv.fr/Publications/Les-Recueils-des-actes-administratifs`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200` (vérifié `curl -I -L`), sans redirection 301 — aucune correction nécessaire.

## ⚠️ Découverte majeure : premier arrêté anti rave-party RÉEL confirmé

Contrairement aux 26 connecteurs précédemment déployés (01-19, 2A, 2B, 21, 22 — jamais de mention réelle de rassemblement musical non déclaré trouvée dans un échantillon PDF téléchargé), le bulletin **`2026-081.pdf`** (RAA spécial n°23-2026-136, publié le 11/08/2026, page « Spéciaux » de l'année 2026) contient un **arrêté préfectoral réel et actuellement en vigueur** :

> ARRÊTÉ PRÉFECTORAL Nº 23-2026-08-11-0015 DU 11 AOÛT 2026
> portant interdiction temporaire de rassemblements festifs à caractère musical dans le département de la Creuse

Considérants : « un ou plusieurs rassemblements revendicatifs et festifs à caractère musical pouvant regrouper plusieurs milliers de participants sont susceptibles de se dérouler entre le vendredi 14 août 2026 et lundi 17 août 2026 » sans déclaration préalable déposée — arrêté pris sur le fondement du code de la sécurité intérieure (art. L.211-5 à L.211-8), Vigipirate niveau « renforcée ». **Interdiction du vendredi 14 août 2026 17h au lundi 17 août 2026 inclus** — donc EN VIGUEUR au moment même du déploiement de ce connecteur (14/08/2026). Fait référence à un arrêté antérieur similaire du 11 juillet 2026, signe d'une pratique récurrente de la préfecture de la Creuse pour ce type d'événement.

Le même PDF compile un second arrêté (`23-2026-08-11-00016`, interdiction de circulation des poids-lourds transportant du matériel de sonorisation vers un tel rassemblement, mêmes dates) — mesure ancillaire, pas retenue comme référence principale (cf. `pattern_reference` dans `configs/prefecture-23.yaml`, qui ancre spécifiquement sur le titre "portant interdiction temporaire de rassemblements" pour cibler le bon arrêté des deux).

Les deux arrêtés sont signés « Pour le Préfet et par délégation, le secrétaire général, signé Ottman ZAÏR » — `autorite_signataire` reste néanmoins la valeur déclarative fixe « Le préfet de la Creuse » (autorité légale de l'arrêté, jamais extraite du texte).

**Le PDF réel intégral (9 pages, 122 Ko) est utilisé TEL QUEL comme fixture `bulletin-avec-arrete.pdf`** — pas un fichier synthétique `reportlab` comme pour tous les connecteurs précédents. Extraction bout en bout vérifiée avec `extraireChampsCommuns` (le vrai code de production) avant écriture de `configs/prefecture-23.yaml` :
```
{ reference_arrete: "23-2026-08-11-0015", date_debut: "2026-08-14T00:00:00.000Z", date_fin: "2026-08-17T00:00:00.000Z" }
```

`bulletin-sans-arrete-pertinent.pdf` est également un vrai PDF téléchargé (`2026-082.pdf`, RAA spécial n°23-2026-137, 5 pages, portant uniquement sur une interdiction de tirs de feux d'artifice) — vérifié sans aucune mention rave/teknival/rassemblement. **Attention** : un troisième bulletin exploré au passage, `2026-080.pdf` (RAA spécial n°23-2026-135), contient LUI AUSSI un arrêté anti rave-party réel antérieur (`23-2026-08-04-00003`, daté du 04/08/2026, pour un week-end différent) — signe que ces arrêtés sont récurrents pour ce département durant l'été, pas un événement isolé. Ce bulletin n'est PAS utilisé comme fixture "sans arrêté" pour cette raison (aurait été un mauvais témoin négatif).

**Recommandation opérationnelle** : au vu de cette découverte, envisager de déclencher une VRAIE collecte pour `prefecture-23` (au-delà du simple déploiement du connecteur) afin que la carte reflète l'état réel du département — décision proposée à l'opérateur plutôt que prise unilatéralement par cette session (le déploiement d'un connecteur n'a, par convention établie dans ce projet, jamais déclenché de collecte réelle automatique jusqu'ici).

## Ce qui a été vérifié en direct (structure)

- **Page racine** : liste une carte DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `Annee-{annee}`), comme prefecture-01/13/18/19/33/77.
- **Page de l'année (`Annee-2026`)** : NE liste PAS directement les bulletins — répartit en TROIS catégories, chacune une carte DSFR séparée : « Spéciaux » (`/Speciaux`), « Réguliers » (`/Reguliers`), « Nominatifs » (`/Nominatifs`). PARTICULARITÉ NOUVELLE parmi les 27 connecteurs à ce jour (jamais de découpage par CATÉGORIE plutôt que par mois/pagination).
- **LIMITE DE COUVERTURE ASSUMÉE** : le moteur `page_web` ne suit qu'une seule chaîne de navigation linéaire (contrat §5 règle 8) — ce connecteur cible UNIQUEMENT « Spéciaux », pas « Réguliers »/« Nominatifs ». Choix justifié par la preuve directe ci-dessus : l'arrêté anti rave-party réel trouvé est publié en « Spéciaux » (« hors période de publication régulière », texte de la page), cohérent avec son caractère urgent (2-3 jours entre publication et événement). Un futur arrêté publié par erreur en « Réguliers » échapperait à ce connecteur — limite documentée, pas un bug caché.
- **Page « Spéciaux »** : liste DIRECTEMENT tous les bulletins de l'année (82 au moment de la capture), chaque bulletin étant un `<div class="">` contenant un unique `<a class="fr-link fr-link--download">` (texte "Télécharger {reference}") avec lien PDF DIRECT — pas de page de détail. `selecteur_publications: "div:has(a.fr-link--download)"` (CSS4 `:has()`, comme prefecture-21) car d'autres `<div class="">` sans rapport existent ailleurs sur la page (ex. paragraphes vides `&nbsp;`).
- Chaque bulletin « Spéciaux » est précédé d'un `<p>` décrivant sommairement son contenu (hors du lien lui-même) — c'est CE `<p>` qui a permis de repérer l'arrêté anti rave-party avant même de télécharger le PDF ; le connecteur, lui, ne s'appuie QUE sur `selecteur_titre` (le texte du lien "Télécharger {reference}", qui ne mentionne jamais le contenu) et le scan du texte PDF, comme tous les connecteurs précédents — cette description en `<p>` n'est PAS utilisée par la config (elle n'existe que pour l'inspection humaine de cette session).
- Page NON paginée (82 bulletins « Spéciaux » de 2026, tous sur une seule page HTML).
- Aucun `id=` vide/malformé détecté sur cette page.

`racine.html`/`annee-2026.html`/`speciaux-2026.html` ne reproduisent que quelques éléments (sur 2 cartes racine / 3 cartes catégorie / 82 bulletins réels de la page « Spéciaux » au moment de la capture) — une reconstruction fidèle de la structure observée en direct, pas un dump complet de chaque page. `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont en revanche les VRAIS PDF intégraux (contrairement aux autres connecteurs).
