/**
 * En-têtes HTTP par défaut pour tous les appels `fetch()` des moteurs de
 * connecteurs (`page_web`, `pdf`, `rss`).
 *
 * Un `fetch()` Node nu, sans aucun en-tête (en particulier sans
 * `User-Agent`), est indiscernable d'un client automatisé anonyme pour un
 * serveur distant. Constaté en session du 2026-08-20 (cf.
 * `claude/etat-connecteurs.md` du projet Cowork associé pour le détail de
 * l'investigation) : l'IP publique utilisée pour `npm run test:live-drift`
 * a été bloquée par l'hébergeur mutualisé derrière la quasi-totalité des
 * sites préfecture (une seule IP pour des dizaines de domaines `*.gouv.fr`)
 * après une rafale de requêtes sans aucun en-tête. S'identifier poliment
 * comme un robot est une pratique standard pour un client HTTP automatisé
 * légitime et réduit ce risque, y compris en production (une
 * resynchronisation de plusieurs connecteurs sur cet hébergeur mutualisé
 * pourrait sinon déclencher le même type de blocage).
 *
 * Générique par construction (contrat §5, règle 7) : ces en-têtes ne
 * dépendent d'aucun connecteur particulier, seulement du fait qu'il s'agit
 * d'un appel `fetch()` du moteur.
 */
// `Record<string, string>` plutôt que le type ambiant `HeadersInit` : ce
// projet compile avec `lib: ["ES2022"]` (pas de lib `DOM`, cf. tsconfig.json)
// et `HeadersInit` n'y est donc pas résolu globalement, même si le `fetch()`
// natif de Node l'accepte à l'exécution. `Record<string, string>` reste une
// forme valide de `RequestInit.headers` et compile sans dépendre de la lib DOM.
export const EN_TETES_HTTP_DEFAUT: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; ArretesRaveTeknivalBot/1.0)',
};
