import * as cheerio from 'cheerio';
import type { Connecteur as ConnecteurEntree } from '../../../models/index.js';
import type {
  CandidatEvenement,
  CandidatNonResolu,
  Connecteur,
  OptionsCollecte,
  ResultatCollecte,
  SourceBrute,
} from '../../types.js';
import { extraireChampsCommuns, extraireDateAvecAmbiguite, NOMS_MOIS_FR } from '../../extraction/champsCommuns.js';
import { parisAnneeMoisCourant, type AnneeMois } from '../../../services/parisDate.js';
import { telechargerEtExtraireTextePdf } from '../pdf/moteur.js';
import { PageWebConfigSchema, type PageWebConfig } from './config.schema.js';
import { fetchAvecEnTetes, construireEnTeteCookie } from '../../httpClient.js';

/** En-têtes HTTP supplémentaires (typiquement `Cookie`) valables pour une collecte donnée — cf. `config.session_cookie`. */
type EnTetesSession = Record<string, string> | undefined;

/**
 * Distingue (feature 005, US1, FR-004) une réponse HTTP propre mais
 * négative (page introuvable — typiquement des archives distantes qui ne
 * remontent pas aussi loin que le mois cible demandé, ou une étape de
 * `navigation` sans lien correspondant) d'un échec réseau bas niveau
 * (`fetchAvecEnTetes` qui rejette après épuisement de ses tentatives —
 * coupure, DNS, timeout, socket fermé). Seul le second cas doit compter
 * comme un "échec réseau" pour un consommateur comme le circuit-breaker de
 * la collecte historique (`backfill-historique.ts`, US3) — le premier est
 * une anomalie de lecture ordinaire, et pour une collecte historique qui
 * remonte le temps, la limite naturelle et attendue des archives d'un site.
 */
export class PageIntrouvableError extends Error {}

/**
 * Échec de résolution de l'URL du PDF d'UNE publication (feature 007, US1)
 * — `page_detail` inaccessible (HTTP non-2xx ou échec réseau bas niveau).
 * Porte l'URL effectivement tentée pour permettre au consommateur (boucle
 * principale de `collecter()`) de construire une `SourceBrute` exploitable
 * (FR-009 : accès à la source depuis l'espace de résolution) sans avoir à
 * reparser le message d'erreur. Distinct de `PageIntrouvableError` (qui
 * concerne la page LISTE, un échec global de tout le connecteur) — ici
 * l'échec reste toujours isolé à une seule publication (contrat §5, règle 6).
 */
export class ResolutionUrlPdfError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
  }
}

/**
 * CORRECTIF (2026-09-02, campagne réelle de backfill feature 005) : une
 * réponse HTTP non-2xx n'est une "page introuvable" (limite naturelle des
 * archives, `PageIntrouvableError`) que pour un statut 404 — le seul qui
 * signifie sans ambiguïté "cette page n'existe pas". Un statut 5xx (erreur
 * serveur, ex. 503 "Service Unavailable" observé en masse contre l'IP
 * mutualisée des sites préfecture lors du premier run réel de
 * `backfill-historique.ts`) ou 429 (rate limiting explicite) signale une
 * indisponibilité TRANSITOIRE du serveur, pas une absence de contenu — avant
 * ce correctif, ces statuts étaient classés à tort comme `causeReseau:
 * false` (page introuvable), ce qui marquait `archivesEpuisees: true` de
 * façon PERMANENTE dans le checkpoint du backfill dès le premier 503
 * rencontré, sans jamais retenter. Découvert quand 84/91 connecteurs se
 * sont arrêtés après un unique échec HTTP 503 sur leur tout premier mois
 * cible (M-1) — signature typique de l'hébergement mutualisé sous charge
 * (déjà documentée dans `claude/etat-connecteurs.md`, jamais un vrai
 * "page n'existe pas"). Un statut 4xx autre que 404 (ex. 403 Cloudflare)
 * reste classé "page introuvable" par prudence — ambigu, mais un blocage
 * applicatif explicite ressemble structurellement plus à une source qui a
 * changé qu'à une simple surcharge transitoire.
 */
function estPageIntrouvable(statut: number): boolean {
  return statut === 404;
}

/**
 * CORRECTIF (2026-09-07, campagne réelle de backfill sur prefecture-56) :
 * un connecteur sans `page_detail` dont les titres ne portent jamais les
 * mots-clés de pertinence (ex. Morbihan — "RAA Spécial du <date>") doit
 * télécharger le PDF de CHAQUE candidat du mois pour trancher sa
 * pertinence (cf. boucle de `collecter()` ci-dessous) — potentiellement une
 * dizaine de requêtes HTTP d'un coup vers le même hébergeur. L'espacement
 * déjà en place (`backfill-historique.ts`, `ESPACEMENT_MINIMUM_MS_DEFAUT`)
 * ne protège QUE la transition entre deux mois, jamais les téléchargements
 * à l'intérieur d'un même mois — cette rafale sans délai s'est avérée
 * suffisante à elle seule pour faire échouer en `HTTP 503` la quasi-totalité
 * des PDF d'un même mois (10/10 observé en conditions réelles), alors que
 * la page liste, elle, répondait. Espacement minimum, configurable,
 * appliqué désormais AVANT chaque téléchargement de PDF sauf le tout
 * premier de la collecte (comportement générique du moteur, valable pour
 * tout connecteur avec `selecteur_lien_pdf` — contrat §5, règle 7).
 *
 * Relevé de 2000 à 30000 ms le 2026-09-11 (décision utilisateur, en même
 * temps que `ESPACEMENT_MINIMUM_MS_DEFAUT` dans `backfill-historique.ts`) :
 * un espacement générique de 2s s'est révélé insuffisant pour éviter les
 * rafales de `HTTP 503` sur l'hébergeur mutualisé encore fragile — aligné
 * désormais sur le même espacement généreux que l'inter-mois, entre deux
 * PDF d'un même mois.
 */
export const ESPACEMENT_PDF_MS_DEFAUT = Number(process.env.PAGE_WEB_PDF_ESPACEMENT_MS ?? 30000);

async function attendreParDefaut(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Dépendances injectables du moteur `page_web` — réservé aux tests (même
 * principe que `DependancesBackfill` de `backfill-historique.ts`) : non
 * fournies, `creerConnecteur` utilise l'implémentation réelle (`setTimeout`)
 * par défaut. Ne jamais construire depuis du code applicatif.
 */
export interface DependancesMoteurPageWeb {
  /** Attend `ms` millisecondes — réel en production, instantané/espionnable dans les tests qui l'injectent. */
  attendre?: (ms: number) => Promise<void>;
}

/**
 * Moteur `page_web` (contracts/connecteur-interface.md §2). Générique :
 * aucune branche conditionnelle propre à un connecteur donné (contrat §5,
 * règle 7) — toute variation passe par `PageWebConfig`.
 */

/**
 * Échappe les caractères spéciaux d'une chaîne pour un usage littéral
 * dans une regex (aucun helper existant ailleurs dans le dépôt à réutiliser).
 */
function echapperPourRegex(chaine: string): string {
  return chaine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filtrage par pertinence, insensible à la casse (contrat §2, étape 3).
 *
 * CORRECTIF (2026-09-20) : un simple `includes()` matchait un mot-clé comme
 * "rave" comme SOUS-CHAÎNE de n'importe quel mot français qui la contient
 * (ex. "traversée", "entrave", "grave") — découvert sur un faux positif
 * réel pour prefecture-49 (RAA du 23/01/2026, un recueil de 104 pages sans
 * aucun rapport avec une rave-party, marqué pertinent uniquement à cause du
 * mot "traversée" dans un paragraphe sur le mouillage fluvial à Angers, puis
 * des dates/références d'un tout autre arrêté du même recueil récupérées à
 * tort par les regex génériques). Chaque mot-clé est désormais recherché
 * avec des limites de mot Unicode-aware (lookaround sur `\p{L}`/`\p{N}`,
 * pas `\b` natif qui ignore les lettres accentuées et casserait un mot-clé
 * comme "déclaré").
 */
function estPertinent(texte: string, motsCles: string[]): boolean {
  const normalise = texte.toLowerCase();
  return motsCles.some((motCle) => {
    const motCleEchappe = echapperPourRegex(motCle.toLowerCase());
    const motif = new RegExp(`(?<![\\p{L}\\p{N}_])${motCleEchappe}(?![\\p{L}\\p{N}_])`, 'u');
    return motif.test(normalise);
  });
}

/**
 * Résout un lien (attribut `href`/`value` brut issu du HTML) en URL
 * absolue. Certains CMS gouvernementaux omettent le `/` de tête d'un
 * chemin pourtant relatif à la racine du site (ex. la `value` d'un
 * `<option>` de liste déroulante, cf. V001c/prefecture-77) — sans cette
 * normalisation, la résolution standard (`URL` natif) le traiterait à tort
 * comme relatif au chemin de la page courante et produirait une URL
 * invalide (segments dupliqués). Comportement générique, indépendant de
 * tout connecteur (contrat §5, règle 7).
 */
function resoudreUrl(lien: string, base: string): string {
  const normalise = /^https?:\/\//i.test(lien) || lien.startsWith('/') ? lien : `/${lien}`;
  return new URL(normalise, base).toString();
}

/**
 * Substitue dans `pattern` les placeholders `{annee}`/`{mois_numero}`/
 * `{mois_fr}`/`{mois_fr_minuscule}` avec la date courante (Europe/Paris),
 * avant compilation en regex par `resoudreNavigation` — jamais une
 * année/un mois codé en dur dans une configuration (contrat §5, règle 8).
 */
function substituerPlaceholdersDate(pattern: string, cible: AnneeMois): string {
  const { annee, moisNumero } = cible;
  const moisFr = NOMS_MOIS_FR[Number(moisNumero) - 1];
  return pattern
    .replaceAll('{annee}', annee)
    .replaceAll('{mois_numero}', moisNumero)
    .replaceAll('{mois_fr_minuscule}', moisFr.toLowerCase())
    .replaceAll('{mois_fr}', moisFr);
}

/** Vrai si `mois` (1-12) tombe dans `[debut, fin]` inclusif, avec wraparound si `debut > fin` (ex. une plage novembre(11)→février(2) couvre 11, 12, 1, 2). */
function moisDansPlage(mois: number, debut: number, fin: number): boolean {
  return debut <= fin ? mois >= debut && mois <= fin : mois >= debut || mois <= fin;
}

/**
 * Résout le motif brut (avant substitution des placeholders de date) à
 * utiliser pour une étape de `navigation` (V009, Phase 5bis élargie,
 * 2026-08-14) : `pattern_lien` tel quel dans la forme historique, ou — forme
 * `periodes` — le motif de la période dont `[mois_debut, mois_fin]` contient
 * le mois courant (Europe/Paris). Lève une exception si aucune période ne
 * couvre le mois courant (config incomplète : les périodes déclarées ne
 * couvrent pas les 12 mois de l'année) — traitée par l'appelant exactement
 * comme un lien introuvable (contrat §5, règle 6 : échec isolé à ce
 * connecteur, jamais aux autres).
 */
function resoudreMotifEtape(etape: PageWebConfig['navigation'][number], cible: AnneeMois): string {
  if (etape.pattern_lien !== undefined) return etape.pattern_lien;
  const moisCible = Number(cible.moisNumero);
  const periode = etape.periodes!.find((p) => moisDansPlage(moisCible, p.mois_debut, p.mois_fin));
  if (!periode) {
    throw new PageIntrouvableError(
      `Navigation : aucune période ne couvre le mois cible (${cible.moisNumero}) parmi les ${etape.periodes!.length} période(s) déclarée(s).`,
    );
  }
  return periode.motif;
}

/**
 * Résout `url_liste` effective en suivant chaque étape de `config.navigation`
 * (V001c, Phase 5bis) : depuis la page courante, trouve le premier lien via
 * `selecteur_liens` dont l'URL résolue correspond au motif de cette étape
 * (`pattern_lien` ou `periodes`, cf. `resoudreMotifEtape`, placeholders
 * substitués), et en fait la page courante de l'étape suivante. Retourne
 * `url_liste` inchangée si `navigation` est vide (défaut — aucun impact sur
 * les connecteurs à liste plate, ex. prefecture-13).
 *
 * Lève une exception si une étape (non `optionnelle`) ne trouve aucun lien
 * correspondant ou si une page intermédiaire est inaccessible — traité par
 * l'appelant comme un `echec_global` pour ce connecteur (contrat §5, règle
 * 6), signe que la structure du site a dérivé plutôt qu'une ambiguïté
 * d'extraction. Une étape `optionnelle` (V010) sans lien correspondant est
 * simplement sautée (la page courante reste inchangée) plutôt que de faire
 * échouer la résolution — cf. doc de `optionnelle` dans `config.schema.ts`.
 */
async function resoudreNavigation(
  urlDepart: string,
  etapes: PageWebConfig['navigation'],
  cible: AnneeMois,
  enTetesSession: EnTetesSession,
): Promise<string> {
  let urlCourante = urlDepart;
  for (const etape of etapes) {
    const reponse = await fetchAvecEnTetes(urlCourante, { enTetesSupplementaires: enTetesSession });
    if (!reponse.ok) {
      const message = `Navigation : page "${urlCourante}" inaccessible (HTTP ${reponse.status}).`;
      if (estPageIntrouvable(reponse.status)) throw new PageIntrouvableError(message);
      throw new Error(message);
    }
    const html = await reponse.text();
    const $ = cheerio.load(html);
    const motif = substituerPlaceholdersDate(resoudreMotifEtape(etape, cible), cible);
    const regex = new RegExp(motif, 'i');

    let urlSuivante: string | null = null;
    for (const element of $(etape.selecteur_liens).toArray()) {
      // V011 (Phase 5bis élargie 4, 2026-08-14, prefecture-17) : l'attribut
      // portant le lien est configurable (`href` par défaut) — nécessaire
      // quand la toute première étape de navigation ne trouve son lien
      // suivant que dans la `value` d'un `<option>` (ex. un sélecteur
      // d'année en racine, sans `<a>` équivalent).
      const href = $(element).attr(etape.attribut_lien);
      if (!href) continue;
      const resolue = resoudreUrl(href, urlCourante);
      if (regex.test(resolue)) {
        urlSuivante = resolue;
        break;
      }
    }
    if (urlSuivante === null) {
      if (etape.optionnelle) continue;
      throw new PageIntrouvableError(
        `Navigation : aucun lien via "${etape.selecteur_liens}" ne correspond au motif "${motif}" sur "${urlCourante}".`,
      );
    }
    urlCourante = urlSuivante;
  }
  return urlCourante;
}

/**
 * Résout l'URL PDF d'une publication, `null` si non trouvée. Deux modes
 * (contrat §2 étendu, V001c) :
 * - sans `page_detail` (comportement historique) : le lien est cherché à
 *   l'intérieur même de l'élément publication, via `selecteur_lien_pdf`.
 * - avec `page_detail` : l'élément publication ne porte pas directement le
 *   PDF mais l'URL d'une page de détail (attribut `page_detail.attribut_lien`,
 *   ex. `value` d'un `<option>`) ; cette page est récupérée et
 *   `selecteur_lien_pdf` y est appliqué à sa place.
 *
 * Lève une exception si la page de détail est inaccessible — capturée par
 * l'appelant comme un échec isolé à CETTE publication (même esprit que
 * l'échec de téléchargement du PDF lui-même, ci-dessous).
 */
async function resoudreUrlPdfPublication(
  $publication: cheerio.Cheerio<any>,
  config: PageWebConfig,
  urlListeEffective: string,
  enTetesSession: EnTetesSession,
): Promise<string | null> {
  if (!config.selecteur_lien_pdf) return null;

  if (config.page_detail) {
    const lienPublication = $publication.attr(config.page_detail.attribut_lien);
    if (!lienPublication) return null;
    const urlDetail = resoudreUrl(lienPublication, urlListeEffective);
    let reponse: Awaited<ReturnType<typeof fetchAvecEnTetes>>;
    try {
      reponse = await fetchAvecEnTetes(urlDetail, { enTetesSupplementaires: enTetesSession });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ResolutionUrlPdfError(`Page de détail "${urlDetail}" inaccessible : ${message}`, urlDetail);
    }
    if (!reponse.ok) {
      throw new ResolutionUrlPdfError(`Page de détail "${urlDetail}" inaccessible (HTTP ${reponse.status}).`, urlDetail);
    }
    const htmlDetail = await reponse.text();
    const $detail = cheerio.load(htmlDetail);
    const lienPdf = $detail(config.selecteur_lien_pdf).first().attr('href');
    return lienPdf ? resoudreUrl(lienPdf, urlDetail) : null;
  }

  const lienPdf = $publication.find(config.selecteur_lien_pdf).first().attr('href');
  return lienPdf ? resoudreUrl(lienPdf, urlListeEffective) : null;
}

/**
 * Résout le libellé/objet réel d'une publication depuis un élément FRÈRE
 * (`config.titre_frere`, cf. `config.schema.ts`), `null` si non configuré ou
 * non trouvé. Cherche, parmi TOUS les frères suivants de `$publication`
 * (pas seulement le tout premier — robuste à du balisage intercalaire
 * malformé, ex. un `<tr>` vide, rencontré sur prefecture-57), le premier
 * élément correspondant à `selecteur_conteneur` ; à l'intérieur, cherche une
 * cellule dont le texte (hors « : » final) correspond exactement à
 * `etiquette_libelle`, et retourne le texte de la cellule qui la suit
 * immédiatement (motif générique « paire étiquette/valeur en tableau »).
 */
function resoudreLibelleFrere($publication: cheerio.Cheerio<any>, config: PageWebConfig): string | null {
  if (!config.titre_frere) return null;
  const $conteneur = $publication.nextAll(config.titre_frere.selecteur_conteneur).first();
  if ($conteneur.length === 0) return null;

  const etiquetteAttendue = config.titre_frere.etiquette_libelle.trim();
  const $cellules = $conteneur.find('td');
  for (let i = 0; i < $cellules.length; i++) {
    const $cellule = $cellules.eq(i);
    const texte = $cellule.text().trim().replace(/\s*:\s*$/, '');
    if (texte === etiquetteAttendue) {
      const valeur = $cellule.next('td').text().trim();
      return valeur.length > 0 ? valeur : null;
    }
  }
  return null;
}

function construireCandidat(
  departementCode: string,
  texte: string,
  config: Pick<PageWebConfig, 'autorite_signataire' | 'type_evenement_par_defaut' | 'pattern_reference' | 'patterns_dates'>,
  source: SourceBrute,
): CandidatEvenement {
  const champs = extraireChampsCommuns(texte, {
    patternReference: config.pattern_reference,
    patternsDates: config.patterns_dates,
  });
  const fin = extraireDateAvecAmbiguite(texte, config.patterns_dates.fin);
  return {
    departement_code: departementCode,
    type_evenement: config.type_evenement_par_defaut,
    reference_arrete: champs.reference_arrete,
    date_debut: champs.date_debut,
    date_fin: champs.date_fin,
    date_fin_ambigue: fin.ambigue,
    autorite_signataire: config.autorite_signataire,
    source,
  };
}

/**
 * Résultat de {@link resoudreEtRecupererPageListe} : soit la page liste
 * effective récupérée avec succès (prête pour l'étape d'extraction), soit
 * un `echec_global` déjà classifié (feature 005, FR-004 — `causeReseau`
 * distingue une page introuvable d'un échec réseau bas niveau).
 */
type ResolutionPageListe =
  | { ok: true; html: string; urlListeEffective: string; enTetesSession: EnTetesSession }
  | { ok: false; echecGlobal: { message: string; source: SourceBrute; causeReseau: boolean } };

/**
 * Amorçage de session éventuel + résolution de `navigation` + récupération
 * de la page liste pour un mois cible donné — extrait de `collecter()`
 * (feature 005, US1/US2) pour être réutilisé tel quel par
 * {@link compterPublicationsPourMois} (US2, audit de volume), qui a besoin
 * exactement de cette même page liste mais SANS jamais suivre `page_detail`
 * ni télécharger le moindre PDF (coût minimal de l'estimation, spec.md US2
 * Independent Test). Aucune règle métier dupliquée : la seule autre
 * consommatrice, `collecter()` elle-même, appelle cette même fonction.
 */
async function resoudreEtRecupererPageListe(
  config: PageWebConfig,
  cible: AnneeMois,
  dateCollecte: string,
): Promise<ResolutionPageListe> {
  // Étape -1 (V0xx, 2026-08-27, prefecture-57) : amorçage de session si
  // configuré (`config.session_cookie`) — requête préalable dont seul le
  // cookie de session retourné importe, réutilisé (en-tête `Cookie`) sur
  // toutes les requêtes HTTP restantes de CETTE collecte. Absent
  // (`undefined`) pour tout connecteur sans `session_cookie` — inchangé,
  // stateless, comme tous les connecteurs existants. Un échec réseau de
  // l'amorçage est traité comme un `echec_global` au même titre qu'un
  // échec de résolution de `navigation` (dérive/indisponibilité de la
  // source, pas une ambiguïté d'extraction).
  let enTetesSession: EnTetesSession;
  if (config.session_cookie) {
    try {
      const reponseAmorcage = await fetchAvecEnTetes(config.session_cookie.url_amorcage);
      if (!reponseAmorcage.ok) {
        if (estPageIntrouvable(reponseAmorcage.status)) throw new PageIntrouvableError(`HTTP ${reponseAmorcage.status}`);
        throw new Error(`HTTP ${reponseAmorcage.status}`);
      }
      const enTeteCookie = construireEnTeteCookie(reponseAmorcage);
      enTetesSession = enTeteCookie ? { Cookie: enTeteCookie } : undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const sourceAmorcage: SourceBrute = {
        type: 'page_web',
        url: config.session_cookie.url_amorcage,
        contenu_brut_reference: config.session_cookie.url_amorcage,
        date_collecte: dateCollecte,
      };
      return {
        ok: false,
        echecGlobal: {
          message: `Amorçage de session "${config.session_cookie.url_amorcage}" échoué : ${message}`,
          source: sourceAmorcage,
          causeReseau: !(err instanceof PageIntrouvableError),
        },
      };
    }
  }

  // Étape 0 (V001c, Phase 5bis) : résoudre l'URL de la page liste
  // effective via `navigation`, si configurée — inchangée (url_liste
  // telle quelle) pour un connecteur sans navigation (ex. prefecture-13).
  let urlListeEffective: string;
  try {
    urlListeEffective =
      config.navigation.length > 0
        ? await resoudreNavigation(config.url_liste, config.navigation, cible, enTetesSession)
        : config.url_liste;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const sourceNavigation: SourceBrute = {
      type: 'page_web',
      url: config.url_liste,
      contenu_brut_reference: config.url_liste,
      date_collecte: dateCollecte,
    };
    return {
      ok: false,
      echecGlobal: { message, source: sourceNavigation, causeReseau: !(err instanceof PageIntrouvableError) },
    };
  }

  const sourceListe: SourceBrute = {
    type: 'page_web',
    url: urlListeEffective,
    contenu_brut_reference: urlListeEffective,
    date_collecte: dateCollecte,
  };

  // Étape 1 (contrat §2) : récupérer la page liste.
  try {
    const reponse = await fetchAvecEnTetes(urlListeEffective, { enTetesSupplementaires: enTetesSession });
    if (!reponse.ok) {
      if (estPageIntrouvable(reponse.status)) throw new PageIntrouvableError(`HTTP ${reponse.status}`);
      throw new Error(`HTTP ${reponse.status}`);
    }
    const html = await reponse.text();
    return { ok: true, html, urlListeEffective, enTetesSession };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      echecGlobal: {
        message: `Page liste "${urlListeEffective}" inaccessible : ${message}`,
        source: sourceListe,
        causeReseau: !(err instanceof PageIntrouvableError),
      },
    };
  }
}

/**
 * Compte les publications présentes sur la page liste résolue pour un mois
 * cible donné, SANS suivre `page_detail` ni télécharger le moindre PDF —
 * coût minimal (une résolution de `navigation` + une page liste, réutilisant
 * exactement {@link resoudreEtRecupererPageListe}), utilisé par
 * `volumetrie.ts` (feature 005, US2) pour estimer le volume d'un connecteur
 * `page_detail` sans jamais faire porter à l'estimation elle-même le coût
 * d'une collecte complète (spec.md US2, Independent Test).
 */
export async function compterPublicationsPourMois(
  configBrute: unknown,
  cible: AnneeMois,
): Promise<{ ok: true; nombrePublications: number } | { ok: false; message: string; causeReseau: boolean }> {
  const config = PageWebConfigSchema.parse(configBrute);
  const dateCollecte = new Date().toISOString();
  const resolu = await resoudreEtRecupererPageListe(config, cible, dateCollecte);
  if (!resolu.ok) {
    return { ok: false, message: resolu.echecGlobal.message, causeReseau: resolu.echecGlobal.causeReseau };
  }
  const $ = cheerio.load(resolu.html);
  return { ok: true, nombrePublications: $(config.selecteur_publications).length };
}

/**
 * Construit l'interface commune `Connecteur` (contrat §1) pour un
 * connecteur `page_web` configuré.
 */
export function creerConnecteur(
  entree: ConnecteurEntree,
  configBrute: unknown,
  deps: DependancesMoteurPageWeb = {},
): Connecteur {
  const config = PageWebConfigSchema.parse(configBrute);
  const departementCode = entree.departements_couverts[0];
  if (!departementCode) {
    throw new Error(`Connecteur "${entree.id}" : aucun département dans departements_couverts.`);
  }
  const attendre = deps.attendre ?? attendreParDefaut;

  return {
    id: entree.id,
    departements: [departementCode],
    async collecter(cibleParam?: AnneeMois, options?: OptionsCollecte): Promise<ResultatCollecte> {
      const dateCollecte = new Date().toISOString();
      // feature 005 (US1, FR-001/FR-002) : mois cible explicite si fourni
      // (collecte historique, `backfill-historique.ts`), sinon le mois
      // courant Europe/Paris — rigoureusement le même calcul qu'avant cette
      // feature (non-régression du cycle planifié/manuel existant).
      const cible: AnneeMois = cibleParam ?? parisAnneeMoisCourant(new Date(dateCollecte));

      const resolu = await resoudreEtRecupererPageListe(config, cible, dateCollecte);
      if (!resolu.ok) {
        return { candidats: [], echec_global: resolu.echecGlobal };
      }
      const { html, urlListeEffective, enTetesSession } = resolu;
      const sourceListe: SourceBrute = {
        type: 'page_web',
        url: urlListeEffective,
        contenu_brut_reference: urlListeEffective,
        date_collecte: dateCollecte,
      };

      // Étapes 2-5 (contrat §2) : lister, filtrer, extraire.
      const $ = cheerio.load(html);
      const candidats: CandidatEvenement[] = [];
      // feature 007 (US1, FR-001/FR-005) : candidats dont le titre seul
      // n'était pas pertinent ET dont la résolution de page_detail/PDF a
      // échoué — cf. types.ts, CandidatNonResolu.
      const candidatsNonResolus: CandidatNonResolu[] = [];

      // Q-001 (lot Qualité, 2026-08-22) : détection du piège `page_detail`
      // déjà rencontré et corrigé après-coup sur 58, 60, 70, 71, 81 —
      // `selecteur_publications` pointant sur un conteneur englobant (ex.
      // `.fr-card`) plutôt que sur l'élément porteur du `href`/`value` lui-même
      // produisait un échec entièrement silencieux (`candidats: []`, aucune
      // erreur). On compte ici, sur l'ensemble des éléments matchés, combien
      // portent effectivement l'attribut (même vide, ex. un `<option
      // value="">` placeholder — seul `undefined`, attribut absent, compte
      // comme un signe du piège) ; si `page_detail` est actif et qu'AUCUN
      // élément ne le porte, c'est un bug de config, pas une simple absence
      // de publication ce mois-ci.
      let totalPublicationsPageDetail = 0;
      let auMoinsUnAttributPageDetailPresent = false;
      // CORRECTIF (2026-09-07) : compte les téléchargements de PDF déjà
      // effectués dans CETTE collecte, pour espacer chaque nouveau
      // téléchargement du précédent (jamais avant le premier) — cf.
      // `ESPACEMENT_PDF_MS_DEFAUT` en tête de fichier.
      let nombreTelechargementsPdf = 0;

      for (const element of $(config.selecteur_publications).toArray()) {
        const $publication = $(element);

        if (config.page_detail) {
          totalPublicationsPageDetail++;
          if ($publication.attr(config.page_detail.attribut_lien) !== undefined) {
            auMoinsUnAttributPageDetailPresent = true;
          }
        }

        const titre = $publication.find(config.selecteur_titre).first().text().trim() || $publication.text().trim();

        // V0xx (2026-08-27, prefecture-57) : libellé complémentaire depuis un
        // élément frère (cf. `resoudreLibelleFrere`) — `null`/absent pour
        // tout connecteur sans `titre_frere`, texte de pertinence/extraction
        // inchangé (`titre` seul) dans ce cas, comme avant cette extension.
        const libelleFrere = resoudreLibelleFrere($publication, config);
        const titreEtendu = libelleFrere ? `${titre} ${libelleFrere}` : titre;

        let pertinent = estPertinent(titreEtendu, config.mots_cles_filtrage);

        let texte = titreEtendu;
        let sourceCandidat = sourceListe;

        // Résolution du PDF (contrat §2 étendu, V001c) : soit directement
        // dans la publication (comportement historique), soit via une page
        // de détail intermédiaire (`page_detail`) — cf. `resoudreUrlPdfPublication`.
        // Échec isolé à CETTE publication (page de détail inaccessible) :
        // on retombe sur le titre plutôt que de faire échouer tout le run
        // (même esprit que l'échec de téléchargement du PDF, ci-dessous).
        let urlPdf: string | null = null;
        // feature 007 (US1) : trace de l'échec le plus récent qui a
        // empêché de trancher la pertinence de CETTE publication — mise à
        // jour au fil des étapes (résolution de l'URL, puis téléchargement),
        // jamais les deux à la fois (l'échec de résolution empêche
        // d'atteindre le téléchargement). Consommée uniquement si le titre
        // seul s'avère non pertinent (cf. plus bas, FR-002).
        let echecResolutionPdf: { message: string; source: SourceBrute } | null = null;
        try {
          urlPdf = await resoudreUrlPdfPublication($publication, config, urlListeEffective, enTetesSession);
        } catch (err) {
          urlPdf = null;
          if (err instanceof ResolutionUrlPdfError) {
            echecResolutionPdf = {
              message: err.message,
              source: {
                type: 'page_web',
                url: err.url,
                contenu_brut_reference: err.url,
                date_collecte: dateCollecte,
              },
            };
          }
        }

        // CORRECTIF (2026-09-08, feature « PDF par PDF ») : un PDF déjà
        // résolu (téléchargé et tranché — retenu ou écarté) lors d'une
        // tentative précédente de reprise de ce même mois "incertain" ne
        // doit pas être re-téléchargé — l'appelant (`runner.ts`) a déjà
        // persisté son sort à ce moment-là. Un candidat sans PDF joint
        // (`urlPdf === null`) n'est jamais concerné, faute d'URL à comparer.
        if (urlPdf && options?.urlsDejaResolues?.has(urlPdf)) {
          continue;
        }

        // Le PDF joint est tenté dès qu'il existe, pas seulement quand le
        // titre est déjà pertinent : sur un bulletin RAA compilé (plusieurs
        // arrêtés dans un même PDF, ex. "RAA 33 SPECIAL N°2026-243"), le
        // titre de la publication ne reflète jamais le contenu — seule une
        // lecture du texte du PDF peut révéler la pertinence (mots-clés).
        // Comportement générique, valable pour toute config déclarant
        // `selecteur_lien_pdf` (contrat §5, règle 7 : aucune branche par
        // connecteur), pas seulement pour enrichir un candidat déjà retenu.
        if (urlPdf) {
          // CORRECTIF (2026-09-07) : espacer chaque téléchargement de PDF du
          // précédent au sein de cette même collecte (jamais avant le
          // premier) — cf. note en tête de fichier, `ESPACEMENT_PDF_MS_DEFAUT`.
          if (nombreTelechargementsPdf > 0) {
            await attendre(ESPACEMENT_PDF_MS_DEFAUT);
          }
          nombreTelechargementsPdf++;
          try {
            const resultatPdf = await telechargerEtExtraireTextePdf(urlPdf);
            const source: SourceBrute = {
              type: 'pdf',
              url: urlPdf,
              contenu_brut_reference: resultatPdf.contenuBrutReference,
              date_collecte: dateCollecte,
            };
            // Si le PDF joint n'a pas de texte extractible, le texte du
            // titre reste utilisé plutôt que de perdre le candidat : le
            // titre seul peut déjà suffire à certains champs (référence,
            // dates courtes) — pas d'échec pour ce seul candidat.
            if (resultatPdf.texte !== null) {
              if (!pertinent) {
                // Dernière chance de pertinence : le titre seul ne suffisait
                // pas, on la réévalue sur le texte réel du PDF.
                pertinent = estPertinent(resultatPdf.texte, config.mots_cles_filtrage);
              }
              // Le texte du PDF (plus complet que le titre) devient la base
              // d'extraction dès qu'il a été lu avec succès, qu'il ait ou
              // non été nécessaire à la décision de pertinence ci-dessus.
              texte = resultatPdf.texte;
              sourceCandidat = source;
            } else if (pertinent) {
              // Texte du PDF illisible mais titre déjà pertinent : on garde
              // la source PDF (plus proche de l'acte réel que la page liste)
              // même si l'extraction retombera sur le texte du titre.
              sourceCandidat = source;
            }
          } catch (err) {
            // Téléchargement du PDF joint échoué pour CETTE publication :
            // on retombe sur le titre plutôt que de faire échouer tout le
            // run pour une seule pièce jointe indisponible (isolation à
            // l'échelle du candidat, esprit du contrat §5 règle 6, qui
            // isole déjà les connecteurs entre eux). Si le titre seul
            // n'était pas pertinent, la pertinence de ce candidat n'a
            // jamais pu être vérifiée — feature 007 (US1, FR-001) : tracé
            // dans candidatsNonResolus plutôt que perdu silencieusement.
            const message = err instanceof Error ? err.message : String(err);
            echecResolutionPdf = {
              message: `Téléchargement du PDF "${urlPdf}" échoué : ${message}`,
              source: {
                type: 'pdf',
                url: urlPdf,
                contenu_brut_reference: urlPdf,
                date_collecte: dateCollecte,
              },
            };
          }
        }

        if (!pertinent) {
          if (echecResolutionPdf) {
            const candidatNonResolu: CandidatNonResolu = {
              departement_code: departementCode,
              message: echecResolutionPdf.message,
              source: echecResolutionPdf.source,
            };
            candidatsNonResolus.push(candidatNonResolu);
            // CORRECTIF (2026-09-08) : notifié immédiatement (persistance
            // incrémentale côté `runner.ts`) plutôt que seulement à la fin
            // de toute la collecte du mois — jamais pour ce statut ajouté à
            // `urlsDejaResolues` côté appelant (échec réel, à retenter).
            await options?.onCandidatResolu?.({ statut: 'non_resolu', urlPdf, candidatNonResolu });
          } else {
            await options?.onCandidatResolu?.({ statut: 'ecarte', urlPdf });
          }
          continue;
        }

        const candidat = construireCandidat(departementCode, texte, config, sourceCandidat);
        candidats.push(candidat);
        await options?.onCandidatResolu?.({ statut: 'retenu', urlPdf, candidat });
      }

      // Q-001 : piège `page_detail` confirmé — aucun des éléments matchés
      // par `selecteur_publications` ne porte l'attribut attendu, alors que
      // `page_detail` est actif et qu'il y avait au moins un élément à
      // examiner. Échec explicite plutôt que retour silencieux de
      // `candidats: []` (même traitement que les autres échecs globaux de ce
      // connecteur, ex. page liste inaccessible).
      if (config.page_detail && totalPublicationsPageDetail > 0 && !auMoinsUnAttributPageDetailPresent) {
        const message =
          `page_detail est actif mais l'attribut "${config.page_detail.attribut_lien}" est absent (undefined) ` +
          `sur les ${totalPublicationsPageDetail} élément(s) matchés par selecteur_publications ` +
          `("${config.selecteur_publications}"). selecteur_publications doit pointer directement sur l'élément ` +
          `porteur du lien (l'<a> ou l'<option> lui-même), jamais sur un conteneur englobant (ex. ".fr-card"/"div"/"li").`;
        return { candidats: [], echec_global: { message, source: sourceListe } };
      }

      // feature 005 (backfill historique, 2026-09-04) : pour un connecteur
      // `granularite_liste: 'annuelle'` (cf. config.schema.ts), la page
      // récupérée ci-dessus pour `cible` est rigoureusement la même quel
      // que soit `cible.moisNumero` — signale donc au consommateur
      // (`backfill-historique.ts`) que cette collecte couvre déjà
      // l'intégralité de `cible.annee`, pas seulement le mois demandé.
      const resultatBase: ResultatCollecte =
        candidatsNonResolus.length > 0 ? { candidats, candidatsNonResolus } : { candidats };

      if (config.granularite_liste === 'annuelle') {
        if (candidatsNonResolus.length > 0) {
          // feature 007 (US1, FR-011, défense en profondeur) : ne jamais
          // affirmer que l'année est intégralement couverte si au moins un
          // candidat n'a pas pu être résolu — la protection principale
          // reste côté orchestration (backfill-historique.ts, US3).
          return resultatBase;
        }
        return { candidats, anneesCouvertes: [cible.annee] };
      }

      return resultatBase;
    },
  };
}
