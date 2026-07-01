import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapComponent } from './components/Map';
import { fetchStationsNearby, submitSurvey, type WashStation, calculatePoints, geocodeCity } from './api';
import { calculateDistance } from './utils/distance';
import { Search, Navigation, X, Trophy, Check, Download, MapPin } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

const WARSAW_CENTER: [number, number] = [52.2297, 21.0122];

function App() {
  const [userLoc, setUserLoc] = useState<[number, number]>(WARSAW_CENTER);
  const [mapCenter, setMapCenter] = useState<[number, number]>(WARSAW_CENTER);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  
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

  useEffect(() => {
    // Only fetch stations once for the whole country
    const loadAllStations = async () => {
      setIsLoading(true);
      const fetched = await fetchStationsNearby();
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
          
          // Update user location marker continuously as accuracy improves
          setUserLoc([lat, lng]);
          setHasLocationPermission(true);

          // Center map on the first fix, or if we suddenly get a much better GPS lock in the first few updates
          if (watchCount === 0 || (accuracy < bestAccuracy && accuracy <= 50)) {
            setMapCenter([lat, lng]);
          }

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

    // Najlepszy wybór = highest points, then closest
    const best = [...stationsWithDist].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.distance - b.distance;
    })[0];

    // Szybka alternatywa = closest
    let alternative = [...stationsWithDist].sort((a, b) => a.distance - b.distance)[0];
    let alternativeTitle = 'Alternatywa';
    let alternativeReason = '';

    if (best && alternative && best.id === alternative.id) {
      // Best is also the closest. Let's find the next closest as alternative
      alternative = [...stationsWithDist].filter(s => s.id !== best.id).sort((a, b) => a.distance - b.distance)[0];
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
        />
        </div>
      )}

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-dark-bg/90 to-transparent pointer-events-none">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Logo" className="w-10 h-10 drop-shadow-md" />
            <h1 className="text-3xl font-black tracking-tighter text-white drop-shadow-md">
              <span className="text-brand-blue">JANOSIK</span> UMYTY
            </h1>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <form onSubmit={handleCitySearch} className="flex flex-1 sm:w-64 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-lg focus-within:border-brand-blue transition-colors">
              <div className="pl-3 py-3 flex items-center text-gray-400">
                <MapPin size={18} />
              </div>
              <input 
                type="text" 
                placeholder="Miasto, ulica..." 
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-white px-3 py-3 text-sm placeholder-gray-500"
              />
              <button 
                type="submit" 
                disabled={isSearchingCity}
                className="px-4 py-3 bg-white/10 text-brand-blue hover:bg-brand-blue hover:text-white transition-colors disabled:opacity-50 font-semibold text-sm"
              >
                Szukaj
              </button>
            </form>

            <button 
              onClick={() => {
                setMapStyle(prev => {
                  if (prev === 'standard') return 'satellite';
                  if (prev === 'satellite') return 'dark';
                  return 'standard';
                });
              }}
              className="relative w-12 h-12 rounded-xl shadow-lg border border-white/10 active:scale-95 transition-transform shrink-0 overflow-hidden group"
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
              <div className="absolute inset-0 ring-1 ring-inset ring-black/20 rounded-xl pointer-events-none" />
            </button>

            <button 
              onClick={() => setShowSearch(true)}
              className="bg-black/40 backdrop-blur-md border border-white/10 p-3.5 rounded-xl shadow-lg active:scale-95 transition-transform shrink-0"
            >
              <Search size={20} className="text-brand-blue" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Install PWA Button */}
      {(deferredPrompt || isIOS) && (
        <button
          onClick={handleInstallClick}
          className="absolute top-40 sm:top-28 right-4 z-10 bg-brand-blue text-white p-3 rounded-full shadow-lg shadow-brand-blue/30 active:scale-95 transition-transform border border-white/20 flex items-center justify-center pointer-events-auto group"
        >
          <Download size={22} />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap font-bold text-sm">
            Zainstaluj Aplikację
          </span>
        </button>
      )}

      {/* Dual Choice / Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-16 sm:pb-8 pointer-events-none">
        <div className="flex gap-4 max-w-md mx-auto pointer-events-auto">
          {/* Alternatywa */}
          {recommendations.alternative && (
          <button 
            onClick={() => handleNavigate(recommendations.alternative!)}
            className="flex-1 bg-orange-950/40 backdrop-blur-md border border-orange-500/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_15px_rgba(249,115,22,0.2)]"
          >
            <div className="text-orange-400 text-xs uppercase tracking-wider font-bold text-center">
              {recommendations.alternativeTitle}
              {recommendations.alternativeReason && <div className="text-[10px] text-orange-300/80 mt-0.5">{recommendations.alternativeReason}</div>}
            </div>
            <div className="text-lg font-bold text-white text-center leading-tight h-10 flex items-center justify-center">{recommendations.alternative.name}</div>
            <div className="text-orange-400 font-bold flex items-center gap-1">
              <Navigation size={14} />
              {(recommendations.alternative as any).distance?.toFixed(1)} km
            </div>
          </button>
          )}

          {/* Najlepszy Wybór */}
          {recommendations.best && (
          <button 
            onClick={() => handleNavigate(recommendations.best!)}
            className="flex-1 bg-green-900/30 backdrop-blur-md border border-green-500 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_20px_rgba(34,197,94,0.3)] relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/20 blur-2xl rounded-full" />
            <div className="text-green-400 text-xs uppercase tracking-wider font-bold">Najlepszy Wybór</div>
            <div className="text-lg font-bold text-white text-center leading-tight h-10">{recommendations.best.name}</div>
            <div className="flex items-center gap-2">
              <div className="text-white font-bold bg-green-600 px-2 py-0.5 rounded-md text-sm">
                {recommendations.best.points} pkt
              </div>
              <div className="text-green-400 font-bold flex items-center gap-1 text-sm">
                <Navigation size={14} />
                {(recommendations.best as any).distance?.toFixed(1)} km
              </div>
            </div>
          </button>
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
