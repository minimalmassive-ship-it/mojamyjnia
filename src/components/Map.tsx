import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { type WashStation, calculatePoints, MAX_POINTS } from '../api';
import { Check, X, Navigation } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import useSupercluster from 'use-supercluster';

// Funkcja pomocnicza do kolorów na mapie i w UI
export const getScoreColor = (points: number) => {
  if (points >= MAX_POINTS) return 'bg-brand-purple text-white border-brand-purple';
  if (points === MAX_POINTS - 1) return 'bg-brand-lightPurple text-white border-brand-lightPurple';
  if (points === MAX_POINTS - 2) return 'bg-brand-blue text-white border-brand-blue';
  return 'bg-dark-surfaceHover text-gray-300 border-dark-border'; // reszta neutralna
};

// SVG dla nieocenionej myjni (kropelka)
const defaultIconHtml = `
  <div class="relative w-8 h-8 rounded-full shadow-lg border-2 bg-dark-surfaceHover border-dark-border text-brand-blue flex items-center justify-center">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg>
  </div>
`;

const createCustomIcon = (points: number, isSponsored: boolean, isRated: boolean) => {
  if (!isRated) {
    return L.divIcon({
      html: defaultIconHtml,
      className: 'custom-leaflet-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }

  const colorClass = getScoreColor(points);
  const html = `
    <div class="relative w-8 h-8 rounded-full shadow-lg border-2 flex items-center justify-center font-bold text-sm ${colorClass} ${isSponsored ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-dark-bg scale-110' : ''}">
      ${points}
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const createClusterIcon = (count: number) => {
  return L.divIcon({
    html: `<div class="w-10 h-10 bg-brand-blue/90 backdrop-blur-md rounded-full border-2 border-white text-white font-bold flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            ${count}
           </div>`,
    className: 'custom-marker-cluster',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
};

const userIcon = L.divIcon({
  html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const LocationUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
};

// Nowy komponent do klastrowania z use-supercluster
const MarkersLayer = ({ stations, onNavigate, onSurveyOpen }: { 
  stations: WashStation[], 
  onNavigate: (s: WashStation) => void, 
  onSurveyOpen: (s: WashStation) => void 
}) => {
  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
    zoomend: () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    }
  });

  useEffect(() => {
    if (!bounds) {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    }
  }, [map, bounds]);

  const points = useMemo(() => {
    return stations.map(station => ({
      type: "Feature" as const,
      properties: { cluster: false, stationId: station.id, category: "car_wash", station },
      geometry: { type: "Point" as const, coordinates: [station.lng, station.lat] }
    }));
  }, [stations]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds ? [
      bounds.getSouthWest().lng,
      bounds.getSouthWest().lat,
      bounds.getNorthEast().lng,
      bounds.getNorthEast().lat
    ] : undefined,
    zoom,
    options: { radius: 75, maxZoom: 14 }
  });

  return (
    <>
      {clusters.map(cluster => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const { cluster: isCluster, point_count: pointCount, station } = cluster.properties;

        if (isCluster) {
          return (
            <Marker
              key={`cluster-${cluster.id}`}
              position={[latitude, longitude]}
              icon={createClusterIcon(pointCount)}
              eventHandlers={{
                click: () => {
                  const expansionZoom = Math.min(
                    supercluster.getClusterExpansionZoom(cluster.id as number),
                    18
                  );
                  map.setView([latitude, longitude], expansionZoom, { animate: true });
                }
              }}
            />
          );
        }

        const points = station.isRated ? calculatePoints(station.features) : 0;
        return (
          <Marker 
            key={station.id} 
            position={[latitude, longitude]} 
            icon={createCustomIcon(points, false, !!station.isRated)}
          >
            <Popup className="custom-popup">
              <div className="w-64">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg leading-tight text-white">{station.name}</h3>
                  <div className={twMerge('px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap', getScoreColor(points))}>
                    {points} / {MAX_POINTS} pkt
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 my-4 text-sm text-gray-300">
                  <FeatureRow label="Czas za 1zł" value={station.features.timePerPLN} isRated={!!station.isRated} />
                  <FeatureRow label="Odkurzacz" value={station.features.hasVacuum} isRated={!!station.isRated} />
                  <FeatureRow label="Szczotka" value={station.features.hasBrush} isRated={!!station.isRated} />
                  <FeatureRow label="Bilon" value={station.features.acceptsCoins} isRated={!!station.isRated} />
                  <FeatureRow label="Banknoty" value={station.features.acceptsBanknotes} isRated={!!station.isRated} />
                  <FeatureRow label="Karta" value={station.features.acceptsCards} isRated={!!station.isRated} />
                  <FeatureRow label="Rozmieniarka" value={station.features.hasChanger} isRated={!!station.isRated} />
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-dark-border">
                  <button 
                    onClick={() => onNavigate(station)}
                    className="flex-1 bg-brand-blue hover:bg-blue-600 text-white py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Navigation size={16} /> 
                    Nawiguj
                  </button>
                  <button 
                    onClick={() => onSurveyOpen(station)}
                    className="flex-1 bg-brand-purple hover:bg-purple-600 text-white py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm border border-purple-400"
                  >
                    Oceń (+50xp)
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

export const MapComponent: React.FC<{
  userLocation: [number, number];
  hasLocationPermission: boolean;
  stations: WashStation[];
  onNavigate: (station: WashStation) => void;
  onSurveyOpen: (station: WashStation) => void;
}> = ({ userLocation, hasLocationPermission, stations, onNavigate, onSurveyOpen }) => {
  return (
    <div className="absolute inset-0 z-0 bg-dark-bg">
      <MapContainer 
        center={userLocation} 
        zoom={12} 
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
      >
        <LocationUpdater center={userLocation} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* User Location */}
        {hasLocationPermission && userLocation && <Marker position={userLocation} icon={userIcon} />}

        {/* Stations within bounds */}
        <MarkersLayer stations={stations} onNavigate={onNavigate} onSurveyOpen={onSurveyOpen} />
      </MapContainer>
    </div>
  );
};

const FeatureRow = ({ label, value, isRated }: { label: string, value: any, isRated: boolean }) => {
  if (!isRated) {
    return (
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-gray-500">?</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {value ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-500" />}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
};

