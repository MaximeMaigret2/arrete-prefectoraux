import { useMemo, useState, type MouseEvent } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import type { DepartementState } from '../../services/apiClient.js';
import Tooltip from './Tooltip.js';
import departementsTopoJson from '../../assets/departements.topojson?url';

export interface MapProps {
  /** État calculé de chaque département, indexé par code (FR-007 : dérivé de l'API, jamais stocké côté client). */
  departementsState: Map<string, DepartementState>;
}

/** Symbole non-couleur associé à chaque état (cohérent avec Legend.tsx, FR-002/WCAG 2.1 AA). */
const SYMBOL_BY_ETAT: Record<string, string> = {
  vert: '●',
  rouge: '▲',
  gris: '■',
};

/**
 * Composant Map — rendu SVG des départements coloré par état
 * (`react-simple-maps` / TopoJSON, US1). Chaque département porte, en plus
 * de la couleur, un symbole non-couleur à son centroïde (FR-002) et déclenche
 * une infobulle de détail au survol (US3, connectée ici — T034).
 */
export default function Map({ departementsState }: MapProps) {
  // On ne stocke que la position + le code du département survolé, jamais
  // un instantané de son état : `departementsState` peut encore être en
  // cours de chargement (ou se rafraîchir, US2) au moment du survol, et
  // l'infobulle doit refléter la donnée la plus récente à chaque rendu —
  // pas seulement celle disponible au moment de l'événement mouseenter.
  const [hovered, setHovered] = useState<{ code: string; nom: string; x: number; y: number } | null>(null);

  const geographyUrl = useMemo(() => departementsTopoJson, []);

  return (
    <div className="map-container" onMouseLeave={() => setHovered(null)}>
      <ComposableMap
        className="map-svg"
        projection="geoConicConformal"
        projectionConfig={{ center: [2.5, 46.5], parallels: [44, 49], scale: 2800 }}
        role="img"
        aria-label="Carte de France des départements colorée selon l'état des arrêtés d'interdiction de rassemblements musicaux non déclarés"
      >
        <Geographies geography={geographyUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const code: string = geo.properties.code ?? geo.id;
              const nom: string = geo.properties.nom ?? code;
              const state =
                departementsState.get(code) ??
                ({ code, nom, etat: 'gris', evenement_applicable: null, connecteur_id: null, derniere_collecte: null } as DepartementState);
              const centroid = geoCentroid(geo);

              return (
                <g key={geo.rsmKey}>
                  <Geography
                    geography={geo}
                    tabIndex={0}
                    role="button"
                    aria-label={`${nom} : ${state.etat}`}
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
            })
          }
        </Geographies>
      </ComposableMap>
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
            } as DepartementState);
          return <Tooltip departement={departement} x={hovered.x} y={hovered.y} />;
        })()}
    </div>
  );
}
