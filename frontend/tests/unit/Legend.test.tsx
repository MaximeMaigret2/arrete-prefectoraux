import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Legend from '../../src/components/Legend/Legend.js';

describe('Legend', () => {
  it('affiche un libellé textuel distinct pour chacun des 3 états (FR-002/SC-002)', () => {
    render(<Legend />);

    expect(screen.getByText('Aucun arrêté en vigueur')).toBeInTheDocument();
    expect(screen.getByText("Arrêté d'interdiction en vigueur")).toBeInTheDocument();
    expect(screen.getByText('Non couvert')).toBeInTheDocument();
  });
});
