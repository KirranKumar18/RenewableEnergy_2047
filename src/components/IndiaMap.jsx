import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GEO_TO_MODEL_NAME, STATE_TO_ZONE, ZONE_COLORS } from '../data/stateMapping';

// Fit map to India bounds on mount
function FitBounds({ geoData }) {
  const map = useMap();
  useEffect(() => {
    if (geoData) {
      const layer = L.geoJSON(geoData);
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }
  }, [geoData, map]);
  return null;
}

export default function IndiaMap({ onStateClick, selectedState, predictionData }) {
  const [geoData, setGeoData] = useState(null);
  const geoRef = useRef(null);

  useEffect(() => {
    fetch('/in.json')
      .then(r => r.json())
      .then(setGeoData)
      .catch(e => console.error('Failed to load in.json:', e));
  }, []);

  // Choropleth coloring by predicted MW (if available)
  const capacityByState = useMemo(() => {
    if (!predictionData) return {};
    // We store the last prediction keyed by model state name
    const map = {};
    if (predictionData._modelState) {
      map[predictionData._modelState] = predictionData.predicted_capacity_mw?.total || 0;
    }
    return map;
  }, [predictionData]);

  const styleFeature = useCallback((feature) => {
    const geoName = feature.properties.name;
    const modelName = GEO_TO_MODEL_NAME[geoName];
    const zone = modelName ? STATE_TO_ZONE[modelName] : null;
    const zc = zone ? ZONE_COLORS[zone] : { fill: '#475569', border: '#64748b' };
    const isSelected = modelName && modelName === selectedState;

    // If this state has a capacity prediction and we are in choropleth mode, intensify color
    const hasCap = modelName && capacityByState[modelName] !== undefined;

    return {
      fillColor: isSelected ? '#fff' : zc.fill,
      weight: isSelected ? 3 : 1.2,
      opacity: 1,
      color: isSelected ? '#10B981' : zc.border,
      fillOpacity: isSelected ? 0.25 : (hasCap ? 0.7 : 0.45),
      dashArray: isSelected ? '4' : '',
    };
  }, [selectedState, capacityByState]);

  const onEachFeature = useCallback((feature, layer) => {
    const geoName = feature.properties.name;
    const modelName = GEO_TO_MODEL_NAME[geoName];
    const zone = modelName ? STATE_TO_ZONE[modelName] : 'N/A';
    const zc = zone !== 'N/A' ? ZONE_COLORS[zone] : null;

    // Tooltip
    const tooltipContent = `
      <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;padding:4px 0;">
        <div style="font-weight:700;font-size:13px;color:#f8fafc;">${geoName}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
          ${zc ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${zc.fill};margin-right:4px;vertical-align:middle;"></span>` : ''}
          ${zone !== 'N/A' ? zone + ' Zone' : 'Not in Model'}
        </div>
      </div>
    `;
    layer.bindTooltip(tooltipContent, {
      sticky: true,
      direction: 'top',
      className: 'state-tooltip',
      offset: [0, -10],
    });

    // Hover
    layer.on('mouseover', (e) => {
      e.target.setStyle({ fillOpacity: 0.75, weight: 2.5, color: '#10B981' });
      e.target.bringToFront();
    });
    layer.on('mouseout', (e) => {
      if (geoRef.current) geoRef.current.resetStyle(e.target);
    });

    // Click
    layer.on('click', () => {
      if (modelName) onStateClick(modelName, zone);
    });
  }, [onStateClick]);

  // Force re-render styles when selected state changes
  useEffect(() => {
    if (geoRef.current) {
      geoRef.current.setStyle((feature) => styleFeature(feature));
    }
  }, [selectedState, styleFeature]);

  if (!geoData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-2xl">
        <div className="text-slate-400 text-sm animate-pulse">Loading India Map…</div>
      </div>
    );
  }

  return (
    <MapContainer
      center={[22.5, 82]}
      zoom={5}
      minZoom={4}
      maxZoom={8}
      zoomControl={false}
      scrollWheelZoom={true}
      className="w-full h-full rounded-2xl"
      style={{ background: '#0b1120' }}
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
  );
}
