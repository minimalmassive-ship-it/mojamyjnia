import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapComponent } from './components/Map';
import { fetchStationsNearby, fetchStationsOffline, submitSurvey, type WashStation, calculatePoints, geocodeCity } from './api';
import { calculateDistance } from './utils/distance';
import { Search, Navigation, X, Trophy, Check, Download, MapPin, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

const WARSAW_CENTER: [number, number] = [52.2297, 21.0122];

function App() {
  const [userLoc, setUserLoc] = useState<[number, number]>(WARSAW_CENTER);
  const [mapCenter, setMapCenter] = useState<[number, number]>(WARSAW_CENTER);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  
  const [routes, setRoutes] = useState<{
    bestCoords: [number, number][] | null;
    bestDist: number | null;
    altCoords: [number, number][] | null;
    altDist: number | null;
  }>({ bestCoords: null, bestDist: null, altCoords: null, altDist: null });
  const lastRouteParamsRef = useRef({ lat: 0, lng: 0, bestId: '', altId: '' });
  
  const [mapStyle, setMapStyle] = useState<'standard' | 'dark' | 'satellite'>(() => {
    const saved = localStorage.getItem('mapStyle');
    return (saved === 'satellite' || saved === 'dark' || saved === 'standard') ? saved : 'standard';
  });

  useEffect(() => {
    localStorage.setItem('mapStyle', mapStyle);
  }, [mapStyle]);
  const watchIdRef = useRef<number | null>(null);

  const [stations, setStations] = useState<WashStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  const [citySearch, setCitySearch] = useState('');
  const [isSearchingCity, setIsSearchingCity] = useState(false);

  useEffect(() => {
    // Check if iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const lastFetchLocRef = useRef<[number, number] | null>(null);

  const fetchStationsIfNeeded = async (lat: number, lng: number) => {
    const lastLoc = lastFetchLocRef.current;
    if (!lastLoc || calculateDistance(lat, lng, lastLoc[0], lastLoc[1]) > 10) {
      setIsLoading(true);
      const fetched = await fetchStationsNearby(lat, lng);
      if (fetched.length > 0) {
        setStations(prev => {
          const map = new Map(prev.map(s => [s.id, s]));
          fetched.forEach(s => map.set(s.id, s));
          return Array.from(map.values());
        });
      }
      lastFetchLocRef.current = [lat, lng];
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Ładujemy na start cały kraj z pliku offline
    const loadAllStations = async () => {
      setIsLoading(true);
      const fetched = await fetchStationsOffline();
      setStations(fetched);
      setIsLoading(false);
    };
    loadAllStations();

    if (navigator.geolocation) {
      let watchCount = 0;
      let bestAccuracy = Infinity;

      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          
          setGpsAccuracy(accuracy);
          
          // Update user location marker continuously as accuracy improves
          setUserLoc([lat, lng]);
          setHasLocationPermission(true);

          // Center map on the first fix, or if we suddenly get a much better GPS lock in the first few updates
          if (watchCount === 0 || (accuracy < bestAccuracy && accuracy <= 50)) {
            setMapCenter([lat, lng]);
          }

          fetchStationsIfNeeded(lat, lng);

          if (accuracy < bestAccuracy) {
            bestAccuracy = accuracy;
          }

          // We do NOT call clearWatch here anymore. 
          // Browsers often start with inaccurate cell-tower triangulation. 
          // By keeping the watch active, we allow the GPS hardware to "warm up" 
          // and provide a highly accurate location after a few seconds.
          
          watchCount++;
        },
        async (error) => {
          console.error("Błąd lokalizacji:", error);
          if (error.code === 1) {
            setHasLocationPermission(false);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setHasLocationPermission(false);
    }

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!citySearch.trim()) return;

    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    
    setIsSearchingCity(true);
    const coords = await geocodeCity(citySearch);
    
    if (coords) {
      setUserLoc(coords);
      setMapCenter(coords);
      setHasLocationPermission(true);
      fetchStationsIfNeeded(coords[0], coords[1]);
    } else {
      alert("Nie znaleziono takiej miejscowości.");
    }
    setIsSearchingCity(false);
  };

  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [surveyStation, setSurveyStation] = useState<WashStation | null>(null);
  const [customName, setCustomName] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [filters, setFilters] = useState({
    minTimePerPLN: null as '30s' | '45s' | '60s' | '75s' | '90s' | null,
    hasVacuum: false,
    hasBrush: false,
    hasChanger: false,
    acceptsCoins: false,
    acceptsBanknotes: false,
    acceptsCards: false,
  });

  const filteredStations = useMemo(() => {
    return stations.filter(s => {
      if (filters.hasVacuum && !s.features.hasVacuum) return false;
      if (filters.hasBrush && !s.features.hasBrush) return false;
      if (filters.hasChanger && !s.features.hasChanger) return false;
      if (filters.acceptsCoins && !s.features.acceptsCoins) return false;
      if (filters.acceptsBanknotes && !s.features.acceptsBanknotes) return false;
      if (filters.acceptsCards && !s.features.acceptsCards) return false;
      
      if (filters.minTimePerPLN) {
        const timeValues: Record<string, number> = { '30s': 30, '45s': 45, '60s': 60, '75s': 75, '90s': 90 };
        const stTime = timeValues[s.features.timePerPLN] || 45;
        const reqTime = timeValues[filters.minTimePerPLN];
        if (stTime < reqTime) return false;
      }

      return true;
    });
  }, [stations, filters]);
  
  // Dual choice
  const recommendations = useMemo(() => {
    if (!userLoc || filteredStations.length === 0) return { best: null, alternative: null, alternativeTitle: '', alternativeReason: '' };

    const stationsWithDist = filteredStations.map(s => ({
      ...s,
      distance: calculateDistance(userLoc[0], userLoc[1], s.lat, s.lng),
      points: calculatePoints(s.features)
    }));

    // Ograniczamy wyszukiwanie do rozsądnego promienia (np. 15 km)
    let nearbyStations = stationsWithDist.filter(s => s.distance <= 15);
    if (nearbyStations.length === 0) {
      nearbyStations = stationsWithDist.filter(s => s.distance <= 50);
    }
    if (nearbyStations.length === 0) {
      nearbyStations = stationsWithDist; // ostateczność
    }

    // Najlepszy wybór = highest points w promieniu, then closest
    const best = [...nearbyStations].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.distance - b.distance;
    })[0];

    // Szybka alternatywa = closest
    let alternative = [...nearbyStations].sort((a, b) => a.distance - b.distance)[0];
    let alternativeTitle = 'Alternatywa';
    let alternativeReason = '';

    if (best && alternative && best.id === alternative.id) {
      // Best is also the closest. Let's find the next closest as alternative
      alternative = [...nearbyStations].filter(s => s.id !== best.id).sort((a, b) => a.distance - b.distance)[0];
      if (alternative) {
        if (!alternative.isRated) {
           alternativeTitle = 'Nieodkryta alternatywa';
           alternativeReason = 'Oceń jako pierwszy!';
        } else {
           alternativeTitle = 'Dalsza alternatywa';
           alternativeReason = 'Najbliższa z pozostałych';
        }
      }
    } else if (alternative) {
       alternativeTitle = 'Szybka alternatywa';
       alternativeReason = 'Najbliżej Ciebie';
    }

    return { best, alternative, alternativeTitle, alternativeReason };
  }, [userLoc, filteredStations]);

  // Fetch routes
  useEffect(() => {
    let active = true;
    const fetchRoutes = async () => {
      if (!userLoc) return;
      
      const bestId = recommendations.best?.id || '';
      const altId = recommendations.alternative?.id || '';
      
      // Calculate distance from last fetched location
      const distFromLast = calculateDistance(userLoc[0], userLoc[1], lastRouteParamsRef.current.lat, lastRouteParamsRef.current.lng) * 1000;
      
      // Only fetch if moved > 50 meters or if recommended stations changed
      if (distFromLast < 50 && lastRouteParamsRef.current.bestId === bestId && lastRouteParamsRef.current.altId === altId) {
        return; 
      }
      
      lastRouteParamsRef.current = { lat: userLoc[0], lng: userLoc[1], bestId, altId };

      let bestCoords: [number, number][] | null = null;
      let bestDist: number | null = null;
      let altCoords: [number, number][] | null = null;
      let altDist: number | null = null;

      try {
        if (recommendations.best) {
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLoc[1]},${userLoc[0]};${recommendations.best.lng},${recommendations.best.lat}?overview=full&geometries=geojson`);
          const data = await res.json();
          if (data.routes && data.routes[0]) {
             bestCoords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
             bestDist = data.routes[0].distance / 1000;
          }
        }
        
        if (recommendations.alternative) {
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLoc[1]},${userLoc[0]};${recommendations.alternative.lng},${recommendations.alternative.lat}?overview=full&geometries=geojson`);
          const data = await res.json();
          if (data.routes && data.routes[0]) {
             altCoords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
             altDist = data.routes[0].distance / 1000;
          }
        }
        
        if (active) {
          setRoutes({ bestCoords, bestDist, altCoords, altDist });
        }
      } catch (e) {
        console.error("OSRM error:", e);
      }
    };
    
    const timeout = setTimeout(fetchRoutes, 500);
    return () => { active = false; clearTimeout(timeout); };
  }, [userLoc, recommendations.best?.id, recommendations.alternative?.id]);

  const handleNavigate = (station: WashStation) => {
    // Dodajemy "myjnia" lub nazwę do zapytania, żeby Google Maps nie snapowało do przypadkowych punktów (np. DHL)
    // pod tym samym adresem, tylko znalazło myjnię w tych współrzędnych.
    const keyword = station.name !== 'Myjnia bez nazwy' ? station.name : 'myjnia samochodowa';
    const destination = `${keyword} ${station.lat},${station.lng}`;
    window.open(`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`, '_blank');
  };

  const handleSurveySubmit = async () => {
    if (surveyStation) {
      try {
        await submitSurvey(surveyStation.id, surveyStation.features, customName);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        
        // Update local state
        setStations(prev => prev.map(s => s.id === surveyStation.id ? { 
          ...surveyStation, 
          name: (customName && customName.trim() !== '') ? customName.trim() : surveyStation.name,
          points: calculatePoints(surveyStation.features) 
        } : s));
      } catch (e) {
        alert("Wystąpił błąd podczas zapisu ocen. Spróbuj ponownie.");
      }
    }
    setIsSurveyOpen(false);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      alert("Aby zainstalować na iOS:\n1. Kliknij ikonę 'Udostępnij' na dole ekranu (kwadrat ze strzałką).\n2. Wybierz 'Do ekranu początkowego' z listy.");
    } else {
      alert("Aplikacja jest już zainstalowana, lub Twoja przeglądarka nie obsługuje instalacji PWA.");
    }
  };

  return (
    <div className="relative w-full h-screen font-sans overflow-hidden bg-dark-bg text-gray-100 flex flex-col">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-bg z-0 text-gray-400">
          Szukam myjni w Twojej okolicy...
        </div>
      ) : (
        <div className="absolute inset-0 z-0 pointer-events-auto">
        <MapComponent 
          mapCenter={mapCenter}
          userLocation={userLoc} 
          hasLocationPermission={hasLocationPermission}
          stations={filteredStations} 
          mapStyle={mapStyle}
          onNavigate={handleNavigate}
          onSurveyOpen={(station) => { setSurveyStation({...station}); setCustomName(''); setIsSurveyOpen(true); }}
          recommendations={recommendations}
          routes={routes}
        />
        </div>
      )}

      {gpsAccuracy && gpsAccuracy > 300 && (
        <div className="absolute top-24 left-4 right-4 z-50 bg-slate-900/90 backdrop-blur-md border border-red-500/50 rounded-xl p-3 text-white text-xs text-left shadow-2xl pointer-events-auto flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <span><b>Słaby sygnał GPS ({Math.round(gpsAccuracy)}m).</b> Wejdź w Ustawienia Telefonu &rarr; Aplikacje &rarr; Chrome &rarr; Lokalizacja, i upewnij się że masz zaznaczoną opcję <b>"Dokładna lokalizacja"</b>.</span>
        </div>
      )}

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-dark-bg/90 to-transparent pointer-events-none">
        <div className="flex flex-col gap-3 w-full pointer-events-auto">
          {/* Top Row: Logo & Map Button */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="Logo" className="w-10 h-10 drop-shadow-xl" />
              <h1 
                className="text-3xl font-black tracking-tighter text-white"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.6), 0 -1px 1px rgba(255,255,255,0.5)" }}
              >
                <span className="text-brand-blue" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.8), 0 4px 12px rgba(0,100,255,0.6), 0 -1px 1px rgba(255,255,255,0.5)" }}>JANOSIK</span> UMYTY
              </h1>
            </div>

            <button 
              onClick={() => {
                setMapStyle(prev => {
                  if (prev === 'standard') return 'satellite';
                  if (prev === 'satellite') return 'dark';
                  return 'standard';
                });
              }}
              className="relative w-[52px] h-[52px] rounded-full shadow-[0_15px_30px_rgba(0,0,0,0.6)] active:scale-95 transition-transform shrink-0 overflow-hidden group border border-t-white/40 border-l-white/30 border-b-black/40 border-r-black/40"
              title="Zmień styl mapy"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-all duration-300"
                style={{
                  transform: mapStyle === 'standard' ? "scale(3.0)" : "scale(1.4)",
                  backgroundImage: mapStyle === 'standard' 
                    ? "url('/map-thumb-sat.png')" 
                    : mapStyle === 'satellite'
                    ? "url('/map-thumb-dark.png')"
                    : "url('/map-thumb-light.png')"
                }}
              />
              <div className="absolute inset-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.5)] bg-black/10 rounded-full pointer-events-none" />
            </button>
          </div>

          {/* Bottom Row: Search & Filters */}
          <div className="flex flex-nowrap items-center gap-2 w-full relative">
            <form onSubmit={handleCitySearch} className="flex flex-1 bg-black/20 backdrop-blur-sm border border-t-white/40 border-l-white/30 border-b-black/40 border-r-black/40 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.5),_0_15px_30px_rgba(0,0,0,0.6)] focus-within:ring-2 focus-within:ring-brand-blue/50 transition-all relative z-10">
              <div className="pl-4 py-3 flex items-center text-gray-200">
                <MapPin size={18} className="drop-shadow-md" />
              </div>
              <input 
                type="text" 
                placeholder="Miasto, ulica..." 
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-white px-3 py-3 text-sm placeholder-white/60 font-bold drop-shadow-md"
              />
              <button 
                type="submit" 
                disabled={isSearchingCity}
                className="pr-4 pl-2 py-3 flex items-center justify-center text-brand-blue hover:text-blue-400 transition-colors disabled:opacity-50"
              >
                <Search size={20} className="drop-shadow-md" />
              </button>
            </form>

            <button 
              onClick={() => setShowSearch(true)}
              className="relative w-[52px] h-[52px] flex items-center justify-center bg-black/20 backdrop-blur-sm border border-t-white/40 border-l-white/30 border-b-black/40 border-r-black/40 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.5),_0_15px_30px_rgba(0,0,0,0.6)] active:scale-95 transition-transform shrink-0 z-10"
              title="Filtry"
            >
              <SlidersHorizontal size={20} className="text-white drop-shadow-md" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Install PWA Button */}
      {(deferredPrompt || isIOS) && (
        <button
          onClick={handleInstallClick}
          className="absolute top-[144px] right-4 z-10 w-[52px] h-[52px] bg-black/20 backdrop-blur-sm border border-t-white/40 border-l-white/30 border-b-black/40 border-r-black/40 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.5),_0_15px_30px_rgba(0,0,0,0.6)] active:scale-95 transition-transform flex items-center justify-center pointer-events-auto group text-brand-blue"
          title="Pobierz Aplikację"
        >
          <Download size={22} className="drop-shadow-md text-white" />
        </button>
      )}

      {/* Dual Choice / Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-16 sm:pb-8 pointer-events-none">
        <div className="flex gap-4 max-w-md mx-auto pointer-events-auto">
          {/* Alternatywa */}
          {recommendations.alternative && (
          <div className="flex-1 relative group">
            <div className="absolute -inset-2 bg-cyan-500/20 blur-[20px] rounded-full pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity" />
            <button 
              onClick={() => handleNavigate(recommendations.alternative!)}
              className="relative w-full h-full bg-[#0a1e29]/20 backdrop-blur-sm border border-t-white/40 border-l-white/30 border-b-black/40 border-r-black/40 rounded-[2rem] p-5 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.5),_0_15px_30px_rgba(0,0,0,0.6)]"
            >
              <div className="text-cyan-300 text-[11px] uppercase tracking-wider font-extrabold text-center drop-shadow-md" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}>
                {recommendations.alternativeTitle}
                {recommendations.alternativeReason && <div className="text-[10px] text-cyan-100 mt-0.5 opacity-90">{recommendations.alternativeReason}</div>}
              </div>
              <div className="text-xl font-black text-white text-center leading-tight h-10 flex items-center justify-center drop-shadow-2xl" style={{ textShadow: "0 2px 6px rgba(0,0,0,1)" }}>{recommendations.alternative.name}</div>
              <div className="text-white font-bold flex items-center gap-1.5 bg-black/50 px-4 py-1.5 rounded-full border border-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] text-sm">
                <Navigation size={14} className="text-cyan-400 drop-shadow-md" />
                {routes.altDist !== null ? routes.altDist.toFixed(1) : (recommendations.alternative as any).distance?.toFixed(1)} km
              </div>
            </button>
          </div>
          )}

          {/* Najlepszy Wybór */}
          {recommendations.best && (
          <div className="flex-1 relative group">
            <div className="absolute -inset-2 bg-green-500/20 blur-[20px] rounded-full pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity" />
            <button 
              onClick={() => handleNavigate(recommendations.best!)}
              className="relative w-full h-full bg-[#0a2410]/20 backdrop-blur-sm border border-t-white/40 border-l-white/30 border-b-black/40 border-r-black/40 rounded-[2rem] p-5 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.5),_0_15px_30px_rgba(0,0,0,0.6)]"
            >
              <div className="text-green-300 text-[11px] uppercase tracking-wider font-extrabold drop-shadow-md" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}>Najlepszy Wybór</div>
              <div className="text-xl font-black text-white text-center leading-tight h-10 flex items-center justify-center drop-shadow-2xl" style={{ textShadow: "0 2px 6px rgba(0,0,0,1)" }}>{recommendations.best.name}</div>
              <div className="flex flex-col gap-2 w-full mt-1">
                <div className="flex items-center justify-between bg-black/40 px-3 py-1.5 rounded-full border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                  <span className="text-white/70 text-xs font-semibold">Punkty</span>
                  <span className="text-white font-bold text-sm bg-green-500/20 px-2 py-0.5 rounded-full text-green-400 border border-green-500/30 drop-shadow-md">{recommendations.best.points} pkt</span>
                </div>
                <div className="flex items-center justify-between bg-black/40 px-3 py-1.5 rounded-full border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                  <span className="text-white/70 text-xs font-semibold">Trasa</span>
                  <span className="text-white font-bold flex items-center gap-1 text-sm">
                    <Navigation size={12} className="text-green-400 drop-shadow-md" />
                    {routes.bestDist !== null ? routes.bestDist.toFixed(1) : (recommendations.best as any).distance?.toFixed(1)} km
                  </span>
                </div>
              </div>
            </button>
          </div>
          )}
        </div>
      </div>

      {/* One Tap Survey Modal */}
      {isSurveyOpen && surveyStation && (
        <div className="absolute inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-end justify-center sm:items-center">
          <div className="bg-dark-surface w-full sm:w-[400px] rounded-t-3xl sm:rounded-3xl p-6 pb-12 sm:pb-6 animate-in slide-in-from-bottom-10 border border-dark-border shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Oceń {surveyStation.name}</h2>
              <button onClick={() => setIsSurveyOpen(false)} className="text-gray-400 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            
            <p className="text-sm text-gray-400 mb-6">Szybka weryfikacja cech. Zaznacz co zastałeś na miejscu. Zero pisania!</p>
            
            {surveyStation.name === 'Myjnia bez nazwy' && (
              <div className="mb-4">
                <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Dodaj nazwę (opcjonalnie)</div>
                <input 
                  type="text" 
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Np. BP, Orlen, Pure Auto..."
                  className="w-full bg-black/30 border border-dark-border rounded-xl px-4 py-3 text-white focus:border-brand-purple outline-none transition-colors"
                />
              </div>
            )}

            {/* Ankieta zamknięta zestawem cech w jednym rzędzie na sekcję (symulacja mobilna) */}
            <div className="space-y-4">
              <div>
                <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Czas za 1 PLN</div>
                <div className="flex gap-2">
                  <SurveyPriceBtn 
                    label="30s" 
                    selected={surveyStation.features.timePerPLN === '30s'} 
                    onClick={() => setSurveyStation({...surveyStation, features: {...surveyStation.features, timePerPLN: '30s'}})} 
                  />
                  <SurveyPriceBtn 
                    label="45s" 
                    selected={surveyStation.features.timePerPLN === '45s'} 
                    onClick={() => setSurveyStation({...surveyStation, features: {...surveyStation.features, timePerPLN: '45s'}})} 
                  />
                  <SurveyPriceBtn 
                    label="60s" 
                    selected={surveyStation.features.timePerPLN === '60s'} 
                    onClick={() => setSurveyStation({...surveyStation, features: {...surveyStation.features, timePerPLN: '60s'}})} 
                  />
                  <SurveyPriceBtn 
                    label="75s" 
                    selected={surveyStation.features.timePerPLN === '75s'} 
                    onClick={() => setSurveyStation({...surveyStation, features: {...surveyStation.features, timePerPLN: '75s'}})} 
                  />
                  <SurveyPriceBtn 
                    label="90s" 
                    selected={surveyStation.features.timePerPLN === '90s'} 
                    onClick={() => setSurveyStation({...surveyStation, features: {...surveyStation.features, timePerPLN: '90s'}})} 
                  />
                </div>
              </div>
              
              <div>
                <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Wyposażenie</div>
                <div className="flex flex-wrap gap-2">
                  <SurveyBtn label="Odkurzacz" icon={<Check size={14}/>} />
                  <SurveyBtn label="Szczotka" icon={<Check size={14}/>} />
                  <SurveyBtn label="Rozmieniarka" icon={<Check size={14}/>} />
                </div>
              </div>

              <div>
                <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Płatności</div>
                <div className="flex flex-wrap gap-2">
                  <SurveyBtn label="Bilon" />
                  <SurveyBtn label="Banknoty" />
                  <SurveyBtn label="Karta" />
                </div>
              </div>
            </div>

            <button 
              onClick={handleSurveySubmit}
              className="w-full mt-8 bg-brand-purple hover:bg-purple-500 text-white font-bold py-4 rounded-xl transition-colors text-lg"
            >
              Potwierdź i odbierz nagrodę
            </button>
          </div>
        </div>
      )}

      {/* Gamification Toast - Kiełbasa dla usera */}
      {showToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[600] animate-in fade-in slide-in-from-top-10">
          <div className="bg-brand-purple text-white px-6 py-4 rounded-2xl shadow-[0_10px_30px_rgba(147,51,234,0.5)] flex items-center gap-4 border border-purple-400">
            <Trophy className="text-yellow-400" size={28} />
            <div>
              <div className="font-bold text-lg">Dobra robota!</div>
              <div className="text-sm text-purple-200">Zyskujesz +50 XP do rangi Janosika.</div>
            </div>
          </div>
        </div>
      )}

      {/* Search Filters Dummy Modal */}
      {showSearch && (
        <div className="absolute inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-end justify-center sm:items-center">
          <div className="bg-dark-surface w-full sm:w-[400px] rounded-t-3xl sm:rounded-3xl p-6 pb-12 sm:pb-6 animate-in slide-in-from-bottom-10 border border-dark-border">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Filtruj cechy</h2>
              <button onClick={() => setShowSearch(false)} className="text-gray-400 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            <p className="text-gray-400 mb-6">Szukaj myjni zawierających wybrane cechy.</p>

            <div className="mb-6">
              <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide flex justify-between">
                <span>Czas za 1 PLN</span>
                <span className="text-xs normal-case font-normal">(co najmniej)</span>
              </div>
              <div className="flex gap-2">
                {(['30s', '45s', '60s', '75s', '90s'] as const).map(time => (
                  <SurveyPriceBtn 
                    key={time}
                    label={time} 
                    selected={filters.minTimePerPLN === time} 
                    onClick={() => {
                      if (filters.minTimePerPLN === time) {
                        setFilters({...filters, minTimePerPLN: null});
                      } else {
                        setFilters({...filters, minTimePerPLN: time});
                      }
                    }} 
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
               <FilterBtn label="Odkurzacz" isOn={filters.hasVacuum} onClick={() => setFilters({...filters, hasVacuum: !filters.hasVacuum})} />
               <FilterBtn label="Szczotka" isOn={filters.hasBrush} onClick={() => setFilters({...filters, hasBrush: !filters.hasBrush})} />
               <FilterBtn label="Rozmieniarka" isOn={filters.hasChanger} onClick={() => setFilters({...filters, hasChanger: !filters.hasChanger})} />
               <FilterBtn label="Karta" isOn={filters.acceptsCards} onClick={() => setFilters({...filters, acceptsCards: !filters.acceptsCards})} />
               <FilterBtn label="Banknoty" isOn={filters.acceptsBanknotes} onClick={() => setFilters({...filters, acceptsBanknotes: !filters.acceptsBanknotes})} />
               <FilterBtn label="Bilon" isOn={filters.acceptsCoins} onClick={() => setFilters({...filters, acceptsCoins: !filters.acceptsCoins})} />
            </div>
            <button 
              onClick={() => setShowSearch(false)}
              className="w-full mt-8 bg-white text-black font-bold py-3 rounded-xl transition-colors"
            >
              Pokaż wyniki ({filteredStations.length})
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// Komponent pomocniczy do przycisków ankiety
const SurveyBtn = ({ label, icon, active = false }: { label: string, icon?: React.ReactNode, active?: boolean }) => {
  const [isOn, setIsOn] = useState(active);
  return (
    <button 
      onClick={() => setIsOn(!isOn)}
      className={twMerge(
        "px-4 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-2",
        isOn 
          ? "bg-brand-purple border-brand-lightPurple text-white" 
          : "bg-dark-surfaceHover border-dark-border text-gray-400 hover:text-gray-200"
      )}
    >
      {icon && isOn && icon}
      {label}
    </button>
  )
}

// Komponent do radio-wyboru (np. czas)
const SurveyPriceBtn = ({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) => {
  return (
    <button 
      onClick={onClick}
      className={twMerge(
        "flex-1 py-2 px-1 rounded-xl text-xs font-bold border transition-all flex items-center justify-center",
        selected 
          ? "bg-brand-purple border-brand-lightPurple text-white" 
          : "bg-dark-surfaceHover border-dark-border text-gray-400 hover:text-gray-200"
      )}
    >
      {label}
    </button>
  )
}

// Komponent do filtrów
const FilterBtn = ({ label, icon, isOn, onClick }: { label: string, icon?: React.ReactNode, isOn: boolean, onClick: () => void }) => {
  return (
    <button 
      onClick={onClick}
      className={twMerge(
        "px-4 py-2 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2",
        isOn 
          ? "bg-brand-purple border-brand-lightPurple text-white" 
          : "bg-dark-surfaceHover border-dark-border text-gray-400 hover:text-gray-200"
      )}
    >
      {icon && isOn && icon}
      {label}
    </button>
  )
}

export default App;
