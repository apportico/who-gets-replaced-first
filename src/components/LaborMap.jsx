import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import { colorFor, radiusFor, fmtCompact, fmtMetric, NO_DATA_COLOR } from '../utils/laborMetrics';

const MAP_CENTER = [22, 12];
const MAP_ZOOM = 2;
// Esri's light gray canvas: free, no API key, and desaturated enough that the
// data circles carry the colour. (CARTO's basemaps now require a key.)
const BASE_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const LABEL_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — data: World Bank Open Data &amp; ILOSTAT';

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target && target.lat != null && target.lon != null) {
      map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 4), { duration: 0.6 });
    }
  }, [target, map]);
  return null;
}

export default function LaborMap({ rows, metric, selected, onSelect, flyTarget, corridorStates }) {
  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={MAP_ZOOM}
      minZoom={2}
      maxZoom={8}
      className="w-full h-full"
      style={{ background: '#f8fafc' }}
      zoomControl={false}
      worldCopyJump
    >
      <TileLayer url={BASE_TILE} attribution={ATTRIBUTION} />
      <FlyTo target={flyTarget} />

      {/* R16. Corridor-board overlay: rings mark states that appear on the
          geopolitical board, so labor exposure can be read against corridor exposure. */}
      {corridorStates && rows.filter((r) => corridorStates.has(r.iso3)).map((r) => (
        <CircleMarker
          key={`corridor-${r.iso3}`}
          center={[r.lat, r.lon]}
          radius={radiusFor(r.employed_total) + 6}
          pathOptions={{ fill: false, color: '#7048e8', weight: 1.5, opacity: 0.75, dashArray: '3 3' }}
          interactive={false}
        />
      ))}

      {rows.map((r) => {
        const value = r[metric.key];
        const isSelected = selected && selected.iso3 === r.iso3;
        const hasData = value !== null && value !== undefined;
        return (
          <CircleMarker
            key={r.iso3}
            center={[r.lat, r.lon]}
            radius={radiusFor(r.employed_total) * (isSelected ? 1.35 : 1)}
            pathOptions={{
              fillColor: colorFor(metric, value),
              color: isSelected ? '#111827' : hasData ? '#ffffff' : '#b6bcc4',
              weight: isSelected ? 2.5 : 1,
              fillOpacity: hasData ? 0.88 : 0.55,
            }}
            eventHandlers={{ click: () => onSelect(r) }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1}>
              <div style={{ minWidth: 160 }}>
                <strong>{r.country_name}</strong>
                <br />
                <span style={{ fontSize: 11 }}>
                  {metric.short}:{' '}
                  <strong>{hasData ? fmtMetric(metric, value) : 'no data'}</strong>
                </span>
                <br />
                <span style={{ fontSize: 11, color: '#555' }}>
                  {fmtCompact(r.employed_total)} employed
                </span>
                {corridorStates && corridorStates.has(r.iso3) && (
                  <>
                    <br />
                    <span style={{ fontSize: 10, color: '#7048e8', fontWeight: 600 }}>
                      on the corridor board
                    </span>
                  </>
                )}
                {r.data_year_occupation && metric.key.startsWith('isco') && (
                  <>
                    <br />
                    <span style={{ fontSize: 10, color: '#777' }}>
                      occupation data {r.data_year_occupation}
                    </span>
                  </>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      <TileLayer url={LABEL_TILE} />
    </MapContainer>
  );
}

export { NO_DATA_COLOR };
