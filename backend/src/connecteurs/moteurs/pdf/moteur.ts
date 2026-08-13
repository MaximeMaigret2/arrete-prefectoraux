import pdfParse from 'pdf-parse';
import type { Connecteur as ConnecteurEntree } from '../../../models/index.js';
import type { CandidatEvenement, Connecteur, ResultatCollecte, SourceBrute } from '../../types.js';
import { extraireChampsCommuns, extraireDateAvecAmbiguite } from '../../extraction/champsCommuns.js';
import { PdfConfigSchema, type PdfConfig } from './config.schema.js';

/**
 * Moteur `pdf` (contracts/connecteur-interface.md §3). Générique : aucune
 * branche conditionnelle propre à un connecteur donné (contrat §5, règle 7)
 * — toute variation passe par `PdfConfig`.
 */

/** En-dessous de cette longueur, le texte extrait est considéré non exploitable (PDF scanné/image sans texte, FR-005 — jamais d'OCR). */
const LONGUEUR_TEXTE_MINIMALE = 20;

/**
 * Résout `url_pdf` : une URL fixe est retournée telle quelle ; un motif
 * (`{ motif }`) est substitué avec la date de la collecte — placeholders
 * `{annee}` (AAAA), `{mois}` (MM), `{jour}` (JJ). Le contrat (§3) mentionne
 * "la date du jour/de la dernière collecte" sans trancher : `maintenant`
 * (par défaut la date d'appel) porte ce choix explicitement plutôt que de
 * le figer silencieusement dans le moteur.
 */
export function resoudreUrlPdf(urlPdf: PdfConfig['url_pdf'], maintenant: Date = new Date()): string {
  if (typeof urlPdf === 'string') return urlPdf;
  const annee = String(maintenant.getUTCFullYear());
  const mois = String(maintenant.getUTCMonth() + 1).padStart(2, '0');
  const jour = String(maintenant.getUTCDate()).padStart(2, '0');
  return urlPdf.motif.replaceAll('{annee}', annee).replaceAll('{mois}', mois).replaceAll('{jour}', jour);
}

/** Texte extrait d'un PDF téléchargé, ou `null` si non exploitable (FR-005). */
export interface TextePdf {
  texte: string | null;
  /** Référence de la source conservée pour consultation (SC-002) — l'URL elle-même en l'absence d'archivage sur disque dans cette itération. */
  contenuBrutReference: string;
}

/**
 * Télécharge un PDF et en extrait le texte. Réutilisée telle quelle par le
 * moteur `page_web` (contrat §2, étape 4) pour les publications avec pièce
 * jointe PDF — aucune duplication de la logique de lecture PDF entre les
 * deux moteurs (research.md §3-4). Lève une exception si le téléchargement
 * échoue (réseau, HTTP non-2xx) ; ne lève jamais pour un texte vide/illisible,
 * qui est un résultat légitime (`texte: null`), pas une erreur technique.
 */
export async function telechargerEtExtraireTextePdf(url: string): Promise<TextePdf> {
  const reponse = await fetch(url);
  if (!reponse.ok) {
    throw new Error(`Téléchargement du PDF "${url}" échoué (HTTP ${reponse.status}).`);
  }
  const buffer = Buffer.from(await reponse.arrayBuffer());
  const { text } = await pdfParse(buffer);
  const texte = text.trim();
  return {
    texte: texte.length >= LONGUEUR_TEXTE_MINIMALE ? texte : null,
    contenuBrutReference: url,
  };
}

function construireCandidat(
  departementCode: string,
  texte: string,
  config: Pick<PdfConfig, 'autorite_signataire' | 'type_evenement_par_defaut' | 'pattern_reference' | 'patterns_dates'>,
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
 * connecteur `pdf` configuré. Un seul candidat par collecte : le contrat
 * (§3) décrit un unique `url_pdf` par configuration (fixe ou à motif), pas
 * une liste de publications à parcourir (à la différence de `page_web`) —
 * charge au `runner`/à la détection de doublon (research.md §5) d'éviter
 * la republication si la source n'a pas changé (idempotence, contrat §5
 * règle 3).
 */
export function creerConnecteur(entree: ConnecteurEntree, configBrute: unknown): Connecteur {
  const config = PdfConfigSchema.parse(configBrute);
  const departementCode = entree.departements_couverts[0];
  if (!departementCode) {
    throw new Error(`Connecteur "${entree.id}" : aucun département dans departements_couverts.`);
  }

  return {
    id: entree.id,
    departements: [departementCode],
    async collecter(): Promise<ResultatCollecte> {
      const url = resoudreUrlPdf(config.url_pdf);
      const dateCollecte = new Date().toISOString();

      let telechargement: TextePdf;
      try {
        telechargement = await telechargerEtExtraireTextePdf(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const source: SourceBrute = { type: 'pdf', url, contenu_brut_reference: url, date_collecte: dateCollecte };
        return { candidats: [], echec_global: { message, source } };
      }

      const source: SourceBrute = {
        type: 'pdf',
        url,
        contenu_brut_reference: telechargement.contenuBrutReference,
        date_collecte: dateCollecte,
      };

      if (telechargement.texte === null) {
        return {
          candidats: [],
          echec_global: {
            message: 'PDF téléchargé mais sans texte extractible (scan/image) — OCR hors périmètre (FR-005).',
            source,
          },
        };
      }

      return { candidats: [construireCandidat(departementCode, telechargement.texte, config, source)] };
    },
  };
}
