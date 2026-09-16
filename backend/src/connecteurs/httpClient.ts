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
 * après une rafale de requêtes sans aucun en-tête.
 *
 * Générique par construction (contrat §5, règle 7) : ces en-têtes ne
 * dépendent d'aucun connecteur particulier, seulement du fait qu'il s'agit
 * d'un appel `fetch()` du moteur.
 *
 * Q-007 (lot Qualité — Durcissement, 2026-08-22) puis RÉVISÉ (2026-09-13,
 * décision utilisateur — solution 2) : portait à l'origine un `User-Agent`
 * s'identifiant explicitement comme un robot (`ArretesRaveTeknivalBot/1.0`,
 * contact `+mailto:...`) — convention standard des bots HTTP (cf.
 * Googlebot, robots RFC 9309 §2.4) pour permettre à un administrateur de
 * site préfecture de signaler un problème plutôt que de bloquer l'IP en
 * silence. Abandonné après diagnostic sur prefecture-56/Morbihan : un test
 * A/B `curl` isolé (même PDF, même instant, seul le `User-Agent` changeait)
 * a montré que CE `User-Agent` précisément — vraisemblablement le mot
 * "Bot" qu'il contient — déclenchait un rejet systématique et immédiat
 * (`curl: (52) Empty reply from server`, y compris au tout premier essai —
 * donc un filtrage sur signature de client, pas un rate-limiting temporel)
 * par un pare-feu applicatif (WAF) devant l'hébergeur mutualisé, alors
 * qu'un `User-Agent` de navigateur classique passait sans encombre.
 * Remplacé par un `User-Agent` Chrome desktop générique : moins
 * transparent qu'un bot auto-déclaré, mais nécessaire pour obtenir un
 * accès réel aux PDF de cet hébergeur.
 */
// `Record<string, string>` plutôt que le type ambiant `HeadersInit` : ce
// projet compile avec `lib: ["ES2022"]` (pas de lib `DOM`, cf. tsconfig.json)
// et `HeadersInit` n'y est donc pas résolu globalement, même si le `fetch()`
// natif de Node l'accepte à l'exécution. `Record<string, string>` reste une
// forme valide de `RequestInit.headers` et compile sans dépendre de la lib DOM.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EN_TETES_HTTP_DEFAUT: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
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

/**
 * Détecte le refus synthétique du proxy de sortie réseau du sandbox Cowork
 * (2026-09-13, cf. issue GitHub #93643 — régression du sandbox observée
 * entre le 2026-07-29 et le ~2026-09-04) : un hôte externe absent de
 * l'allowlist d'égress reçoit un faux `403` généré par CE proxy — jamais une
 * vraie réponse du serveur préfecture visé — identifiable par l'en-tête
 * `x-deny-reason: host_not_allowed`, qu'aucune réponse HTTP légitime ne
 * porte. Constaté (2026-09-11) : ce mécanisme bloque le `fetch()` natif de
 * Node (undici) mais pas `curl`, alors que les deux passent par la même
 * variable d'environnement `https_proxy` — écart reproductible (4/4 contre
 * 4/4 lors de l'investigation), jamais aléatoire.
 */
function estRefusParEgressSortant(reponse: Response): boolean {
  return reponse.status === 403 && reponse.headers.get('x-deny-reason') === 'host_not_allowed';
}

/**
 * Parse la sortie `-D` de `curl` (en-têtes de réponse bruts ; un bloc par
 * redirection suivie avec `-L`, blocs séparés par une ligne vide) et n'en
 * retient que le DERNIER bloc — celui de la réponse finale, après toute
 * redirection.
 */
function analyserEnTetesCurl(brut: string): { statut: number; statutTexte: string; enTetesReponse: Headers } {
  const blocs = brut
    .split(/\r?\n\r?\n/)
    .map((bloc) => bloc.trim())
    .filter((bloc) => bloc.length > 0);
  const dernierBloc = blocs[blocs.length - 1] ?? '';
  const lignes = dernierBloc.split(/\r?\n/);
  const correspondance = /^HTTP\/\S+\s+(\d+)\s*(.*)$/.exec(lignes[0] ?? '');
  const statut = correspondance ? Number(correspondance[1]) : 0;
  const statutTexte = correspondance?.[2]?.trim() ?? '';

  const enTetesReponse = new Headers();
  for (const ligne of lignes.slice(1)) {
    const indexDeuxPoints = ligne.indexOf(':');
    if (indexDeuxPoints === -1) continue;
    const nom = ligne.slice(0, indexDeuxPoints).trim();
    const valeur = ligne.slice(indexDeuxPoints + 1).trim();
    if (nom.length > 0) enTetesReponse.append(nom, valeur);
  }
  return { statut, statutTexte, enTetesReponse };
}

/**
 * Rejoue une requête GET via un sous-processus `curl` plutôt que le
 * `fetch()` natif de Node (2026-09-13, repli — cf.
 * {@link estRefusParEgressSortant}). Écrit les en-têtes et le corps de la
 * réponse dans des fichiers temporaires (`-D`/`-o`, plutôt que de les
 * capturer sur stdout) pour ne jamais mélanger en-têtes et corps binaire
 * dans un même flux ; nettoie systématiquement le dossier temporaire
 * (`finally`), y compris en cas d'échec de `curl` lui-même. Suit les
 * redirections (`-L`) comme le ferait `fetch()` par défaut.
 *
 * `--http1.1` forcé (2026-09-13, constaté lors de la campagne réelle
 * Morbihan depuis le sandbox cloud) : `curl` négocie HTTP/2 par défaut, et
 * l'hébergeur mutualisé (déjà documenté fragile, cf.
 * {@link EN_TETES_HTTP_DEFAUT}) a fermé la quasi-totalité des téléchargements
 * de PDF avec `HTTP/2 stream ... ENHANCE_YOUR_CALM` dès qu'un nombre modéré
 * de requêtes s'enchaînait — un throttling au niveau du flux HTTP/2, pas de
 * l'égress. HTTP/1.1 (une connexion par requête, sans multiplexage de flux)
 * élimine ce mode d'échec spécifique à `curl`, absent avec `fetch()`/undici
 * qui n'y était jamais confronté faute d'atteindre ce serveur.
 *
 * Timeout `execFile` en plus de `--max-time` (2026-09-15, suite à un run
 * automatique quotidien bloqué ~23 minutes sur un seul connecteur, socket
 * ouvert mais aucune progression ni consommation CPU, jusqu'à l'arrêt par
 * le timeout dur de l'appelant — cf. `claude/2026-09-15-backfill-auto.md`
 * du projet Cowork associé) : `--max-time` borne la durée de la requête
 * HTTP elle-même vue PAR `curl`, mais un sous-processus qui ne démarre
 * jamais réellement (ex. blocage lors de l'établissement de la connexion
 * via le proxy de sortie réseau, avant que le chronomètre interne de
 * `curl` ne s'applique) n'est pas nécessairement couvert par ce seul
 * mécanisme. `execFile` reçoit désormais son propre `timeout` (délai du
 * fetch + marge, {@link DELAI_TIMEOUT_MS} + 5s) en filet de sécurité
 * indépendant, ceinture et bretelles : si `curl` ne s'arrête pas de
 * lui-même, Node force l'arrêt du sous-processus (`killSignal: 'SIGKILL'`)
 * plutôt que de laisser un appel unique de `fetchAvecEnTetes()` (et donc
 * toute la campagne de backfill qui l'attend) bloqué indéfiniment.
 */
async function requeteViaCurl(url: string, enTetes: Record<string, string>): Promise<Response> {
  const dossierTmp = await mkdtemp(path.join(tmpdir(), 'httpClient-curl-'));
  const cheminEnTetes = path.join(dossierTmp, 'headers.txt');
  const cheminCorps = path.join(dossierTmp, 'body.bin');
  try {
    const argsEnTetes = Object.entries(enTetes).flatMap(([nom, valeur]) => ['-H', `${nom}: ${valeur}`]);
    await execFileAsync(
      'curl',
      [
        '-sS',
        '-L',
        '--http1.1',
        '--max-time',
        String(Math.ceil(DELAI_TIMEOUT_MS / 1000)),
        '-D',
        cheminEnTetes,
        '-o',
        cheminCorps,
        ...argsEnTetes,
        url,
      ],
      { timeout: DELAI_TIMEOUT_MS + 5_000, killSignal: 'SIGKILL' },
    );

    const [brutEnTetes, corps] = await Promise.all([readFile(cheminEnTetes, 'utf-8'), readFile(cheminCorps)]);
    const { statut, statutTexte, enTetesReponse } = analyserEnTetesCurl(brutEnTetes);
    if (statut < 200 || statut > 599) {
      throw new Error(`repli curl : impossible d'interpréter la réponse (statut=${statut})`);
    }

    const corpsFinal = statut === 204 || statut === 205 || statut === 304 ? null : corps;
    return new Response(corpsFinal, { status: statut, statusText: statutTexte, headers: enTetesReponse });
  } finally {
    await rm(dossierTmp, { recursive: true, force: true });
  }
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
 *
 * Repli `curl` (2026-09-13, décision utilisateur, option 1 retenue face à un
 * blocage du proxy de sortie réseau du sandbox Cowork) : lorsqu'une réponse
 * HTTP est bien reçue mais correspond exactement à la signature du refus
 * synthétique du proxy d'égress d'Anthropic (cf. {@link estRefusParEgressSortant}
 * — bug connu, issue GitHub #93643), elle n'est jamais renvoyée telle quelle
 * à l'appelant : une requête équivalente est rejouée via un sous-processus
 * `curl`, qui partage la même variable d'environnement `https_proxy` mais
 * s'est révélé, de façon reproductible, ne PAS être bloqué par ce même
 * mécanisme (contrairement à `fetch()`/undici). Ce repli est sans effet en
 * dehors de ce cas précis : un vrai `403` renvoyé par un serveur préfecture
 * (sans l'en-tête `x-deny-reason`) continue de remonter normalement à
 * l'appelant comme une erreur métier (contrat §5, règle 6, inchangée).
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
      const reponse = await fetch(url, {
        headers: enTetes,
        signal: AbortSignal.timeout(DELAI_TIMEOUT_MS),
      });
      return estRefusParEgressSortant(reponse) ? await requeteViaCurl(url, enTetes) : reponse;
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
