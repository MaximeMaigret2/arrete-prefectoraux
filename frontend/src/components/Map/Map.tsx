import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import type { DepartementState } from '../../services/apiClient.js';
import Tooltip from './Tooltip.js';
import departementsTopoJson from '../../assets/departements.topojson?url';

export interface MapProps {
  /** État calculé de chaque département, indexé par code (FR-007 : dérivé de l'API, jamais stocké côté client). */
  departementsState: Map<string, DepartementState>;
  /** Appelé au clic (ou activation clavier) d'un département — ouvre le panneau d'historique (MapPage.tsx). */
  onSelectDepartement?: (code: string) => void;
}

/** Symbole non-couleur associé à chaque état (cohérent avec Legend.tsx, FR-002/WCAG 2.1 AA). */
const SYMBOL_BY_ETAT: Record<string, string> = {
  vert: '●',
  rouge: '▲',
  gris: '■',
};

/** Codes des 8 départements franciliens — trop petits pour être distingués/cliqués individuellement sur la carte de France entière. */
const IDF_CODES = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);

/**
 * Centre et échelle de la carte agrandie dans la popin Île-de-France :
 * calculés via un script `d3-geo` ad hoc (`_claude_tmp/idf-modal-fit.mjs`,
 * non conservé dans le dépôt), pour que l'emprise réelle des 8 départements
 * franciliens remplisse ~86% d'un viewBox de 520×480. `react-simple-maps`
 * fixe toujours `translate` à `[width/2, height/2]` en interne
 * (`projectionConfig.translate` n'existe pas dans son API — seuls
 * `center`/`rotate`/`scale`/`parallels` sont transmis à la projection d3) :
 * le `center` ci-dessous projette déjà quasiment sur (0,0) à l'échelle 1,
 * donc le centrage par défaut suffit (résidu de quelques pixels,
 * imperceptible).
 */
const IDF_MODAL_VIEWBOX = { width: 520, height: 480 };
const IDF_MODAL_PROJECTION_CONFIG = {
  center: [2.505, 48.709] as [number, number],
  parallels: [44, 49] as [number, number],
  scale: 18298,
};

/**
 * `viewBox` recadré de la carte principale : la projection (`center`,
 * `parallels`, `scale` ci-dessous, inchangés) laisse une grande marge vide
 * autour de la France dans le viewBox par défaut (0 0 800 600) — bornes
 * pixel réelles de la géométrie (via `geoPath().bounds`, méthode identique
 * à celle utilisée pour l'encart IDF) : x ≈ [151, 662], y ≈ [76, 533] dans
 * ce viewBox 800×600. Recadré en haut (marge réduite, pour que la carte
 * s'aligne avec le haut du panneau latéral gauche) ET sur les côtés (marge
 * réduite à ~20px de chaque côté, pour rapprocher visuellement la carte du
 * panneau — l'écart signalé par l'utilisateur venait de cette marge
 * horizontale, pas de l'espacement CSS de la mise en page). Marge basse
 * laissée telle quelle (non signalée). `width`/`height` (qui pilotent la
 * translation de la projection) restent à 800×600 par défaut, seul le
 * cadrage visuel du SVG change.
 */
const MAIN_MAP_VIEWBOX = '130 64 553 536';

/**
 * Composant Map — rendu SVG des départements coloré par état
 * (`react-simple-maps` / TopoJSON, US1). Chaque département porte, en plus
 * de la couleur, un symbole non-couleur à son centroïde (FR-002) et déclenche
 * une infobulle de détail au survol (US3, connectée ici — T034).
 *
 * Île-de-France (2026-09-02, troisième itération) : après deux essais d'un
 * encart séparé (mini-carte interactive, puis vignette-bouton ouvrant une
 * popin) jugés insuffisants ou peu naturels par l'utilisateur, l'encart est
 * supprimé — les 8 départements franciliens sont rendus normalement, à leur
 * place géographique réelle, sur la carte principale. Comme ils restent
 * trop petits pour être des cibles de clic individuelles fiables, ils sont
 * traités comme UNE SEULE région cliquable : survoler n'importe lequel des
 * 8 met en surbrillance les 8 en même temps (`idfHovered`, classe CSS
 * partagée), et cliquer n'importe lequel ouvre la même popin agrandie
 * (`IDF_MODAL_*`) plutôt que de sélectionner directement un département —
 * la sélection précise se fait ensuite dans la popin, où chaque département
 * est assez grand pour être cliqué sans ambiguïté.
 */
export default function Map({ departementsState, onSelectDepartement }: MapProps) {
  // On ne stocke que la position + le code du département survolé, jamais
  // un instantané de son état : `departementsState` peut encore être en
  // cours de chargement (ou se rafraîchir, US2) au moment du survol, et
  // l'infobulle doit refléter la donnée la plus récente à chaque rendu —
  // pas seulement celle disponible au moment de l'événement mouseenter.
  const [hovered, setHovered] = useState<{ code: string; nom: string; x: number; y: number } | null>(null);
  // Survol de la région Île-de-France (les 8 départements ensemble, pas un
  // seul) : juste une position d'infobulle + un booléen dérivé pour la
  // surbrillance partagée — separé de `hovered` ci-dessus, qui suppose un
  // seul département réel (etat rouge/vert/gris précis, utilisé par
  // Tooltip.tsx) et n'a pas de sens pour "8 départements à la fois".
  const [idfHoverPos, setIdfHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [idfModalOpen, setIdfModalOpen] = useState(false);
  const idfModalCloseRef = useRef<HTMLButtonElement>(null);

  const geographyUrl = useMemo(() => departementsTopoJson, []);

  // Fermeture au clavier (Échap) + focus initial sur le bouton de fermeture
  // dès l'ouverture de la popin (même patron que DepartementHistoryPanel.tsx).
  useEffect(() => {
    if (!idfModalOpen) return undefined;
    idfModalCloseRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIdfModalOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [idfModalOpen]);

  const handleSelect = (code: string) => onSelectDepartement?.(code);
  // Sélectionner un département depuis la popin ferme la popin en plus
  // d'ouvrir le panneau d'historique (comportement "drill-down").
  const handleSelectFromModal = (code: string) => {
    setIdfModalOpen(false);
    onSelectDepartement?.(code);
  };

  // `geo` est typé `any` par @types/react-simple-maps lui-même
  // (`GeographiesChildrenArgument.geographies: any[]`) — un `any` explicite
  // ici est donc cohérent avec la lib, pas une échappatoire à `strict`.
  const renderDepartement = (geo: any, onSelect: (code: string) => void = handleSelect) => {
    const code: string = geo.properties.code ?? geo.id;
    const nom: string = geo.properties.nom ?? code;
    const state =
      departementsState.get(code) ??
      ({ code, nom, etat: 'gris', evenement_applicable: null, connecteur_id: null, derniere_collecte: null, dernier_arrete_connu: null } as DepartementState);
    const centroid = geoCentroid(geo);

    return (
      <g key={geo.rsmKey}>
        <Geography
          geography={geo}
          tabIndex={0}
          role="button"
          aria-label={`${nom} : ${state.etat}. Appuyer sur Entrée pour voir l'historique.`}
          className={`map-departement map-departement--${state.etat}`}
          data-code={code}
          data-etat={state.etat}
          onMouseEnter={(evt: MouseEvent) => setHovered({ code, nom, x: evt.clientX, y: evt.clientY })}
          onMouseMove={(evt: MouseEvent) => setHovered({ code, nom, x: evt.clientX, y: evt.clientY })}
          onFocus={() =>
            setHovered({ code, nom, x: window.innerWidth / 2, y: window.innerHeight / 2 })
          }
          onMouseLeave={() => setHovered(null)}
          onBlur={() => setHovered(null)}
          onClick={() => onSelect(code)}
          onKeyDown={(evt: ReactKeyboardEvent) => {
            if (evt.key === 'Enter' || evt.key === ' ') {
              evt.preventDefault();
              onSelect(code);
            }
          }}
          style={{
            default: { outline: 'none' },
            hover: { outline: 'none' },
            pressed: { outline: 'none' },
          }}
        />
        {Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) && (
          <Marker coordinates={centroid as [number, number]}>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              aria-hidden="true"
              style={{ fontSize: 6, fill: '#fff', pointerEvents: 'none' }}
            >
              {SYMBOL_BY_ETAT[state.etat] ?? ''}
            </text>
          </Marker>
        )}
      </g>
    );
  };

  // Rendu d'un département francilien SUR LA CARTE PRINCIPALE : contrairement
  // à `renderDepartement`, le clic n'ouvre pas directement l'historique de CE
  // département (trop peu fiable à cette échelle) mais la popin agrandie ;
  // le survol met en surbrillance les 8 départements franciliens à la fois
  // (`idfHoverPos` déclenche la classe `.map-departement--idf-hover` sur
  // chacun, via `idfHovered` ci-dessous dans le corps du composant).
  const renderIdfDepartement = (geo: any, idfHovered: boolean) => {
    const code: string = geo.properties.code ?? geo.id;
    const etat = departementsState.get(code)?.etat ?? 'gris';
    const centroid = geoCentroid(geo);

    const handlePointer = (evt: MouseEvent) => setIdfHoverPos({ x: evt.clientX, y: evt.clientY });
    const handleFocus = () => setIdfHoverPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const handleLeave = () => setIdfHoverPos(null);
    const handleActivate = () => setIdfModalOpen(true);

    return (
      <g key={geo.rsmKey}>
        <Geography
          geography={geo}
          tabIndex={0}
          role="button"
          aria-label="Île-de-France : 8 départements, trop petits pour être distingués ici. Appuyer sur Entrée pour agrandir et choisir un département."
          className={`map-departement map-departement--${etat}${idfHovered ? ' map-departement--idf-hover' : ''}`}
          data-code={code}
          data-etat={etat}
          data-idf="true"
          onMouseEnter={handlePointer}
          onMouseMove={handlePointer}
          onFocus={handleFocus}
          onMouseLeave={handleLeave}
          onBlur={handleLeave}
          onClick={handleActivate}
          onKeyDown={(evt: ReactKeyboardEvent) => {
            if (evt.key === 'Enter' || evt.key === ' ') {
              evt.preventDefault();
              handleActivate();
            }
          }}
          style={{
            default: { outline: 'none' },
            hover: { outline: 'none' },
            pressed: { outline: 'none' },
          }}
        />
        {Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) && (
          <Marker coordinates={centroid as [number, number]}>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              aria-hidden="true"
              style={{ fontSize: 6, fill: '#fff', pointerEvents: 'none' }}
            >
              {SYMBOL_BY_ETAT[etat] ?? ''}
            </text>
          </Marker>
        )}
      </g>
    );
  };

  const idfHovered = idfHoverPos !== null;

  return (
    <div
      className="map-container"
      onMouseLeave={() => {
        setHovered(null);
        setIdfHoverPos(null);
      }}
    >
      <ComposableMap
        className="map-svg"
        viewBox={MAIN_MAP_VIEWBOX}
        projection="geoConicConformal"
        projectionConfig={{ center: [2.5, 46.5], parallels: [44, 49], scale: 2800 }}
        role="img"
        aria-label="Carte de France des départements colorée selon l'état des arrêtés d'interdiction de rassemblements musicaux non déclarés"
      >
        <Geographies geography={geographyUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const code: string = geo.properties.code ?? geo.id;
              return IDF_CODES.has(code) ? renderIdfDepartement(geo, idfHovered) : renderDepartement(geo);
            })
          }
        </Geographies>
      </ComposableMap>

      {idfModalOpen && (
        <div className="idf-modal-backdrop" onClick={() => setIdfModalOpen(false)}>
          <div
            className="idf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="idf-modal-heading"
            data-testid="idf-zoom-modal"
            onClick={(evt: MouseEvent) => evt.stopPropagation()}
          >
            <div className="idf-modal-header">
              <h2 id="idf-modal-heading">Île-de-France</h2>
              <button
                ref={idfModalCloseRef}
                type="button"
                className="idf-modal-close"
                onClick={() => setIdfModalOpen(false)}
                aria-label="Fermer la carte agrandie"
              >
                ×
              </button>
            </div>
            <p className="idf-modal-hint">Cliquez sur un département pour consulter son historique complet.</p>
            <ComposableMap
              className="idf-modal-svg"
              width={IDF_MODAL_VIEWBOX.width}
              height={IDF_MODAL_VIEWBOX.height}
              projection="geoConicConformal"
              projectionConfig={IDF_MODAL_PROJECTION_CONFIG}
              role="img"
              aria-label="Carte agrandie des 8 départements d'Île-de-France, même code couleur que la carte de France"
            >
              <Geographies geography={geographyUrl}>
                {({ geographies }) =>
                  geographies
                    .filter((geo) => IDF_CODES.has((geo.properties.code ?? geo.id) as string))
                    .map((geo) => renderDepartement(geo, handleSelectFromModal))
                }
              </Geographies>
            </ComposableMap>
          </div>
        </div>
      )}

      {idfHoverPos && (
        <div
          role="tooltip"
          data-testid="idf-region-tooltip"
          style={{
            position: 'fixed',
            left: idfHoverPos.x + 12,
            top: idfHoverPos.y + 12,
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
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Île-de-France</div>
          8 départements — cliquez pour agrandir et choisir un département.
        </div>
      )}

      {hovered &&
        (() => {
          const departement =
            departementsState.get(hovered.code) ??
            ({
              code: hovered.code,
              nom: hovered.nom,
              etat: 'gris',
              evenement_applicable: null,
              connecteur_id: null,
              derniere_collecte: null,
              dernier_arrete_connu: null,
            } as DepartementState);
          return <Tooltip departement={departement} x={hovered.x} y={hovered.y} />;
        })()}
    </div>
  );
}
