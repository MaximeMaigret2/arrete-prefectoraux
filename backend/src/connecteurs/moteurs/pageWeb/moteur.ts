import * as cheerio from 'cheerio';
import type { Connecteur as ConnecteurEntree } from '../../../models/index.js';
import type { CandidatEvenement, Connecteur, ResultatCollecte, SourceBrute } from '../../types.js';
import { extraireChampsCommuns, extraireDateAvecAmbiguite } from '../../extraction/champsCommuns.js';
import { telechargerEtExtraireTextePdf } from '../pdf/moteur.js';
import { PageWebConfigSchema, type PageWebConfig } from './config.schema.js';

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
      const sourceListe: SourceBrute = {
        type: 'page_web',
        url: config.url_liste,
        contenu_brut_reference: config.url_liste,
        date_collecte: dateCollecte,
      };

      // Étape 1 (contrat §2) : récupérer la page liste.
      let html: string;
      try {
        const reponse = await fetch(config.url_liste);
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }
        html = await reponse.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          candidats: [],
          echec_global: { message: `Page liste "${config.url_liste}" inaccessible : ${message}`, source: sourceListe },
        };
      }

      // Étapes 2-5 (contrat §2) : lister, filtrer, extraire.
      const $ = cheerio.load(html);
      const candidats: CandidatEvenement[] = [];

      for (const element of $(config.selecteur_publications).toArray()) {
        const $publication = $(element);
        const titre = $publication.find(config.selecteur_titre).first().text().trim() || $publication.text().trim();

        if (!estPertinent(titre, config.mots_cles_filtrage)) continue;

        let texte = titre;
        let sourceCandidat = sourceListe;

        const lienPdf = config.selecteur_lien_pdf
          ? $publication.find(config.selecteur_lien_pdf).first().attr('href')
          : null;

        if (lienPdf) {
          const urlPdf = new URL(lienPdf, config.url_liste).toString();
          try {
            const resultatPdf = await telechargerEtExtraireTextePdf(urlPdf);
            sourceCandidat = {
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
              texte = resultatPdf.texte;
            }
          } catch {
            // Téléchargement du PDF joint échoué pour CETTE publication :
            // on retombe sur le texte du titre plutôt que de faire échouer
            // tout le run pour une seule pièce jointe indisponible
            // (isolation à l'échelle du candidat, esprit du contrat §5
            // règle 6, qui isole déjà les connecteurs entre eux).
          }
        }

        candidats.push(construireCandidat(departementCode, texte, config, sourceCandidat));
      }

      return { candidats };
    },
  };
}
