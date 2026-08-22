# Source réelle — prefecture-27 (Eure)

**Capturé le** : 2026-08-14, par `curl` direct (le sandbox cloud de cette session dispose d'un accès réseau sortant vers ce domaine pour les pages HTML).

**URL réelle (racine)** : `https://www.eure.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA`

Note : l'URL notée dans `registre-sources.yaml` le 2026-08-13 répond directement `200`, sans redirection — aucune correction nécessaire.

## Ce qui a été vérifié en direct

- **Page racine** : mélange des cartes DSFR par ANNÉE (`.fr-card__title a`, href se terminant par `RAA-{annee}`) ET des cartes de bulletins spéciaux épinglés individuellement (href ne se terminant PAS par `RAA-{annee}`, ex. `Recueil-special-N-27-2026-217-du-10-juillet-2026`) — motif `RAA-{annee}$` (ancré) pour ignorer sans ambiguïté ces cartes épinglées.
- **Page de l'année (`RAA-2026`)** : liste chaque bulletin comme une carte DSFR complète (`div.fr-card`, `a.fr-card__link`), PAGINÉE (`fr-pagination` présent) mais en ordre chronologique DÉCROISSANT (le plus récent en tête, page 1) — aucune étape de pagination nécessaire. 10 bulletins par page, tous des "Recueil spécial N°27-2026-NNN" au moment de la capture (243 à 252).
- Chaque carte pointe vers une page de DÉTAIL HTML (vérifié : `Content-Type: text/html`, la carte ne porte pas de lien PDF direct) → `page_detail`, où le vrai lien PDF apparaît via `<a id="..." class="fr-link fr-link--download" href="...pdf">`, avec un `id=` PORTANT une valeur (pas de bug de markup comme sur 05/07/08/09/11/12/14) — classe intacte.
- Aucun `id=` vide/malformé détecté sur les 6 pages de détail échantillonnées (247 à 252).

## Signataire réel

Confirmé par le logo textuel DSFR de chaque carte : « Préfet<br />de l'Eure » (masculin).

## LIMITE DE CAPTURE (nouvelle par rapport aux lots précédents)

Le endpoint `/contenu/telechargement/...` de ce site refuse systématiquement les téléchargements automatisés depuis le sandbox cloud de cette session : `curl`/`wget`/`urllib.request`, avec ou sans en-têtes `Referer`/cookies de session, échouent tous avec une connexion TLS fermée sans réponse (`curl: (52) Empty reply from server` ou `(56) Send failure: Broken pipe`), y compris pour un nom de fichier SANS espace ni caractère spécial (`recueil-27-2026-247-recueil-des-actes-administratifs.pdf`). Les pages HTML (racine, année, détail) du même domaine se récupèrent normalement avec les mêmes outils — la restriction cible spécifiquement ce chemin de téléchargement, probablement un WAF. Contrairement à la plupart des autres connecteurs de ce projet, AUCUN vrai PDF n'a donc pu être échantillonné pour ce département.

`bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` sont entièrement synthétiques (`reportlab`), et la formulation exacte d'un vrai arrêté anti rave-party de l'Eure demeure non vérifiée, comme `patterns_dates`/`pattern_reference`.

`racine.html`/`RAA-2026.html`/`detail-252.html`/`detail-251.html` ne reproduisent que quelques éléments (sur 3 cartes racine / 10 cartes de la page 1 de l'année) — une reconstruction fidèle de la structure observée en direct (titres, hrefs, IDs des pages de détail réels), pas un dump complet de chaque page. Les URLs des bulletins et de leurs pages de détail (252, 251, 247) sont les VRAIES URLs capturées ; seul le contenu des deux PDF de test est synthétique.
