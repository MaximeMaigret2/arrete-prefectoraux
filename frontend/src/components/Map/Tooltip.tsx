import type { ReactNode } from 'react';
import type { DepartementState } from '../../services/apiClient.js';

export interface TooltipData {
  departement: DepartementState;
  x: number;
  y: number;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Date + heure (Europe/Paris) — feature 004, FR-004 : même fuseau que le reste de l'affichage. */
function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * Infobulle de détail au survol (US3, FR-005/FR-006) :
 * - rouge : référence de l'arrêté + dates exactes ("Depuis le [...]" si pas de fin).
 * - vert : mention explicite d'absence d'interdiction en vigueur, complétée
 *   par les dates du dernier arrêté connu s'il en existe un (idée n°2 du
 *   backlog produit, 2026-09-01).
 * - gris : mention explicite "non couvert" (jamais confondue avec le vert).
 * Départements vert/rouge : date de dernière collecte de la source
 * (feature 004, FR-003) — jamais affichée pour gris (FR-002 : toujours null).
 */
export default function Tooltip({ departement, x, y }: TooltipData) {
  const { etat, nom, code, evenement_applicable, derniere_collecte, dernier_arrete_connu } = departement;

  let content: ReactNode;
  if (etat === 'rouge' && evenement_applicable) {
    content = (
      <>
        <strong>{evenement_applicable.reference_arrete ?? 'Référence inconnue'}</strong>
        <br />
        {evenement_applicable.date_fin ? (
          <>
            Du {formatDate(evenement_applicable.date_debut)} au {formatDate(evenement_applicable.date_fin)}
          </>
        ) : (
          <>Depuis le {formatDate(evenement_applicable.date_debut)}</>
        )}
      </>
    );
  } else if (etat === 'vert') {
    content = (
      <>
        Aucune interdiction en vigueur à cette date.
        {dernier_arrete_connu && (
          <div data-testid="map-tooltip-dernier-arrete" style={{ marginTop: '0.35rem' }}>
            Dernier arrêté connu : du {formatDate(dernier_arrete_connu.date_debut)} au{' '}
            {formatDate(dernier_arrete_connu.date_fin)}
            {dernier_arrete_connu.reference_arrete && <> ({dernier_arrete_connu.reference_arrete})</>}
          </div>
        )}
      </>
    );
  } else {
    content = <em>Non couvert — aucune donnée disponible pour ce département.</em>;
  }

  return (
    <div
      role="tooltip"
      data-testid="map-tooltip"
      data-etat={etat}
      style={{
        position: 'fixed',
        left: x + 12,
        top: y + 12,
        background: '#1a1a1a',
        color: '#fff',
        padding: '0.5rem 0.75rem',
        borderRadius: '6px',
        fontSize: '0.85rem',
        maxWidth: '260px',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
        {nom} ({code})
      </div>
      {content}
      {etat !== 'gris' && derniere_collecte && (
        <div data-testid="map-tooltip-freshness" style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#ccc' }}>
          Donnée vérifiée le {formatDateTime(derniere_collecte)}
        </div>
      )}
    </div>
  );
}
