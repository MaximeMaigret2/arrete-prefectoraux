import { useCallback, useEffect, useMemo, useState } from 'react';
import DepartementsMap from '../components/Map/Map.js';
import Legend from '../components/Legend/Legend.js';
import Calendar, { type CalendarSelection } from '../components/Calendar/Calendar.js';
import Slider from '../components/Slider/Slider.js';
import { getDepartementsAtDate, type DepartementState, ApiError } from '../services/apiClient.js';

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
  const [derniereMiseAJour, setDerniereMiseAJour] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Chargement initial : date du jour (US1).
  useEffect(() => {
    fetchForDate(today);
  }, [fetchForDate, today]);

  // Recalcule la carte à chaque changement de date, sans rechargement de page (US2).
  useEffect(() => {
    if (currentDate !== today) {
      fetchForDate(currentDate);
    }
  }, [currentDate, fetchForDate, today]);

  const handleCalendarSelection = useCallback(
    (selection: CalendarSelection) => {
      if (selection.mode === 'single') {
        // Chemin "date unique" (T030) : un seul fetch, pas de réglette nécessaire.
        setSliderBounds(null);
        const iso = toISODate(selection.date);
        setCurrentDate(iso);
      } else if (selection.range.from && selection.range.to) {
        const min = toISODate(selection.range.from);
        const max = toISODate(selection.range.to);
        setSliderBounds({ min, max });
        setCurrentDate(min);
      }
    },
    [],
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

      <div className="map-legend-row">
        <DepartementsMap departementsState={departementsState} />
        <Legend />
      </div>
    </div>
  );
}
