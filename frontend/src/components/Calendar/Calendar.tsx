import { useEffect, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

export type CalendarSelection =
  | { mode: 'single'; date: Date }
  | { mode: 'range'; range: DateRange };

export interface CalendarProps {
  onSelectionChange: (selection: CalendarSelection) => void;
}

function formatLabel(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Composant Calendar (US2, FR-003) : sélection d'une date unique ou d'un
 * intervalle, via `react-day-picker` (research.md §6, support natif du mode
 * "range" nécessaire à US2).
 *
 * Le calendrier est replié par défaut derrière un bouton résumant la
 * sélection courante (menu déroulant façon Google Flights), afin que la
 * carte reste l'élément central de l'écran à l'arrivée sur la page.
 */
export default function Calendar({ onSelectionChange }: CalendarProps) {
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [singleDate, setSingleDate] = useState<Date>(new Date());
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const summary =
    mode === 'single'
      ? formatLabel(singleDate)
      : range?.from && range?.to
        ? `${formatLabel(range.from)} – ${formatLabel(range.to)}`
        : 'Choisir des dates';

  return (
    <div className="calendar-widget" ref={containerRef}>
      <button
        type="button"
        className="calendar-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="calendar-trigger-label">Date affichée sur la carte</span>
        <span className="calendar-trigger-value">{summary}</span>
      </button>

      {open && (
        <div className="calendar-popover" role="dialog" aria-label="Sélection de la date">
          <div role="radiogroup" aria-label="Type de sélection de date" style={{ marginBottom: '0.5rem' }}>
            <label style={{ marginRight: '1rem' }}>
              <input
                type="radio"
                name="calendar-mode"
                checked={mode === 'single'}
                onChange={() => {
                  setMode('single');
                  // Reporté dès le changement de mode, pas seulement au clic
                  // sur un jour : la réglette de l'intervalle précédent doit
                  // disparaître au moment où on bascule sur "Date unique".
                  onSelectionChange({ mode: 'single', date: singleDate });
                }}
              />{' '}
              Date unique
            </label>
            <label>
              <input
                type="radio"
                name="calendar-mode"
                checked={mode === 'range'}
                onChange={() => {
                  setMode('range');
                  // Si un intervalle complet avait déjà été sélectionné avant
                  // de rebasculer sur "Date unique", le calendrier le montre
                  // toujours (sélection encore surlignée) : le rebasculement
                  // sur "Intervalle" doit donc réafficher sa réglette, pas
                  // seulement la sélection visuelle dans la grille.
                  if (range?.from && range?.to) {
                    onSelectionChange({ mode: 'range', range });
                  }
                }}
              />{' '}
              Intervalle
            </label>
          </div>

          {mode === 'single' ? (
            <DayPicker
              mode="single"
              required
              // `required` empêche react-day-picker de désélectionner (et donc
              // d'appeler onSelect avec `undefined`) quand on clique sur le
              // jour déjà affiché comme sélectionné — sans ça, cliquer sur la
              // date du jour (mise en surbrillance par défaut) après avoir
              // choisi un intervalle ne déclenchait plus onSelectionChange,
              // et la réglette de l'intervalle précédent restait affichée.
              selected={singleDate}
              onSelect={(date) => {
                if (!date) return;
                setSingleDate(date);
                onSelectionChange({ mode: 'single', date });
                setOpen(false);
              }}
            />
          ) : (
            <DayPicker
              mode="range"
              selected={range}
              onSelect={(selectedRange) => {
                setRange(selectedRange);
                if (selectedRange?.from && selectedRange?.to) {
                  onSelectionChange({ mode: 'range', range: selectedRange });
                  setOpen(false);
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
