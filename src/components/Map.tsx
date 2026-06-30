import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { type WashStation, calculatePoints, MAX_POINTS } from '../api';
import { Check, X, Navigation } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

// Funkcja pomocnicza do kolorów na mapie i w UI
export const getScoreColor = (points: number) => {
  if (points >= MAX_POINTS) return 'bg-brand-purple text-white border-brand-purple';
  if (points === MAX_POINTS - 1) return 'bg-brand-lightPurple text-white border-brand-lightPurple';
  if (points === MAX_POINTS - 2) return 'bg-brand-blue text-white border-brand-blue';
  return 'bg-dark-surfaceHover text-gray-300 border-dark-border'; // reszta neutralna
};

const createCustomIcon = (points: number, isSponsored: boolean) => {
  const colorClass = getScoreColor(points);
  // Wyciągamy klasę tła (np. bg-brand-purple) żeby wrzucić w styles albo użyć HTML w DivIcon
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
        zoom={13} 
        zoomControl={false}
        className="w-full h-full"
      >
        <LocationUpdater center={userLocation} />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* User Location */}
        {hasLocationPermission && userLocation && <Marker position={userLocation} icon={userIcon} />}

        {/* Stations */}
        {stations.map(station => {
          const points = station.isRated ? calculatePoints(station.features) : 0;
          return (
            <Marker 
              key={station.id} 
              position={[station.lat, station.lng]} 
              icon={createCustomIcon(points, false)}
            >
              <Popup className="custom-popup">
                <div className="w-64">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg leading-tight text-white">{station.name}</h3>
                    <div className={twMerge('px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap', getScoreColor(points))}>
                      {points} / {MAX_POINTS} pkt
                    </div>
                  </div>
                  
                  {/* Cechy z TAK/NIE wylistowane jasno */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 my-4 text-sm text-gray-300">
                    <FeatureRow label="Czas za 1zł" value={station.features.timePerPLN} isRated={!!station.isRated} />
                    <FeatureRow label="Odkurzacz" value={station.features.hasVacuum} isRated={!!station.isRated} />
                    <FeatureRow label="Szczotka" value={station.features.hasBrush} isRated={!!station.isRated} />
                    <FeatureRow label="Bilon" value={station.features.acceptsCoins} isRated={!!station.isRated} />
                    <FeatureRow label="Banknoty" value={station.features.acceptsBanknotes} isRated={!!station.isRated} />
                    <FeatureRow label="Karta" value={station.features.acceptsCards} isRated={!!station.isRated} />
                    <FeatureRow label="Rozmieniarka" value={station.features.hasChanger} isRated={!!station.isRated} />
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button 
                      onClick={(e) => { e.preventDefault(); onNavigate(station); }}
                      className="flex-1 bg-brand-blue hover:bg-blue-600 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Navigation size={16} />
                      Jedź
                    </button>
                    <button 
                      onClick={(e) => { e.preventDefault(); onSurveyOpen(station); }}
                      className="flex-1 bg-dark-surfaceHover hover:bg-gray-700 text-white py-2 rounded-xl font-bold transition-colors"
                    >
                      Oceń
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  );
};

const FeatureRow = ({ label, value, isRated }: { label: string, value: boolean | string, isRated: boolean }) => {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      {!isRated ? (
        <span className="font-semibold text-gray-500">-</span>
      ) : typeof value === 'boolean' ? (
        value ? <Check size={16} className="text-green-500" /> : <X size={16} className="text-red-500" />
      ) : (
        <span className="font-semibold text-white">{value}</span>
      )}
    </div>
  )
}
