import { fetchAvecEnTetes, type OptionsFetchAvecEnTetes } from '../../../src/connecteurs/httpClient.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Helper partagé pour `tests/live/connecteurs/*.live.test.ts` (`npm run
 * test:live-drift`) — introduit le 2026-08-30 en remplacement de la
 * duplication historique par fichier : 43 fichiers appelaient `fetch()` nu
 * (aucun en-tête `User-Agent`), 52 dupliquaient un `fetchAvecSession` et un
 * `EN_TETES_COURTOISIE` identiques, et `substituerPlaceholders`/`resoudreUrl`
 * étaient réécrits dans 95/82 fichiers respectivement (cf.
 * `claude/etat-connecteurs.md` du projet Cowork associé pour le détail de
 * l'investigation qui a motivé ce refactor).
 *
 * Trois objectifs :
 * 1. Cohérence — un seul point de vérité pour l'en-tête de courtoisie et la
 *    résolution de placeholders/URLs, au lieu de dizaines de copies.
 * 2. Fiabilité réseau — espacement minimal explicite entre CHAQUE requête
 *    HTTP de la suite complète, tous fichiers confondus. `fileParallelism:
 *    false` (2026-08-28) garantit déjà que les fichiers s'exécutent l'un
 *    après l'autre, mais aucun espacement n'existait entre eux avant ce
 *    refactor.
 * 3. Circuit-breaker (ajouté le 2026-08-30, cf. plus bas) — un run réel du
 *    2026-08-30 AVEC throttle (2s) a montré 18/96 fichiers verts puis un
 *    blocage total des 78 suivants, motif quasiment identique à un run
 *    précédent SANS throttle (20/96 verts) : le throttle seul ne suffit pas
 *    à éviter le blocage de l'hébergeur mutualisé `77.159.252.140`, dont le
 *    seuil de déclenchement ressemble à un compteur de requêtes sur une
 *    fenêtre de l'ordre de la minute plutôt qu'à une détection de rafale
 *    instantanée sensible à un espacement de 2s. Une fois le blocage
 *    enclenché, le run continuait à marteler l'hôte déjà bloqué pour tous
 *    les fichiers restants (chacun retenté 3 fois via `fetchAvecEnTetes`
 *    avant d'abandonner) — cf. section "Quatrième run réel" du journal
 *    projet pour le détail complet du raisonnement.
 */

const DELAI_MIN_ENTRE_REQUETES_MS = Number(process.env.LIVE_DRIFT_DELAI_MS ?? 2000);

// Verrou sur disque plutôt qu'une variable de module : nécessaire pour
// espacer correctement les requêtes ENTRE fichiers de test. `fileParallelism:
// false` garantit que les fichiers s'exécutent séquentiellement, mais ne
// garantit PAS qu'ils partagent un état de module en mémoire (dépend du pool
// Vitest utilisé) — un verrou sur disque fonctionne quel que soit ce détail
// d'implémentation. `os.tmpdir()` plutôt qu'un chemin du dépôt : jamais
// commité, jamais partagé avec l'utilisateur, propre à cette machine.
// Réinitialisé au début de chaque run par `globalSetupLive.ts`.
const VERROU_PATH = path.join(os.tmpdir(), 'arretes-rave-teknival-live-drift-throttle.json');

async function attendreThrottle(): Promise<void> {
  if (DELAI_MIN_ENTRE_REQUETES_MS <= 0) return;

  let dernierAppel = 0;
  try {
    const contenu = await readFile(VERROU_PATH, 'utf-8');
    dernierAppel = (JSON.parse(contenu) as { dernierAppel?: number }).dernierAppel ?? 0;
  } catch {
    // Pas de verrou existant (tout premier appel de la suite, ou fichier
    // temporaire nettoyé entre deux runs) — rien à attendre.
  }

  const attente = DELAI_MIN_ENTRE_REQUETES_MS - (Date.now() - dernierAppel);
  if (attente > 0) {
    await new Promise((resolve) => setTimeout(resolve, attente));
  }

  // Écrit la marque de temps APRÈS l'attente, pas avant — sinon deux appels
  // rapprochés calculeraient chacun leur délai contre la même valeur périmée
  // et pourraient passer tous les deux sans attendre l'un derrière l'autre.
  try {
    await writeFile(VERROU_PATH, JSON.stringify({ dernierAppel: Date.now() }), 'utf-8');
  } catch {
    // Écriture best-effort : un échec ici (permissions, disque) ne doit
    // jamais faire échouer le test lui-même, seulement dégrader le throttle
    // vers "pas d'attente" pour cet appel.
  }
}

/**
 * Circuit-breaker (2026-08-30) — état partagé sur disque (même raison que le
 * verrou de throttle ci-dessus : pas de garantie d'état mémoire partagé
 * entre fichiers Vitest). Compte les échecs réseau TRANSITOIRES consécutifs
 * (ceux que `fetchAvecEnTetes` a fini par laisser remonter après épuisement
 * de ses propres tentatives) à travers TOUS les fichiers du run. Au-delà du
 * seuil, le circuit "ouvre" : tout appel suivant échoue immédiatement, SANS
 * attente de throttle et SANS aucune tentative réseau — le rapport de test
 * final reste complet (96 fichiers, chacun pass/fail), mais plus aucune
 * requête HTTP n'est envoyée vers un hôte déjà bloqué. Réinitialisé au
 * début de chaque run par `globalSetupLive.ts` : un blocage constaté un
 * jour ne doit jamais présumer silencieusement d'un blocage encore actif
 * un jour ultérieur.
 *
 * Une réponse HTTP reçue mais non-2xx (ex. le `HTTP 403` Cloudflare sur
 * `prefecture-75`) NE compte PAS comme un échec ici : `fetchAvecEnTetes` ne
 * lève une exception que sur un échec de transport (coupure, DNS, socket
 * fermé) — une réponse non-2xx est retournée normalement et gérée par
 * chaque test comme une erreur métier (contrat §5, règle 6), sans jamais
 * affecter ce compteur ni le throttle.
 */
const SEUIL_CIRCUIT_OUVERT = Number(process.env.LIVE_DRIFT_SEUIL_CIRCUIT ?? 3);
const CIRCUIT_PATH = path.join(os.tmpdir(), 'arretes-rave-teknival-live-drift-circuit.json');

interface EtatCircuit {
  echecsConsecutifs: number;
  ouvert: boolean;
}

async function lireEtatCircuit(): Promise<EtatCircuit> {
  try {
    const contenu = await readFile(CIRCUIT_PATH, 'utf-8');
    return JSON.parse(contenu) as EtatCircuit;
  } catch {
    return { echecsConsecutifs: 0, ouvert: false };
  }
}

async function ecrireEtatCircuit(etat: EtatCircuit): Promise<void> {
  try {
    await writeFile(CIRCUIT_PATH, JSON.stringify(etat), 'utf-8');
  } catch {
    // Best-effort, même raisonnement que attendreThrottle : un échec
    // d'écriture ici ne doit jamais faire échouer le test lui-même.
  }
}

/** Erreur distincte pour un appel abandonné par le circuit-breaker — le
 * message le dit explicitement pour ne jamais être confondu avec une vraie
 * dérive de structure lors de la lecture du rapport de test. */
export class CircuitOuvertError extends Error {
  constructor() {
    super(
      `Circuit-breaker ouvert : ${SEUIL_CIRCUIT_OUVERT} échecs réseau transitoires consécutifs détectés plus ` +
        `tôt dans ce run (probable blocage de l'hébergeur mutualisé) — requête abandonnée SANS tentative ` +
        `réseau pour ne pas aggraver le blocage. Ce n'est pas une dérive de structure : relancer ` +
        `\`test:live-drift\` plus tard suffit à réinitialiser ce compteur.`,
    );
    this.name = 'CircuitOuvertError';
  }
}

/**
 * Remplace tous les usages de `fetch()` nu et de l'ancien `fetchAvecSession`
 * dupliqué par fichier. Réutilise `fetchAvecEnTetes()` (`httpClient.ts`
 * réel, jamais dupliqué ici) pour l'en-tête `User-Agent` de courtoisie et le
 * timeout/retry déjà en place en production, ajoute l'espacement ci-dessus
 * avant CHAQUE requête, et court-circuite immédiatement si le circuit est
 * déjà ouvert. `optionsSupplementaires` permet d'injecter un en-tête
 * `Cookie` (cf. `prefecture-57`, `session_cookie`) via le même mécanisme
 * `enTetesSupplementaires` que la production, sans dupliquer la fusion
 * d'en-têtes.
 */
export async function fetchAvecSession(
  url: string,
  optionsSupplementaires: OptionsFetchAvecEnTetes = {},
): Promise<Response> {
  const etatAvant = await lireEtatCircuit();
  if (etatAvant.ouvert) {
    throw new CircuitOuvertError();
  }

  await attendreThrottle();

  try {
    const reponse = await fetchAvecEnTetes(url, optionsSupplementaires);
    if (etatAvant.echecsConsecutifs > 0) {
      await ecrireEtatCircuit({ echecsConsecutifs: 0, ouvert: false });
    }
    return reponse;
  } catch (err) {
    const echecsConsecutifs = etatAvant.echecsConsecutifs + 1;
    await ecrireEtatCircuit({
      echecsConsecutifs,
      ouvert: echecsConsecutifs >= SEUIL_CIRCUIT_OUVERT,
    });
    throw err;
  }
}

/**
 * Substitution des placeholders de date dans un motif de navigation
 * (`{annee}`, `{mois_numero}`, `{mois_fr}`, `{mois_fr_minuscule}`).
 * Version complète (identique à celle déjà dupliquée dans la majorité des
 * fichiers) : les fichiers dont le motif n'utilise qu'un sous-ensemble de
 * ces placeholders restent corrects, `.replaceAll()` sur un placeholder
 * absent du motif étant un no-op.
 */
export function substituerPlaceholders(pattern: string, maintenant: Date): string {
  const annee = String(maintenant.getFullYear());
  const moisNumero = String(maintenant.getMonth() + 1).padStart(2, '0');
  const noms = [
    'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
  ];
  const moisFr = noms[maintenant.getMonth()]!;
  return pattern
    .replaceAll('{annee}', annee)
    .replaceAll('{mois_numero}', moisNumero)
    .replaceAll('{mois_fr_minuscule}', moisFr.toLowerCase())
    .replaceAll('{mois_fr}', moisFr);
}

/**
 * Résout un lien de navigation (relatif ou absolu) contre l'URL courante.
 * Identique dans les 82 fichiers qui la dupliquaient jusqu'ici.
 */
export function resoudreUrl(lien: string, base: string): string {
  const normalise = /^https?:\/\//i.test(lien) || lien.startsWith('/') ? lien : `/${lien}`;
  return new URL(normalise, base).toString();
}
