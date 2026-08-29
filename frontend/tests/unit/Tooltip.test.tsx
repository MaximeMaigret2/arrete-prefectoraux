import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tooltip from '../../src/components/Map/Tooltip.js';
import type { DepartementState } from '../../src/services/apiClient.js';

const BASE: DepartementState = {
  code: '77',
  nom: 'Seine-et-Marne',
  etat: 'vert',
  evenement_applicable: null,
  connecteur_id: 'prefecture-77',
  derniere_collecte: null,
};

describe('Tooltip — date de dernière collecte par département (feature 004)', () => {
  it('affiche la date de dernière collecte pour un département vert quand elle est renseignée', () => {
    render(
      <Tooltip
        departement={{ ...BASE, derniere_collecte: '2026-08-20T20:11:35.805Z' }}
        x={0}
        y={0}
      />,
    );
    expect(screen.getByTestId('map-tooltip-freshness')).toBeInTheDocument();
    expect(screen.getByTestId('map-tooltip-freshness')).toHaveTextContent('Donnée vérifiée le');
  });

  it('affiche la date de dernière collecte pour un département rouge quand elle est renseignée', () => {
    render(
      <Tooltip
        departement={{
          ...BASE,
          etat: 'rouge',
          derniere_collecte: '2026-08-20T20:11:35.805Z',
          evenement_applicable: {
            id: 'evt-1',
            departement_code: '77',
            type_evenement: 'interdiction',
            date_debut: '2026-08-01T00:00:00.000Z',
            date_fin: null,
            reference_arrete: 'AP-2026-001',
            source_url: null,
            date_saisie: '2026-08-01T00:00:00.000Z',
            connecteur_id: 'prefecture-77',
            methode_collecte: 'automatique',
          },
        }}
        x={0}
        y={0}
      />,
    );
    expect(screen.getByTestId('map-tooltip-freshness')).toBeInTheDocument();
  });

  it("n'affiche aucune date de collecte pour un département gris (FR-002)", () => {
    render(<Tooltip departement={{ ...BASE, etat: 'gris', connecteur_id: null }} x={0} y={0} />);
    expect(screen.queryByTestId('map-tooltip-freshness')).not.toBeInTheDocument();
  });

  it("n'affiche aucune date de collecte quand derniere_collecte est null même pour un département vert", () => {
    render(<Tooltip departement={{ ...BASE, derniere_collecte: null }} x={0} y={0} />);
    expect(screen.queryByTestId('map-tooltip-freshness')).not.toBeInTheDocument();
  });
});
