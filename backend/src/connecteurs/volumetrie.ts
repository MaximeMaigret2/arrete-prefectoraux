/**
 * Audit de volume par connecteur (feature 005, US2) : decide, pour chaque
 * connecteur actif a `navigation`, une profondeur cible de collecte
 * historique entre le plancher garanti de 3 mois et la cible de 3 ans
 * (36 mois), fondee sur le cout reel du connecteur plutot que sur une
 * limite arbitraire identique pour tous (FR-005 a FR-009).
 *
 * Classification statique (gratuite, sans reseau) : la seule presence de
 * `page_detail` dans la configuration determine deja la famille de cout
 * (contrat connecteur-interface.md §2 etendu) - un connecteur SANS
 * `page_detail` a un cout par mois fixe et faible (une poignee de requetes
 * de navigation), independant du volume de publications, et vise donc
 * directement 3 ans (FR-006). Un connecteur AVEC `page_detail` a un cout
 * par mois qui depend du nombre de publications ce mois-la (une requete
 * HTTP supplementaire par publication candidate) - sa profondeur part du
 * plancher de 3 mois et n'est etendue que si un echantillon reel indique un
 * volume raisonnable (FR-007).
 *
 * FR-020 : un connecteur `page_web` sans etape de `navigation` (a ce jour,
 * uniquement `prefecture-13`) est hors perimetre de ce mecanisme - sa page
 * unique couvre deja une periode superieure a 3 mois via le cycle ordinaire.
 */
import { loadDataStore } from '../data/loader.js';
import { chargerConfigConnecteur } from './registry.js';
import { PageWebConfigSchema } from './moteurs/pageWeb/config.schema.js';
import { compterPublicationsPourMois } from './moteurs/pageWeb/moteur.js';
import { parisAnneeMoisCourant, decalerAnneeMois, type AnneeMois } from '../services/parisDate.js';

/** Plancher garanti pour un connecteur `page_detail` (FR-007). */
export const PLANCHER_MOIS_PAGE_DETAIL = 3;

/** Cible par defaut pour un connecteur sans `page_detail` (FR-006) - 3 ans. */
export const CIBLE_MOIS_SANS_PAGE_DETAIL = 36;

/** Cible maximale pour un connecteur `page_detail` dont l'echantillon indique un volume raisonnable (FR-007). */
export const CIBLE_MOIS_PAGE_DETAIL_ETENDUE = 36;

/**
 * Taille de l'echantillon (en mois deja atteignables, en partant du mois
 * courant) utilise pour estimer le volume moyen de publications par mois
 * d'un connecteur `page_detail` - configurable via variable d'environnement
 * pour le chiffrage reel (T022), la valeur precise n'etant pas figee par la
 * spec (plan.md, Assumptions).
 */
export const NOMBRE_MOIS_ECHANTILLON = Number(process.env.BACKFILL_VOLUMETRIE_ECHANTILLON_MOIS ?? 3);

/**
 * Seuil (nombre moyen de publications par mois) en-deca duquel un
 * connecteur `page_detail` est juge etendre sa profondeur au-dela du
 * plancher - configurable, informe par le chiffrage reel (T022).
 */
export const SEUIL_VOLUME_RAISONNABLE_PAR_MOIS = Number(process.env.BACKFILL_VOLUMETRIE_SEUIL_PUBLICATIONS ?? 10);

/** Resultat de l'audit pour un connecteur (FR-008 : consultable explicitement avant tout lancement a grande echelle). */
export interface ProfondeurConnecteur {
  connecteurId: string;
  departementCode: string;
  aPageDetail: boolean;
  profondeurCibleMois: number;
  /** `null` pour un connecteur sans `page_detail` (non mesure, non necessaire) ou si l'estimation a echoue (echec reseau). */
  volumeMoyenEchantillon: number | null;
}

/** Classification statique (sans reseau) d'une configuration `page_web` deja chargee - pure, reutilisable pour un test qui n'a besoin que de cette partie. */
export function classifierPageDetail(configBrute: unknown): { aPageDetail: boolean; sansNavigation: boolean } {
  const config = PageWebConfigSchema.parse(configBrute);
  return { aPageDetail: config.page_detail !== null, sansNavigation: config.navigation.length === 0 };
}

/**
 * Estime, pour un connecteur `page_detail`, le volume moyen de publications
 * par mois sur un petit echantillon de mois deja atteignables (le mois
 * courant et les {@link NOMBRE_MOIS_ECHANTILLON}-1 precedents) - SANS
 * jamais suivre `page_detail` ni telecharger de PDF pour ce comptage
 * (`compterPublicationsPourMois`, cout minimal, spec.md US2 Independent
 * Test). Un mois d'echantillon dont la page est introuvable est ignore
 * plutot que de fausser la moyenne (FR-004) ; un echec reseau bas niveau
 * sur l'echantillon interrompt l'estimation pour CE connecteur uniquement
 * (retourne `null`, traite par l'appelant comme "rester au plancher" -
 * jamais un blocage pour les autres connecteurs, FR-009).
 */
export async function estimerVolumeMoyenParMois(
  configBrute: unknown,
  maintenant: Date,
): Promise<number | null> {
  const moisCourant = parisAnneeMoisCourant(maintenant);
  const comptes: number[] = [];

  for (let i = 0; i < NOMBRE_MOIS_ECHANTILLON; i++) {
    const cible: AnneeMois = decalerAnneeMois(moisCourant, i);
    const resultat = await compterPublicationsPourMois(configBrute, cible);
    if (!resultat.ok) {
      if (resultat.causeReseau) return null;
      continue;
    }
    comptes.push(resultat.nombrePublications);
  }

  if (comptes.length === 0) return null;
  return comptes.reduce((somme, n) => somme + n, 0) / comptes.length;
}

/**
 * Decide la profondeur cible (US2) pour l'ensemble des connecteurs actifs a
 * `navigation` (FR-020 : un connecteur sans `navigation` est exclu du
 * resultat). N'effectue les appels reseau necessaires a l'estimation par
 * echantillon que pour les connecteurs `page_detail` (FR-005/FR-007) - les
 * connecteurs sans `page_detail` sont classes sans aucun appel reseau (cout
 * fixe par mois, cible 3 ans par defaut, FR-006).
 */
export async function auditerProfondeurs(maintenant: Date = new Date()): Promise<ProfondeurConnecteur[]> {
  const store = await loadDataStore();
  const resultats: ProfondeurConnecteur[] = [];

  for (const entree of store.connecteurs.filter((c) => c.actif)) {
    const configBrute = await chargerConfigConnecteur(entree.id);
    const { aPageDetail, sansNavigation } = classifierPageDetail(configBrute);
    if (sansNavigation) continue;

    const departementCode = entree.departements_couverts[0]!;

    if (!aPageDetail) {
      resultats.push({
        connecteurId: entree.id,
        departementCode,
        aPageDetail: false,
        profondeurCibleMois: CIBLE_MOIS_SANS_PAGE_DETAIL,
        volumeMoyenEchantillon: null,
      });
      continue;
    }

    const volumeMoyen = await estimerVolumeMoyenParMois(configBrute, maintenant);
    const extensible = volumeMoyen !== null && volumeMoyen <= SEUIL_VOLUME_RAISONNABLE_PAR_MOIS;
    resultats.push({
      connecteurId: entree.id,
      departementCode,
      aPageDetail: true,
      profondeurCibleMois: extensible ? CIBLE_MOIS_PAGE_DETAIL_ETENDUE : PLANCHER_MOIS_PAGE_DETAIL,
      volumeMoyenEchantillon: volumeMoyen,
    });
  }

  return resultats;
}
