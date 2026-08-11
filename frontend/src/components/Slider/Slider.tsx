import * as RadixSlider from '@radix-ui/react-slider';

export interface SliderProps {
  /** Bornes de l'intervalle sélectionné, au format YYYY-MM-DD. */
  minDate: string;
  maxDate: string;
  /** Date courante affichée, au format YYYY-MM-DD. */
  value: string;
  onChange: (date: string) => void;
}

function toDayIndex(dateStr: string, epoch: string): number {
  const ms = new Date(`${dateStr}T00:00:00Z`).getTime() - new Date(`${epoch}T00:00:00Z`).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function fromDayIndex(index: number, epoch: string): string {
  const ms = new Date(`${epoch}T00:00:00Z`).getTime() + index * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Réglette jour-par-jour (US2, FR-004), primitive accessible
 * `@radix-ui/react-slider` (research.md §6). Le pas est toujours d'un jour ;
 * chaque déplacement déclenche `onChange` avec la nouvelle date sélectionnée.
 */
export default function Slider({ minDate, maxDate, value, onChange }: SliderProps) {
  const maxIndex = toDayIndex(maxDate, minDate);
  const currentIndex = toDayIndex(value, minDate);

  return (
    <div className="slider-widget">
      <label htmlFor="date-slider" style={{ display: 'block', marginBottom: '0.4rem' }}>
        Défilement jour par jour : <strong>{value}</strong>
      </label>
      <RadixSlider.Root
        id="date-slider"
        className="slider-root"
        min={0}
        max={Math.max(maxIndex, 0)}
        step={1}
        value={[Math.min(currentIndex, Math.max(maxIndex, 0))]}
        onValueChange={([index]) => onChange(fromDayIndex(index, minDate))}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: 24 }}
      >
        <RadixSlider.Track
          style={{ background: '#ddd', position: 'relative', flexGrow: 1, borderRadius: 9999, height: 4 }}
        >
          <RadixSlider.Range style={{ position: 'absolute', background: '#333', borderRadius: 9999, height: '100%' }} />
        </RadixSlider.Track>
        {/* aria-label doit être sur Thumb : c'est cet élément, pas Root, qui
            porte role="slider" côté Radix (et donc le nom accessible exposé
            aux lecteurs d'écran et aux tests). */}
        <RadixSlider.Thumb
          aria-label="Sélection de la date affichée sur la carte"
          style={{
            display: 'block',
            width: 18,
            height: 18,
            background: '#fff',
            border: '2px solid #333',
            borderRadius: '50%',
            cursor: 'grab',
          }}
        />
      </RadixSlider.Root>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#555' }}>
        <span>{minDate}</span>
        <span>{maxDate}</span>
      </div>
    </div>
  );
}
