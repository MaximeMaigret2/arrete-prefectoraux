import type { Etat } from '../../services/apiClient.js';

interface LegendEntry {
  etat: Etat;
  label: string;
  symbole: string;
  description: string;
}

const ENTRIES: LegendEntry[] = [
  {
    etat: 'vert',
    label: 'Aucun arrêté en vigueur',
    symbole: '●',
    description: 'Département couvert par un connecteur, aucune interdiction active à la date affichée.',
  },
  {
    etat: 'rouge',
    label: "Arrêté d'interdiction en vigueur",
    symbole: '▲',
    description: 'Un arrêté préfectoral interdisant les rassemblements musicaux non déclarés est actif.',
  },
  {
    etat: 'gris',
    label: 'Non couvert',
    symbole: '■',
    description:
      'Aucun connecteur de collecte actif pour ce département : donnée non disponible (ne signifie pas absence d’interdiction).',
  },
];

/**
 * Légende accessible (FR-002, WCAG 2.1 AA) : chaque état porte un symbole
 * et un libellé textuel, pas seulement une couleur, pour rester
 * distinguable indépendamment de la perception des couleurs (SC-002).
 */
export default function Legend() {
  return (
    <section aria-labelledby="legend-heading" className="legend">
      <h2 id="legend-heading" style={{ fontSize: '1rem' }}>
        Légende
      </h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {ENTRIES.map((entry) => (
          <li
            key={entry.etat}
            className={`legend-item legend-item--${entry.etat}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span
              aria-hidden="true"
              className={`legend-swatch legend-swatch--${entry.etat}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '4px',
                fontSize: '0.9rem',
                background:
                  entry.etat === 'vert' ? 'var(--color-vert)' : entry.etat === 'rouge' ? 'var(--color-rouge)' : 'var(--color-gris)',
                color: '#fff',
              }}
            >
              {entry.symbole}
            </span>
            <span>
              <strong>{entry.label}</strong>
              <br />
              <span style={{ fontSize: '0.8rem', color: '#555' }}>{entry.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { ENTRIES as legendEntries };
