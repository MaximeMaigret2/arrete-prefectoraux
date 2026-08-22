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
 *
 * Q-007 (lot Qualité — Durcissement, 2026-08-22) : ajoute un contact
 * (`+mailto:...`) au `User-Agent` — convention standard des bots HTTP
 * (cf. Googlebot, robots RFC 9309 §2.4) permettant à un administrateur de
 * site préfecture de signaler un problème plutôt que de bloquer l'IP en
 * silence ; pas d'URL de projet publique existante à ce jour (aucun domaine
 * trouvé dans le dépôt), donc contact direct par email plutôt qu'un domaine
 * inventé.
 */
// `Record<string, string>` plutôt que le type ambiant `HeadersInit` : ce
// projet compile avec `lib: ["ES2022"]` (pas de lib `DOM`, cf. tsconfig.json)
// et `HeadersInit` n'y est donc pas résolu globalement, même si le `fetch()`
// natif de Node l'accepte à l'exécution. `Record<string, string>` reste une
// forme valide de `RequestInit.headers` et compile sans dépendre de la lib DOM.
export const EN_TETES_HTTP_DEFAUT: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; ArretesRaveTeknivalBot/1.0; +mailto:maxime.maigret2@gmail.com)',
};

/** Délai maximal avant abandon d'une tentative de requête (Q-007). */
const DELAI_TIMEOUT_MS = 15_000;

/** Nombre de tentatives supplémentaires après un premier échec réseau transitoire (Q-007). */
const TENTATIVES_SUPPLEMENTAIRES_PAR_DEFAUT = 2;

/** Délai de base (ms) du backoff exponentiel entre deux tentatives (Q-007). */
const DELAI_BASE_BACKOFF_MS = 500;

async function attendre(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OptionsFetchAvecEnTetes {
  /** Nombre de tentatives supplémentaires après le premier échec (par défaut {@link TENTATIVES_SUPPLEMENTAIRES_PAR_DEFAUT}). */
  tentativesSupplementaires?: number;
}

/**
 * Point d'entrée unique pour tous les appels `fetch()` des moteurs de
 * connecteurs (Q-007, lot Qualité — Durcissement, 2026-08-22 — remplace les
 * appels `fetch()` nus dispersés dans `moteurs/{pageWeb,pdf,rss}/moteur.ts`,
 * explicitement repoussé en 2026-08-19/20).
 *
 * Applique systématiquement {@link EN_TETES_HTTP_DEFAUT}, un timeout
 * (`AbortSignal.timeout`, {@link DELAI_TIMEOUT_MS}) et un retry avec backoff
 * exponentiel sur les erreurs réseau TRANSITOIRES — `fetch()` qui rejette
 * (coupure, DNS, `SocketError` déjà observé sur 01/03/12, timeout
 * dépassé) — jamais sur une réponse HTTP reçue mais non-2xx, qui reste une
 * erreur métier gérée telle quelle par chaque moteur (contrat §5, règle 6 :
 * un candidat/connecteur en échec n'est jamais masqué par une retentative
 * silencieuse côté transport — seul le transport lui-même est retenté).
 */
export async function fetchAvecEnTetes(
  url: string,
  options: OptionsFetchAvecEnTetes = {},
): Promise<Response> {
  const tentativesSupplementaires = options.tentativesSupplementaires ?? TENTATIVES_SUPPLEMENTAIRES_PAR_DEFAUT;
  let derniereErreur: unknown;

  for (let tentative = 0; tentative <= tentativesSupplementaires; tentative++) {
    try {
      return await fetch(url, {
        headers: EN_TETES_HTTP_DEFAUT,
        signal: AbortSignal.timeout(DELAI_TIMEOUT_MS),
      });
    } catch (err) {
      derniereErreur = err;
      if (tentative === tentativesSupplementaires) break;
      await attendre(DELAI_BASE_BACKOFF_MS * 2 ** tentative);
    }
  }

  throw derniereErreur;
}
