import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, GeoJSON, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  GEO_TO_MODEL_NAME,
  STATE_TO_ZONE,
  ZONE_COLORS,
  getStateForecast
} from '../data/stateMapping';

// Fit map to India bounds smoothly
function FitBounds({ geoData }) {
  const map = useMap();
  useEffect(() => {
    if (geoData) {
      const layer = L.geoJSON(geoData);
      map.fitBounds(layer.getBounds(), {
        padding: [15, 15],
        maxZoom: 6
      });
    }
  }, [geoData, map]);
  return null;
}

export default function IndiaMap({
  onStateClick,
  onHoverState,
  selectedState,
  year = 2028,
  hoveredState
}) {
  const [geoData, setGeoData] = useState(null);
  const geoRef = useRef(null);

  useEffect(() => {
    fetch('/in.json')
      .then(r => r.json())
      .then(setGeoData)
      .catch(e => console.error('Failed to load in.json:', e));
  }, []);

  // Style each state feature for a clean, executive light theme
  const styleFeature = useCallback((feature) => {
    const geoName = feature.properties.name;
    const modelName = GEO_TO_MODEL_NAME[geoName];
    const zone = modelName ? STATE_TO_ZONE[modelName] : null;
    const zc = zone ? ZONE_COLORS[zone] : { fill: '#94a3b8', border: '#cbd5e1' };

    const isSelected = modelName && modelName === selectedState;
    const isHovered = modelName && modelName === hoveredState;

    if (isSelected) {
      return {
        fillColor: zc.fill,
        weight: 3,
        opacity: 1,
        color: '#0f172a',
        fillOpacity: 0.9,
      };
    }

    if (isHovered) {
      return {
        fillColor: zc.fill,
        weight: 2.5,
        opacity: 1,
        color: '#1e293b',
        fillOpacity: 0.82,
      };
    }

    return {
      fillColor: zc.fill,
      weight: 1.2,
      opacity: 1,
      color: '#ffffff',
      fillOpacity: 0.55,
    };
  }, [selectedState, hoveredState]);

  // Handle events and rich hover tooltip on each state
  const onEachFeature = useCallback((feature, layer) => {
    const geoName = feature.properties.name;
    const modelName = GEO_TO_MODEL_NAME[geoName];
    const zone = modelName ? STATE_TO_ZONE[modelName] : null;

    if (!modelName || !zone) {
      layer.bindTooltip(`
        <div style="font-family:'Plus Jakarta Sans',sans-serif;padding:6px 10px;">
          <strong style="color:#0f172a;font-size:12px;">${geoName}</strong>
          <div style="font-size:10px;color:#64748b;">Territory not modeled</div>
        </div>
      `, { sticky: true, className: 'state-forecast-tooltip' });
      return;
    }

    const zc = ZONE_COLORS[zone] || { fill: '#059669', textColor: '#065f46' };

    // Dynamic rich forecast tooltip on hover
    layer.on('mouseover', (e) => {
      onHoverState && onHoverState(modelName, zone);
      e.target.setStyle({
        weight: 2.8,
        color: '#0f172a',
        fillOpacity: 0.85
      });
      e.target.bringToFront();

      // Compute instant forecast for target year
      const fc = getStateForecast(modelName, zone, year);

      const tooltipHTML = `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;width:230px;padding:12px 14px;background:#ffffff;border-radius:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">
            <div>
              <div style="font-weight:800;font-size:13px;color:#0f172a;line-height:1.2;">${modelName}</div>
              <span style="display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:${zc.lightBg};color:${zc.textColor};margin-top:3px;">
                ${zone} Zone
              </span>
            </div>
            <div style="text-align:right;">
              <span style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:600;display:block;">Forecast Year</span>
              <span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;color:#0f172a;">${year}</span>
            </div>
          </div>

          <div style="margin-bottom:10px;background:#f8fafc;padding:8px 10px;border-radius:8px;border:1px solid #f1f5f9;">
            <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;">Total RE Capacity</div>
            <div style="display:flex;align-items:baseline;gap:4px;margin-top:1px;">
              <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:17px;color:#0f172a;">
                ${fc.totalMW.toLocaleString('en-IN')}
              </span>
              <span style="font-size:11px;font-weight:700;color:#059669;">MW (${fc.totalGW} GW)</span>
            </div>
          </div>

          <div style="font-size:10px;color:#475569;font-weight:600;margin-bottom:4px;text-transform:uppercase;">Source Breakdown</div>
          <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
            ${fc.breakdown.map(b => `
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:10.5px;">
                <span style="display:flex;align-items:center;gap:4px;color:#475569;">
                  <span style="width:6px;height:6px;border-radius:2px;background:${b.color};display:inline-block;"></span>
                  ${b.name}
                </span>
                <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#0f172a;">
                  ${b.mw.toLocaleString('en-IN')} MW
                </span>
              </div>
            `).join('')}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;border-top:1px solid #f1f5f9;padding-top:8px;">
            <div style="background:#fffbeb;padding:5px 8px;border-radius:6px;border:1px solid #fef3c7;">
              <span style="font-size:9px;color:#92400e;display:block;font-weight:600;">Est. CAPEX</span>
              <span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;color:#b45309;">
                ₹${(fc.totalCapexCr).toLocaleString('en-IN')} Cr
              </span>
            </div>
            <div style="background:#eff6ff;padding:5px 8px;border-radius:6px;border:1px solid #dbeafe;">
              <span style="font-size:9px;color:#1e40af;display:block;font-weight:600;">Unit Tariff</span>
              <span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;color:#1d4ed8;">
                ₹${fc.blendedLcoe}/kWh
              </span>
            </div>
          </div>

          <div style="margin-top:6px;text-align:center;font-size:9px;color:#94a3b8;">
            Click state to inspect & lock forecast
          </div>
        </div>
      `;

      layer.bindTooltip(tooltipHTML, {
        sticky: true,
        direction: 'auto',
        className: 'state-forecast-tooltip',
        offset: [15, 0],
        opacity: 1
      }).openTooltip();
    });

    layer.on('mouseout', (e) => {
      onHoverState && onHoverState(null);
      if (geoRef.current) {
        geoRef.current.resetStyle(e.target);
      }
    });

    layer.on('click', () => {
      onStateClick(modelName, zone);
    });
  }, [onStateClick, onHoverState, year]);

  // Update styles whenever selected or hovered state changes
  useEffect(() => {
    if (geoRef.current) {
      geoRef.current.setStyle((feature) => styleFeature(feature));
    }
  }, [selectedState, hoveredState, styleFeature]);

  if (!geoData) {
    return (
      <div className="w-full h-[520px] flex items-center justify-center bg-slate-100 rounded-2xl border border-slate-200">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 text-xs font-medium">Loading India Map Geometries…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[540px] rounded-2xl overflow-hidden bg-white border border-slate-200/90 shadow-sm">
      <MapContainer
        center={[22.8, 82]}
        zoom={5}
        minZoom={4}
        maxZoom={7}
        zoomControl={false}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ background: '#f8fafc' }}
      >
        <ZoomControl position="bottomright" />
        <FitBounds geoData={geoData} />
        <GeoJSON
          ref={geoRef}
          data={geoData}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </div>
  );
}
