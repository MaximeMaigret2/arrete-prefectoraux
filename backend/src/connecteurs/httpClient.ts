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
  /**
   * En-têtes ajoutés (ou remplaçant ceux de {@link EN_TETES_HTTP_DEFAUT} en
   * cas de collision) pour CET appel uniquement (V0xx, 2026-08-27, découvert
   * sur prefecture-57/Moselle) — typiquement un en-tête `Cookie` construit
   * par {@link construireEnTeteCookie} à partir d'une réponse d'amorçage de
   * session. Jamais de valeur par défaut, jamais persisté entre appels :
   * c'est à l'appelant (le moteur `page_web`, cf. `session_cookie` de
   * `config.schema.ts`) de re-fournir ces en-têtes à chaque requête d'une
   * même collecte.
   */
  enTetesSupplementaires?: Record<string, string>;
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
  const enTetes = options.enTetesSupplementaires
    ? { ...EN_TETES_HTTP_DEFAUT, ...options.enTetesSupplementaires }
    : EN_TETES_HTTP_DEFAUT;
  let derniereErreur: unknown;

  for (let tentative = 0; tentative <= tentativesSupplementaires; tentative++) {
    try {
      return await fetch(url, {
        headers: enTetes,
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

/**
 * Construit un en-tête `Cookie` (`nom1=valeur1; nom2=valeur2`) à partir des
 * `Set-Cookie` d'une réponse d'amorçage de session (V0xx, 2026-08-27,
 * prefecture-57/Moselle) — ignore volontairement les attributs de cookie
 * (`Path`, `HttpOnly`, `Expires`, ...), seuls `nom`/`valeur` étant pertinents
 * pour un en-tête `Cookie` de requête. Retourne `null` si la réponse ne
 * porte aucun `Set-Cookie` (config `session_cookie` pointant par erreur vers
 * une URL qui n'ouvre pas de session — traité par l'appelant comme une
 * absence d'en-tête supplémentaire, jamais une exception : une session
 * vide n'empêche pas la requête suivante d'être tentée telle quelle).
 *
 * Repose sur `Headers.getSetCookie()` (disponible nativement sur le
 * `fetch()` de Node ≥ 18.14, cf. undici) plutôt que sur `Headers.get`, qui
 * ne renverrait qu'un seul `Set-Cookie` fusionné et invalide en cas de
 * cookies multiples (cas réel de prefecture-57 : `DIMSPHPSESSID` ET
 * `nocache`).
 */
export function construireEnTeteCookie(reponse: Response): string | null {
  const enTetesSetCookie = reponse.headers.getSetCookie();
  if (enTetesSetCookie.length === 0) return null;
  const paires = enTetesSetCookie.map((brut) => brut.split(';', 1)[0]!.trim()).filter((paire) => paire.length > 0);
  return paires.length > 0 ? paires.join('; ') : null;
}
