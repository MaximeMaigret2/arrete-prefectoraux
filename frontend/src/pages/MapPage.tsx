import { useCallback, useEffect, useMemo, useState } from 'react';
import DepartementsMap from '../components/Map/Map.js';
import Legend from '../components/Legend/Legend.js';
import Calendar, { type CalendarSelection } from '../components/Calendar/Calendar.js';
import Slider from '../components/Slider/Slider.js';
import DepartementHistoryPanel from '../components/History/DepartementHistoryPanel.js';
import {
  getDepartementsAtDate,
  getDepartementsEtatsPeriode,
  type DepartementEtatsPeriode,
  type DepartementState,
  ApiError,
} from '../services/apiClient.js';
import { resolveEtatDepuisSegments } from '../services/resolveEtatDepuisSegments.js';

function todayParisISODate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

function toISODate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * Page principale de l'application (US1-US3) : orchestre Calendar, Slider,
 * Map et Legend autour de l'unique source de données, l'API publique
 * (FR-011). Affiche la fraîcheur des données (FR-012) et le rappel "ne
 * remplace pas une vérification officielle" (FR-014).
 */
export default function MapPage() {
  const today = useMemo(() => todayParisISODate(), []);

  const [currentDate, setCurrentDate] = useState<string>(today);
  const [sliderBounds, setSliderBounds] = useState<{ min: string; max: string } | null>(null);
  const [departementsState, setDepartementsState] = useState<Map<string, DepartementState>>(new Map());
  // Segments précalculés sur l'intervalle sélectionné (feature 006) — chargés
  // une seule fois à la sélection, jamais à chaque pas de la réglette.
  const [periodeSegments, setPeriodeSegments] = useState<DepartementEtatsPeriode[] | null>(null);
  const [derniereMiseAJour, setDerniereMiseAJour] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Département dont l'historique complet est affiché (idée n°3 du backlog
  // produit, volet affichage) — ouvert au clic sur la carte (Map.tsx).
  const [selectedDepartement, setSelectedDepartement] = useState<string | null>(null);

  const fetchForDate = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDepartementsAtDate(date);
      setDepartementsState(new Map(response.departements.map((d) => [d.code, d])));
      setDerniereMiseAJour(response.derniere_mise_a_jour);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger les données de la carte.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Charge les segments précalculés d'un intervalle en un seul appel réseau
  // (feature 006, FR-005) — le défilement de la réglette au sein de cet
  // intervalle ne déclenche ensuite plus aucun appel (FR-006).
  const fetchSegmentsForRange = useCallback(async (debut: string, fin: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDepartementsEtatsPeriode(debut, fin);
      setPeriodeSegments(response.departements);
      setDerniereMiseAJour(response.derniere_mise_a_jour);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger les données de la carte.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement initial : date du jour (US1).
  useEffect(() => {
    fetchForDate(today);
  }, [fetchForDate, today]);

  // Recalcule la carte à chaque changement de date, sans rechargement de page
  // (US2) — uniquement en mode "date unique" (FR-008) : en mode intervalle,
  // le pas de réglette est résolu localement à partir des segments déjà
  // chargés (feature 006), sans nouvel appel réseau (FR-006).
  useEffect(() => {
    if (sliderBounds === null && currentDate !== today) {
      fetchForDate(currentDate);
    }
  }, [currentDate, fetchForDate, today, sliderBounds]);

  // Dérive l'état affiché à partir des segments déjà chargés, à chaque pas
  // de réglette (feature 006, FR-006/FR-007) — simple recherche de bornes,
  // aucune règle métier dupliquée (resolveEtatDepuisSegments).
  const displayedState = useMemo(() => {
    if (sliderBounds && periodeSegments) {
      return resolveEtatDepuisSegments(periodeSegments, currentDate);
    }
    return departementsState;
  }, [sliderBounds, periodeSegments, currentDate, departementsState]);

  const handleCalendarSelection = useCallback(
    (selection: CalendarSelection) => {
      if (selection.mode === 'single') {
        // Chemin "date unique" (T030) : un seul fetch, pas de réglette nécessaire.
        setSliderBounds(null);
        setPeriodeSegments(null);
        const iso = toISODate(selection.date);
        setCurrentDate(iso);
      } else if (selection.range.from && selection.range.to) {
        const min = toISODate(selection.range.from);
        const max = toISODate(selection.range.to);
        setSliderBounds({ min, max });
        setCurrentDate(min);
        // Un seul appel pour tout l'intervalle (feature 006) — plus jamais
        // un appel par pas de réglette.
        fetchSegmentsForRange(min, max);
      }
    },
    [fetchSegmentsForRange],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Carte des arrêtés d&apos;interdiction de rassemblements musicaux non déclarés</h1>
        <p className="app-disclaimer">
          Cet outil est un service d&apos;information et ne remplace pas une vérification officielle
          auprès de la préfecture ou du Recueil des Actes Administratifs (RAA) concerné.
        </p>
        {derniereMiseAJour && (
          <p className="app-freshness">Dernière mise à jour des données : {formatDateTime(derniereMiseAJour)}</p>
        )}
      </header>

      <section className="app-controls" aria-label="Sélection de la date">
        <Calendar onSelectionChange={handleCalendarSelection} />
        {sliderBounds && (
          <Slider
            minDate={sliderBounds.min}
            maxDate={sliderBounds.max}
            value={currentDate}
            onChange={setCurrentDate}
          />
        )}
      </section>

      {error && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p aria-live="polite">Chargement de la carte…</p>}

      <p className="map-hint">Cliquez sur un département pour consulter son historique complet.</p>

      <div className="map-legend-row">
        {/* Colonne latérale gauche : uniquement le panneau d'historique,
            affichée seulement quand un département est sélectionné — plus
            jamais superposée à la carte (FR : signalé par l'utilisateur,
            2026-09-02, la carte de France elle-même était partiellement
            recouverte par le panneau en overlay absolu). La carte occupe
            le reste de la largeur, à droite. */}
        {selectedDepartement && (
          <div className="map-side-column">
            <DepartementHistoryPanel code={selectedDepartement} onClose={() => setSelectedDepartement(null)} />
          </div>
        )}
        <DepartementsMap departementsState={displayedState} onSelectDepartement={setSelectedDepartement} />
      </div>

      {/* Légende sous la carte, en disposition horizontale (préférence
          utilisateur, 2026-09-02) plutôt que dans la colonne latérale. */}
      <Legend />
    </div>
  );
}
