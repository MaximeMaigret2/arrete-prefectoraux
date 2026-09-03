import { useEffect, useRef, useState } from 'react';
import { ApiError, getDepartementHistory, type Evenement } from '../../services/apiClient.js';

export interface DepartementHistoryPanelProps {
  /** Code du département dont l'historique est affiché. */
  code: string;
  onClose: () => void;
}

const LABEL_TYPE_EVENEMENT: Record<Evenement['type_evenement'], string> = {
  interdiction: 'Interdiction',
  levee: 'Levée',
  prolongation: 'Prolongation',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * Panneau d'historique complet d'un département (idée n°3 du backlog
 * produit, volet "affichage" — le stockage et la lecture existent déjà
 * depuis la feature 001, US4). Ouvert au clic sur un département de la
 * carte (Map.tsx), il consomme `GET /departements/{code}/evenements` via
 * `getDepartementHistory` — aucun jeu de données parallèle côté frontend
 * (FR-011) : c'est le seul point de lecture de l'historique.
 *
 * Panneau LATÉRAL ancré au bord droit de l'écran (pas une modale plein
 * écran) : aucun fond opaque ne recouvre la carte, qui reste cliquable et
 * survolable pendant que le panneau est ouvert — cliquer un autre
 * département recharge simplement le contenu du panneau (changement de
 * `code`). Fermeture uniquement via le bouton dédié ou la touche Échap.
 *
 * L'API renvoie les événements triés du plus ancien au plus récent
 * (`date_debut` croissant, cf. backend/src/data/loader.ts) ; ils sont
 * affichés ici du plus récent au plus ancien, plus utile pour une lecture
 * d'historique (le dernier arrêté en premier).
 */
export default function DepartementHistoryPanel({ code, onClose }: DepartementHistoryPanelProps) {
  const [nom, setNom] = useState<string | null>(null);
  const [couvert, setCouvert] = useState<boolean | null>(null);
  const [evenements, setEvenements] = useState<Evenement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Rechargement systématique au changement de département (jamais de
  // données périmées d'un précédent code affichées pendant le chargement).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvenements(null);
    setNom(null);
    setCouvert(null);

    getDepartementHistory(code)
      .then((response) => {
        if (cancelled) return;
        setNom(response.nom);
        setCouvert(response.couvert);
        setEvenements(response.evenements);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Impossible de charger l'historique de ce département.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Fermeture au clavier (Échap) + focus initial sur le bouton de fermeture
  // (même patron que le popover du calendrier, Calendar.tsx).
  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const headingId = `departement-history-heading-${code}`;
  const chronologieDecroissante = evenements ? [...evenements].reverse() : [];

  return (
    <aside className="history-panel" aria-labelledby={headingId} data-testid="departement-history-panel">
      <div className="history-panel-header">
          <h2 id={headingId} className="history-panel-title">
            {nom ?? `Département ${code}`} <span className="history-panel-code">({code})</span>
          </h2>
          <button
            type="button"
            className="history-panel-close"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Fermer l'historique"
          >
            ×
          </button>
        </div>

        {loading && <p aria-live="polite">Chargement de l&apos;historique…</p>}
        {error && (
          <p className="app-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && couvert === false && (
          <p data-testid="departement-history-non-couvert">
            <em>Département non couvert — aucun connecteur de collecte actif, aucune donnée disponible.</em>
          </p>
        )}

        {!loading && !error && couvert === true && chronologieDecroissante.length === 0 && (
          <p data-testid="departement-history-vide">Aucun arrêté connu à ce jour pour ce département.</p>
        )}

        {!loading && !error && couvert === true && chronologieDecroissante.length > 0 && (
          <ul className="history-list" data-testid="departement-history-list">
            {chronologieDecroissante.map((evt) => (
              <li key={evt.id} className={`history-item history-item--${evt.type_evenement}`}>
                <span className={`history-badge history-badge--${evt.type_evenement}`}>
                  {LABEL_TYPE_EVENEMENT[evt.type_evenement]}
                </span>
                <div className="history-item-body">
                  <div className="history-item-dates">
                    {evt.date_fin ? (
                      <>
                        Du {formatDate(evt.date_debut)} au {formatDate(evt.date_fin)}
                      </>
                    ) : (
                      <>Depuis le {formatDate(evt.date_debut)}</>
                    )}
                  </div>
                  {evt.reference_arrete && <div className="history-item-reference">{evt.reference_arrete}</div>}
                  <div className="history-item-meta">
                    Saisi le {formatDateTime(evt.date_saisie)}
                    {evt.methode_collecte === 'manuelle_verifiee' ? ' · vérifié manuellement' : ' · collecte automatique'}
                    {evt.source_url && (
                      <>
                        {' · '}
                        <a href={evt.source_url} target="_blank" rel="noreferrer">
                          Voir la source
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
    </aside>
  );
}
