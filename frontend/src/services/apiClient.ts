/**
 * apiClient — unique point de consommation de l'API publique (FR-011 : le
 * frontend ne doit avoir aucun jeu de données parallèle en dehors du fond de
 * carte statique). Toutes les requêtes réseau du frontend passent par ici.
 */

export type Etat = 'vert' | 'rouge' | 'gris';

export interface Evenement {
  id: string;
  departement_code: string;
  type_evenement: 'interdiction' | 'levee' | 'prolongation';
  date_debut: string;
  date_fin: string | null;
  reference_arrete: string | null;
  source_url: string | null;
  date_saisie: string;
  connecteur_id: string;
  methode_collecte: 'automatique' | 'manuelle_verifiee';
}

export interface DepartementState {
  code: string;
  nom: string;
  etat: Etat;
  evenement_applicable: Evenement | null;
  connecteur_id: string | null;
}

export interface DepartementsStateResponse {
  date: string;
  derniere_mise_a_jour: string;
  departements: DepartementState[];
}

export interface DepartementHistoryResponse {
  code: string;
  nom: string;
  couvert: boolean;
  evenements: Evenement[];
}

export interface EvenementsResponse {
  derniere_mise_a_jour: string;
  evenements: Evenement[];
}

export interface ApiErrorPayload {
  error: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: ApiErrorPayload,
  ) {
    super(payload.message);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({
      error: 'unknown_error',
      message: response.statusText,
    }))) as ApiErrorPayload;
    throw new ApiError(response.status, payload);
  }
  return (await response.json()) as T;
}

/** GET /departements?date=YYYY-MM-DD — état de tous les départements à une date. */
export function getDepartementsAtDate(date: string): Promise<DepartementsStateResponse> {
  return get<DepartementsStateResponse>(`/departements?date=${encodeURIComponent(date)}`);
}

/** GET /departements/{code}/evenements — historique complet d'un département. */
export function getDepartementHistory(code: string): Promise<DepartementHistoryResponse> {
  return get<DepartementHistoryResponse>(`/departements/${encodeURIComponent(code)}/evenements`);
}

/** GET /evenements?debut=&fin= — tous les événements sur un intervalle. */
export function listEvenements(debut: string, fin: string): Promise<EvenementsResponse> {
  return get<EvenementsResponse>(
    `/evenements?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`,
  );
}
