import * as cheerio from 'cheerio';
import type { Connecteur as ConnecteurEntree } from '../../../models/index.js';
import type { CandidatEvenement, Connecteur, ResultatCollecte, SourceBrute } from '../../types.js';
import { extraireChampsCommuns, extraireDateAvecAmbiguite, NOMS_MOIS_FR } from '../../extraction/champsCommuns.js';
import { parisAnneeMoisCourant } from '../../../services/parisDate.js';
import { telechargerEtExtraireTextePdf } from '../pdf/moteur.js';
import { PageWebConfigSchema, type PageWebConfig } from './config.schema.js';
import { EN_TETES_HTTP_DEFAUT } from '../../httpClient.js';

/**
 * Moteur `page_web` (contracts/connecteur-interface.md §2). Générique :
 * aucune branche conditionnelle propre à un connecteur donné (contrat §5,
 * règle 7) — toute variation passe par `PageWebConfig`.
 */

/** Filtrage par pertinence, insensible à la casse (contrat §2, étape 3). */
function estPertinent(texte: string, motsCles: string[]): boolean {
  const normalise = texte.toLowerCase();
  return motsCles.some((motCle) => normalise.includes(motCle.toLowerCase()));
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
function substituerPlaceholdersDate(pattern: string, maintenant: Date): string {
  const { annee, moisNumero } = parisAnneeMoisCourant(maintenant);
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
function resoudreMotifEtape(etape: PageWebConfig['navigation'][number], maintenant: Date): string {
  if (etape.pattern_lien !== undefined) return etape.pattern_lien;
  const { moisNumero } = parisAnneeMoisCourant(maintenant);
  const moisCourant = Number(moisNumero);
  const periode = etape.periodes!.find((p) => moisDansPlage(moisCourant, p.mois_debut, p.mois_fin));
  if (!periode) {
    throw new Error(
      `Navigation : aucune période ne couvre le mois courant (${moisNumero}) parmi les ${etape.periodes!.length} période(s) déclarée(s).`,
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
  maintenant: Date,
): Promise<string> {
  let urlCourante = urlDepart;
  for (const etape of etapes) {
    const reponse = await fetch(urlCourante, { headers: EN_TETES_HTTP_DEFAUT });
    if (!reponse.ok) {
      throw new Error(`Navigation : page "${urlCourante}" inaccessible (HTTP ${reponse.status}).`);
    }
    const html = await reponse.text();
    const $ = cheerio.load(html);
    const motif = substituerPlaceholdersDate(resoudreMotifEtape(etape, maintenant), maintenant);
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
      throw new Error(
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
): Promise<string | null> {
  if (!config.selecteur_lien_pdf) return null;

  if (config.page_detail) {
    const lienPublication = $publication.attr(config.page_detail.attribut_lien);
    if (!lienPublication) return null;
    const urlDetail = resoudreUrl(lienPublication, urlListeEffective);
    const reponse = await fetch(urlDetail, { headers: EN_TETES_HTTP_DEFAUT });
    if (!reponse.ok) {
      throw new Error(`Page de détail "${urlDetail}" inaccessible (HTTP ${reponse.status}).`);
    }
    const htmlDetail = await reponse.text();
    const $detail = cheerio.load(htmlDetail);
    const lienPdf = $detail(config.selecteur_lien_pdf).first().attr('href');
    return lienPdf ? resoudreUrl(lienPdf, urlDetail) : null;
  }

  const lienPdf = $publication.find(config.selecteur_lien_pdf).first().attr('href');
  return lienPdf ? resoudreUrl(lienPdf, urlListeEffective) : null;
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
 * Construit l'interface commune `Connecteur` (contrat §1) pour un
 * connecteur `page_web` configuré.
 */
export function creerConnecteur(entree: ConnecteurEntree, configBrute: unknown): Connecteur {
  const config = PageWebConfigSchema.parse(configBrute);
  const departementCode = entree.departements_couverts[0];
  if (!departementCode) {
    throw new Error(`Connecteur "${entree.id}" : aucun département dans departements_couverts.`);
  }

  return {
    id: entree.id,
    departements: [departementCode],
    async collecter(): Promise<ResultatCollecte> {
      const dateCollecte = new Date().toISOString();

      // Étape 0 (V001c, Phase 5bis) : résoudre l'URL de la page liste
      // effective via `navigation`, si configurée — inchangée (url_liste
      // telle quelle) pour un connecteur sans navigation (ex. prefecture-13).
      let urlListeEffective: string;
      try {
        urlListeEffective =
          config.navigation.length > 0
            ? await resoudreNavigation(config.url_liste, config.navigation, new Date(dateCollecte))
            : config.url_liste;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const sourceNavigation: SourceBrute = {
          type: 'page_web',
          url: config.url_liste,
          contenu_brut_reference: config.url_liste,
          date_collecte: dateCollecte,
        };
        return { candidats: [], echec_global: { message, source: sourceNavigation } };
      }

      const sourceListe: SourceBrute = {
        type: 'page_web',
        url: urlListeEffective,
        contenu_brut_reference: urlListeEffective,
        date_collecte: dateCollecte,
      };

      // Étape 1 (contrat §2) : récupérer la page liste.
      let html: string;
      try {
        const reponse = await fetch(urlListeEffective, { headers: EN_TETES_HTTP_DEFAUT });
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }
        html = await reponse.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          candidats: [],
          echec_global: { message: `Page liste "${urlListeEffective}" inaccessible : ${message}`, source: sourceListe },
        };
      }

      // Étapes 2-5 (contrat §2) : lister, filtrer, extraire.
      const $ = cheerio.load(html);
      const candidats: CandidatEvenement[] = [];

      for (const element of $(config.selecteur_publications).toArray()) {
        const $publication = $(element);
        const titre = $publication.find(config.selecteur_titre).first().text().trim() || $publication.text().trim();

        let pertinent = estPertinent(titre, config.mots_cles_filtrage);

        let texte = titre;
        let sourceCandidat = sourceListe;

        // Résolution du PDF (contrat §2 étendu, V001c) : soit directement
        // dans la publication (comportement historique), soit via une page
        // de détail intermédiaire (`page_detail`) — cf. `resoudreUrlPdfPublication`.
        // Échec isolé à CETTE publication (page de détail inaccessible) :
        // on retombe sur le titre plutôt que de faire échouer tout le run
        // (même esprit que l'échec de téléchargement du PDF, ci-dessous).
        let urlPdf: string | null = null;
        try {
          urlPdf = await resoudreUrlPdfPublication($publication, config, urlListeEffective);
        } catch {
          urlPdf = null;
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
          } catch {
            // Téléchargement du PDF joint échoué pour CETTE publication :
            // on retombe sur le titre plutôt que de faire échouer tout le
            // run pour une seule pièce jointe indisponible (isolation à
            // l'échelle du candidat, esprit du contrat §5 règle 6, qui
            // isole déjà les connecteurs entre eux). Si le titre seul
            // n'était pas pertinent, ce candidat est perdu (échec isolé,
            // pas de remontée en anomalie possible sans texte à examiner).
          }
        }

        if (!pertinent) continue;

        candidats.push(construireCandidat(departementCode, texte, config, sourceCandidat));
      }

      return { candidats };
    },
  };
}
