import * as cheerio from 'cheerio';
import type { Connecteur as ConnecteurEntree } from '../../../models/index.js';
import type { CandidatEvenement, Connecteur, ResultatCollecte, SourceBrute } from '../../types.js';
import { extraireChampsCommuns, extraireDateAvecAmbiguite } from '../../extraction/champsCommuns.js';
import { telechargerEtExtraireTextePdf } from '../pdf/moteur.js';
import { RssConfigSchema, type RssConfig } from './config.schema.js';

/**
 * Moteur `rss` (contracts/connecteur-interface.md §4). Générique : aucune
 * branche conditionnelle propre à un connecteur donné (contrat §6, règle 7)
 * — toute variation passe par `RssConfig`.
 */

/** Filtrage par pertinence, insensible à la casse (même logique que le moteur page_web). */
function estPertinent(texte: string, motsCles: string[]): boolean {
  const normalise = texte.toLowerCase();
  return motsCles.some((motCle) => normalise.includes(motCle.toLowerCase()));
}

function construireCandidat(
  departementCode: string,
  texte: string,
  config: Pick<RssConfig, 'autorite_signataire' | 'type_evenement_par_defaut' | 'pattern_reference' | 'patterns_dates'>,
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
 * connecteur `rss` configuré.
 */
export function creerConnecteur(entree: ConnecteurEntree, configBrute: unknown): Connecteur {
  const config = RssConfigSchema.parse(configBrute);
  const departementCode = entree.departements_couverts[0];
  if (!departementCode) {
    throw new Error(`Connecteur "${entree.id}" : aucun département dans departements_couverts.`);
  }

  return {
    id: entree.id,
    departements: [departementCode],
    async collecter(): Promise<ResultatCollecte> {
      const dateCollecte = new Date().toISOString();
      const sourceFlux: SourceBrute = {
        type: 'rss',
        url: config.url_flux,
        contenu_brut_reference: config.url_flux,
        date_collecte: dateCollecte,
      };

      // Étape 1 (contrat §4) : récupérer le flux.
      let xml: string;
      try {
        const reponse = await fetch(config.url_flux);
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }
        xml = await reponse.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          candidats: [],
          echec_global: { message: `Flux RSS "${config.url_flux}" inaccessible : ${message}`, source: sourceFlux },
        };
      }

      // Étapes 2-5 (contrat §4) : lister les items, filtrer, extraire.
      const $ = cheerio.load(xml, { xmlMode: true });
      const candidats: CandidatEvenement[] = [];

      for (const element of $('item').toArray()) {
        const $item = $(element);
        const titre = $item.find('title').first().text().trim();
        const description = $item.find('description').first().text().trim();
        const lien = $item.find('link').first().text().trim();
        const texteItem = [titre, description].filter((partie) => partie.length > 0).join(' ');

        if (!estPertinent(texteItem, config.mots_cles_filtrage)) continue;

        let texte = texteItem;
        let sourceCandidat = sourceFlux;

        if (config.suivre_lien_pdf && lien && lien.toLowerCase().endsWith('.pdf')) {
          try {
            const resultatPdf = await telechargerEtExtraireTextePdf(lien);
            sourceCandidat = {
              type: 'pdf',
              url: lien,
              contenu_brut_reference: resultatPdf.contenuBrutReference,
              date_collecte: dateCollecte,
            };
            // Si le PDF lié n'a pas de texte extractible, le texte de
            // l'item (titre + description) reste utilisé plutôt que de
            // perdre le candidat — même choix que le moteur page_web (§2).
            if (resultatPdf.texte !== null) {
              texte = resultatPdf.texte;
            }
          } catch {
            // Téléchargement du PDF lié échoué pour CET item : on retombe
            // sur le texte du flux plutôt que de faire échouer tout le run
            // pour un seul lien indisponible (isolation à l'échelle du
            // candidat, esprit du contrat §6 règle 6).
          }
        }

        candidats.push(construireCandidat(departementCode, texte, config, sourceCandidat));
      }

      return { candidats };
    },
  };
}
