import React, { useState, useEffect, useMemo } from 'react';
import { MapComponent } from './components/Map';
import { mockStations, type WashStation, calculatePoints } from './data/mockData';
import { calculateDistance } from './utils/distance';
import { Search, Navigation, X, Trophy, Check } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

const WARSAW_CENTER: [number, number] = [52.2297, 21.0122];

function App() {
  const [userLoc, setUserLoc] = useState<[number, number]>(WARSAW_CENTER);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLoc([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Błąd lokalizacji. Używam domyślnej.", error);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [surveyStation, setSurveyStation] = useState<WashStation | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  
  // Dual choice
  const recommendations = useMemo(() => {
    const stationsWithDist = mockStations.map(s => ({
      ...s,
      distance: calculateDistance(userLoc[0], userLoc[1], s.lat, s.lng),
      points: calculatePoints(s.features)
    }));

    // Szybka alternatywa = closest
    const closest = [...stationsWithDist].sort((a, b) => a.distance - b.distance)[0];
    
    // Najlepszy wybór = highest points, then closest
    const best = [...stationsWithDist].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.distance - b.distance;
    })[0];

    return { best, closest };
  }, [userLoc]);

  const handleNavigate = (station: WashStation) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`, '_blank');
  };

  const handleSurveySubmit = () => {
    setIsSurveyOpen(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-dark-bg text-white font-sans">
      <MapComponent 
        userLocation={userLoc} 
        stations={mockStations} 
        onNavigate={handleNavigate}
        onSurveyOpen={(s) => {
          setSurveyStation(s);
          setIsSurveyOpen(true);
        }}
      />

      {/* Dyskretna lupka do szukania (SearchFilters) */}
      <div className="absolute top-6 right-4 z-[400]">
        <button 
          onClick={() => setShowSearch(true)}
          className="bg-dark-surface/90 backdrop-blur-sm p-3 rounded-full border border-dark-border shadow-lg text-gray-300 hover:text-white transition-colors"
        >
          <Search size={24} />
        </button>
      </div>

      {/* Dual Choice System Menu */}
      <div className="absolute bottom-0 left-0 w-full z-[400] p-4 bg-gradient-to-t from-dark-bg via-dark-bg/90 to-transparent pt-12 pb-8">
        <div className="flex gap-4 max-w-md mx-auto">
          {/* Szybka Alternatywa */}
          <button 
            onClick={() => handleNavigate(recommendations.closest)}
            className="flex-1 bg-dark-surface/90 backdrop-blur-md border border-dark-border rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <div className="text-gray-400 text-xs uppercase tracking-wider font-bold">Szybka Alternatywa</div>
            <div className="text-lg font-bold text-white text-center leading-tight h-10">{recommendations.closest.name}</div>
            <div className="text-brand-blue font-bold flex items-center gap-1">
              <Navigation size={14} />
              {recommendations.closest.distance.toFixed(1)} km
            </div>
          </button>

          {/* Najlepszy Wybór */}
          <button 
            onClick={() => handleNavigate(recommendations.best)}
            className="flex-1 bg-brand-purple/20 backdrop-blur-md border border-brand-purple rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_20px_rgba(147,51,234,0.3)] relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-brand-purple/20 blur-2xl rounded-full" />
            <div className="text-brand-lightPurple text-xs uppercase tracking-wider font-bold">Najlepszy Wybór</div>
            <div className="text-lg font-bold text-white text-center leading-tight h-10">{recommendations.best.name}</div>
            <div className="text-white font-bold bg-brand-purple px-2 py-0.5 rounded-md text-sm">
              {recommendations.best.points} pkt
            </div>
          </button>
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
            
            {/* Ankieta zamknięta zestawem cech w jednym rzędzie na sekcję (symulacja mobilna) */}
            <div className="space-y-4">
              <div>
                <div className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Czas za 1 PLN</div>
                <div className="flex gap-2">
                  <SurveyBtn label="45s" />
                  <SurveyBtn label="60s" />
                  <SurveyBtn label="+60s" />
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
            <div className="grid grid-cols-2 gap-3">
               {/* Mock filters */}
               <SurveyBtn label="Karta" active />
               <SurveyBtn label="+60s" active />
               <SurveyBtn label="Aktywna piana" />
               <SurveyBtn label="Szczotka" />
            </div>
            <button 
              onClick={() => setShowSearch(false)}
              className="w-full mt-8 bg-white text-black font-bold py-3 rounded-xl transition-colors"
            >
              Pokaż wyniki (2)
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

export default App;
