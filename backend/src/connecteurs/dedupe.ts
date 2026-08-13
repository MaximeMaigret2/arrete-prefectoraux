import type { Evenement } from '../models/index.js';
import type { CandidatEvenement } from './types.js';

/**
 * Détection de doublons potentiels (FR-010, research.md §5), appliquée par
 * le `runner` avant publication automatique — jamais par un connecteur
 * individuel, qui n'a pas connaissance de l'historique déjà publié
 * (contrat §5, règle 1 : aucun effet de bord/lecture de stockage dans un
 * moteur).
 *
 * Un candidat est un doublon potentiel s'il existe déjà, pour le même
 * département, un événement publié dont (a) la `reference_arrete` est
 * identique ou très proche, **ou** (b) l'intervalle `[date_debut,
 * date_fin ?? +∞)` chevauche fortement (>50 %) celui du candidat.
 */

/** Résultat de la détection : l'événement existant concerné sert à construire `raison` (data-model.md, étape 4). */
export interface DetectionDoublon {
  doublon: boolean;
  evenementConcerne: Evenement | null;
}

/**
 * Seuil de similarité de référence : deux références sont jugées
 * "identiques ou très proches" si leur distance de Levenshtein normalisée
 * (0 = identiques, 1 = totalement différentes) ne dépasse pas ce seuil —
 * tolère une erreur de casse/espace/tiret d'extraction sans confondre deux
 * références réellement distinctes (research.md §5).
 */
const SEUIL_DISTANCE_REFERENCE = 0.15;

/** Seuil de chevauchement de période au-delà duquel deux intervalles sont jugés "fortement" chevauchants (research.md §5). */
const SEUIL_CHEVAUCHEMENT_PERIODE = 0.5;

export function detecterDoublon(
  candidat: Pick<CandidatEvenement, 'departement_code' | 'reference_arrete' | 'date_debut' | 'date_fin'>,
  historiqueDepartement: Evenement[],
): DetectionDoublon {
  for (const evenement of historiqueDepartement) {
    if (evenement.departement_code !== candidat.departement_code) continue;
    if (referencesProches(candidat.reference_arrete, evenement.reference_arrete)) {
      return { doublon: true, evenementConcerne: evenement };
    }
    if (chevauchementFort(candidat, evenement)) {
      return { doublon: true, evenementConcerne: evenement };
    }
  }
  return { doublon: false, evenementConcerne: null };
}

/** Normalise une référence avant comparaison : casse, accents et espacement ne doivent pas produire de faux négatif. */
function normaliserReference(reference: string): string {
  return reference
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function referencesProches(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normaliserReference(a);
  const nb = normaliserReference(b);
  if (na.length === 0 || nb.length === 0) return false;
  const distance = distanceLevenshtein(na, nb);
  const distanceNormalisee = distance / Math.max(na.length, nb.length);
  return distanceNormalisee <= SEUIL_DISTANCE_REFERENCE;
}

/** Distance de Levenshtein classique (programmation dynamique), sans dépendance externe (Principe 5). */
function distanceLevenshtein(a: string, b: string): number {
  const lignes = a.length + 1;
  const colonnes = b.length + 1;
  const matrice: number[][] = Array.from({ length: lignes }, () => new Array<number>(colonnes).fill(0));

  for (let i = 0; i < lignes; i++) matrice[i][0] = i;
  for (let j = 0; j < colonnes; j++) matrice[0][j] = j;

  for (let i = 1; i < lignes; i++) {
    for (let j = 1; j < colonnes; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      matrice[i][j] = Math.min(
        matrice[i - 1][j] + 1, // suppression
        matrice[i][j - 1] + 1, // insertion
        matrice[i - 1][j - 1] + cout, // substitution
      );
    }
  }

  return matrice[lignes - 1][colonnes - 1];
}

interface Intervalle {
  debut: number;
  fin: number; // Infinity si pas de date de fin (arrêté actif jusqu'à preuve du contraire)
}

function intervalleMs(dateDebut: string, dateFin: string | null): Intervalle {
  return {
    debut: new Date(dateDebut).getTime(),
    fin: dateFin ? new Date(dateFin).getTime() : Infinity,
  };
}

function chevauchementFort(
  candidat: Pick<CandidatEvenement, 'date_debut' | 'date_fin'>,
  evenement: Pick<Evenement, 'date_debut' | 'date_fin'>,
): boolean {
  if (!candidat.date_debut) return false;

  const a = intervalleMs(candidat.date_debut, candidat.date_fin);
  const b = intervalleMs(evenement.date_debut, evenement.date_fin);

  const debutChevauchement = Math.max(a.debut, b.debut);
  const finChevauchement = Math.min(a.fin, b.fin);
  const dureeChevauchement = finChevauchement - debutChevauchement;
  if (dureeChevauchement <= 0) return false;

  const dureeA = a.fin - a.debut;
  const dureeB = b.fin - b.debut;
  const dureeReference = Math.min(dureeA, dureeB);

  // Les deux intervalles sont indéfinis (aucune date de fin de part et
  // d'autre) et se chevauchent déjà : leur recouvrement croît sans borne
  // dans le temps, donc "fortement chevauchant" par construction.
  if (!Number.isFinite(dureeReference)) return true;

  return dureeChevauchement / dureeReference > SEUIL_CHEVAUCHEMENT_PERIODE;
}
