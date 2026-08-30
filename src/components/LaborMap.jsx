import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import { radiusFor, fmtCompact, fmtMetric, markerPropsFor, NO_DATA_COLOR } from '../utils/laborMetrics';

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

// Spec 0008 R2. Measured, not assumed: 206 of the marker paths were sitting in
// the tab order from stop 55, so the ranking listbox — the actual keyboard path
// to a country — was unreachable within 260 presses. They carry no tabindex;
// Chrome puts them in sequential navigation anyway once Leaflet binds a Tooltip
// and its focus/blur listeners (leaflet-src.js:10987).
//
// They are not operable by keyboard — Path has no Enter handling, only Marker
// does — so 206 stops that do nothing but open a tooltip are worse than
// useless: they bury the control that works. Explicitly removed from the tab
// order, which leaves the listbox as the keyboard path R2 requires. The markers
// keep their mouse and tooltip behaviour untouched.
function MarkersOutOfTabOrder({ rows, metric }) {
  const map = useMap();
  useEffect(() => {
    const strip = () => {
      for (const el of map.getContainer().querySelectorAll('path.leaflet-interactive')) {
        el.setAttribute('tabindex', '-1');
      }
    };
    strip();
    map.on('layeradd zoomend moveend', strip);
    return () => map.off('layeradd zoomend moveend', strip);
  }, [map, rows, metric]);
  return null;
}

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
      <MarkersOutOfTabOrder rows={rows} metric={metric} />

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
        // Spec 0008 R5. The dashed stroke on no-data markers is the non-colour
        // channel: the lightest ramp step is ΔE00 3.7 from the no-data grey, so
        // colour alone cannot say "no data" rather than "a low value".
        const { hasData, ...pathStyle } = markerPropsFor(metric, r, isSelected);
        return (
          <CircleMarker
            key={r.iso3}
            center={[r.lat, r.lon]}
            radius={radiusFor(r.employed_total) * (isSelected ? 1.35 : 1)}
            pathOptions={pathStyle}
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
