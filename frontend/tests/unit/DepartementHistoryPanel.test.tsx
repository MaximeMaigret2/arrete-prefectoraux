import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DepartementHistoryPanel from '../../src/components/History/DepartementHistoryPanel.js';
import { ApiError, type DepartementHistoryResponse, type Evenement } from '../../src/services/apiClient.js';

const { getDepartementHistory } = vi.hoisted(() => ({ getDepartementHistory: vi.fn() }));

vi.mock('../../src/services/apiClient.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient.js')>(
    '../../src/services/apiClient.js',
  );
  return { ...actual, getDepartementHistory };
});

function evenement(overrides: Partial<Evenement>): Evenement {
  return {
    id: 'evt-1',
    departement_code: '77',
    type_evenement: 'interdiction',
    date_debut: '2026-01-01T00:00:00.000Z',
    date_fin: null,
    reference_arrete: null,
    source_url: null,
    date_saisie: '2026-01-01T08:00:00.000Z',
    connecteur_id: 'prefecture-77',
    methode_collecte: 'automatique',
    ...overrides,
  };
}

function reponse(overrides: Partial<DepartementHistoryResponse>): DepartementHistoryResponse {
  return { code: '77', nom: 'Seine-et-Marne', couvert: true, evenements: [], ...overrides };
}

describe("DepartementHistoryPanel — historique d'un département (idée n°3 du backlog produit)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les événements du plus récent au plus ancien, avec dates et référence', async () => {
    getDepartementHistory.mockResolvedValueOnce(
      reponse({
        evenements: [
          evenement({
            id: 'evt-ancien',
            type_evenement: 'interdiction',
            date_debut: '2026-01-05T00:00:00.000Z',
            date_fin: '2026-01-20T00:00:00.000Z',
            reference_arrete: 'AP-2026-001',
          }),
          evenement({
            id: 'evt-recent',
            type_evenement: 'levee',
            date_debut: '2026-02-10T00:00:00.000Z',
            date_fin: null,
            reference_arrete: 'AP-2026-002',
            source_url: 'https://example.gouv.fr/raa.pdf',
          }),
        ],
      }),
    );

    render(<DepartementHistoryPanel code="77" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('departement-history-list')).toBeInTheDocument());

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Le plus récent (evt-recent, levée) doit apparaître en premier.
    expect(items[0]).toHaveTextContent('Levée');
    expect(items[0]).toHaveTextContent('AP-2026-002');
    expect(items[1]).toHaveTextContent('Interdiction');
    expect(items[1]).toHaveTextContent('AP-2026-001');
    expect(items[1]).toHaveTextContent('Du 05/01/2026 au 20/01/2026');
    expect(screen.getByText('Voir la source')).toHaveAttribute('href', 'https://example.gouv.fr/raa.pdf');
  });

  it('affiche "Depuis le [...]" pour un événement encore en cours (sans date_fin)', async () => {
    getDepartementHistory.mockResolvedValueOnce(
      reponse({ evenements: [evenement({ date_debut: '2026-03-01T00:00:00.000Z', date_fin: null })] }),
    );

    render(<DepartementHistoryPanel code="77" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('departement-history-list')).toBeInTheDocument());
    expect(screen.getByText(/Depuis le 01\/03\/2026/)).toBeInTheDocument();
  });

  it("affiche un message dédié pour un département non couvert", async () => {
    getDepartementHistory.mockResolvedValueOnce(reponse({ couvert: false, evenements: [] }));

    render(<DepartementHistoryPanel code="2A" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('departement-history-non-couvert')).toBeInTheDocument());
    expect(screen.queryByTestId('departement-history-list')).not.toBeInTheDocument();
  });

  it("affiche un message dédié pour un département couvert sans aucun arrêté connu", async () => {
    getDepartementHistory.mockResolvedValueOnce(reponse({ couvert: true, evenements: [] }));

    render(<DepartementHistoryPanel code="13" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('departement-history-vide')).toBeInTheDocument());
  });

  it("affiche un message d'erreur si l'appel API échoue", async () => {
    getDepartementHistory.mockRejectedValueOnce(
      new ApiError(404, { error: 'departement_not_found', message: "Département introuvable." }),
    );

    render(<DepartementHistoryPanel code="99" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Département introuvable.'));
  });

  it('appelle onClose au clic sur le bouton de fermeture et sur la touche Échap', async () => {
    getDepartementHistory.mockResolvedValue(reponse({ evenements: [] }));
    const onClose = vi.fn();

    render(<DepartementHistoryPanel code="77" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('departement-history-vide')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Fermer l'historique"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ne recouvre pas la carte d'un fond opaque (panneau latéral, pas une modale plein écran)", async () => {
    getDepartementHistory.mockResolvedValue(reponse({ evenements: [] }));
    render(<DepartementHistoryPanel code="77" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('departement-history-vide')).toBeInTheDocument());

    expect(screen.queryByTestId('departement-history-overlay')).not.toBeInTheDocument();
  });

  it('recharge les données quand le code change', async () => {
    getDepartementHistory.mockResolvedValueOnce(reponse({ code: '77', nom: 'Seine-et-Marne', evenements: [] }));
    const { rerender } = render(<DepartementHistoryPanel code="77" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Seine-et-Marne/)).toBeInTheDocument());

    getDepartementHistory.mockResolvedValueOnce(reponse({ code: '13', nom: 'Bouches-du-Rhône', evenements: [] }));
    rerender(<DepartementHistoryPanel code="13" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Bouches-du-Rhône/)).toBeInTheDocument());
    expect(getDepartementHistory).toHaveBeenCalledWith('77');
    expect(getDepartementHistory).toHaveBeenCalledWith('13');
  });
});
