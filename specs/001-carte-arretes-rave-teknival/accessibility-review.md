# Revue d'accessibilité WCAG 2.1 AA — T046

Revue de code (statique) des composants Map, Legend, Calendar, Slider. Portée : usage de la
couleur (Principe 4 / FR-002) et navigation clavier. Cette revue n'a pas pu être complétée par un
audit assisté par navigateur/lecteur d'écran dans cet environnement (voir Constat d'environnement
dans `backend/README.md` / `frontend/README.md`) — à effectuer avant mise en production.

## Map (`frontend/src/components/Map/Map.tsx`)

- Chaque département porte `role="button"`, `tabIndex={0}`, un `aria-label` textuel
  (`"{nom} : {etat}"`) et déclenche l'infobulle aussi bien au clavier (`onFocus`/`onBlur`) qu'à la
  souris (`onMouseEnter`/`onMouseMove`/`onMouseLeave`) → navigable et consultable au clavier seul.
- `ComposableMap` porte `role="img"` et un `aria-label` décrivant le contenu de la carte pour les
  technologies d'assistance qui ne parcourent pas les départements individuellement.
- Indicateur non fondé sur la seule couleur (FR-002) : un symbole (`●`/`▲`/`■`) est superposé au
  centroïde de chaque département (`SYMBOL_BY_ETAT`), cohérent avec la légende. **Limite connue** :
  ce symbole est actuellement `aria-hidden` et rendu en texte SVG minuscule (6px) — suffisant pour
  la distinction non-couleur au sens strict (perceptible visuellement indépendamment de la couleur)
  mais sa taille devra être revue lors d'un test utilisateur réel (contraste/lisibilité à l'échelle
  nationale de la carte).
- **À vérifier avant production** : contraste des couleurs `--color-vert`/`--color-rouge`/
  `--color-gris` sur fond blanc (ratio ≥ 3:1 pour les éléments graphiques, WCAG 1.4.11) — non
  mesuré ici faute d'outillage de rendu dans cet environnement.

## Legend (`frontend/src/components/Legend/Legend.tsx`)

- Chaque entrée combine un symbole (`aria-hidden`, décoratif) et un libellé textuel complet
  (`<strong>` + description), donc entièrement lisible par un lecteur d'écran sans dépendre de la
  couleur (SC-002).
- Structure sémantique : `<section aria-labelledby="legend-heading">` + `<h2>` + `<ul>`.

## Calendar (`frontend/src/components/Calendar/Calendar.tsx`)

- Bascule "Date unique / Intervalle" implémentée avec de vrais `<input type="radio">` + `<label>`
  associés (accessibles nativement au clavier et aux lecteurs d'écran) plutôt que des boutons
  stylés.
- `react-day-picker` (research.md §6) fournit une grille de dates accessible par défaut
  (rôle `grid`, navigation clavier, `aria-selected`) — non re-vérifié manuellement ici (dépendance
  tierce), à confirmer lors d'un test avec lecteur d'écran réel.

## Slider (`frontend/src/components/Slider/Slider.tsx`)

- Basé sur `@radix-ui/react-slider` (research.md §6), primitive accessible par défaut : rôle
  `slider`, support flèches clavier, `aria-valuenow`/`aria-valuemin`/`aria-valuemax` gérés par
  Radix.
- `aria-label="Sélection de la date affichée sur la carte"` explicite ajouté sur `Slider.Root`.
- La date courante est également affichée en texte visible (`<label>` + `<strong>{value}</strong>`)
  au-dessus de la réglette, redondant avec la position du curseur (pas de dépendance à la seule
  position visuelle/couleur).

## Conclusion

Aucune violation structurelle identifiée à la lecture du code (rôles ARIA, `tabIndex`, libellés
textuels et indicateurs non-couleur présents partout où l'état vert/rouge/gris est communiqué).
Restent à faire avant mise en production, avec les outils appropriés (non disponibles dans cet
environnement d'exécution) : mesure de contraste réelle, test de navigation clavier bout-en-bout,
et test avec un lecteur d'écran (NVDA/VoiceOver).
