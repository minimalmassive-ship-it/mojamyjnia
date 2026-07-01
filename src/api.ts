import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);

export type WashFeatures = {
  timePerPLN: '30s' | '45s' | '60s' | '75s' | '90s';
  hasVacuum: boolean;
  hasBrush: boolean;
  acceptsCoins: boolean;
  acceptsBanknotes: boolean;
  acceptsCards: boolean;
  hasChanger: boolean;
};

export type WashStation = {
  id: string; // OSM id stringified
  name: string;
  lat: number;
  lng: number;
  features: WashFeatures;
  points?: number; 
  isRated?: boolean;
};

export const MAX_POINTS = 9;

export function calculatePoints(features: WashFeatures): number {
  let pts = 0;
  if (features.timePerPLN === '90s') pts += 4;
  else if (features.timePerPLN === '75s') pts += 3;
  else if (features.timePerPLN === '60s') pts += 2;
  else if (features.timePerPLN === '45s') pts += 1;
  // 30s gives 0 points

  if (features.hasVacuum) pts += 1;
  if (features.hasBrush) pts += 1;
  if (features.acceptsCoins) pts += 1;
  if (features.acceptsBanknotes) pts += 1;
  if (features.acceptsCards) pts += 1;
  if (features.hasChanger) pts += 1;

  return pts;
}

const DEFAULT_FEATURES: WashFeatures = {
  timePerPLN: '45s',
  hasVacuum: false,
  hasBrush: false,
  acceptsCoins: true,
  acceptsBanknotes: false,
  acceptsCards: false,
  hasChanger: false,
};

// Fetch ALL car washes in Poland from the local static JSON file for instant startup
export async function fetchStationsOffline(): Promise<WashStation[]> {
  try {
    const response = await fetch('/poland.json');
    if (!response.ok) {
      console.error("Brak pliku poland.json");
      return [];
    }
    
    const data = await response.json();
    
    const osmStations: WashStation[] = data.elements.map((el: any) => ({
      id: el.id.toString(),
      name: el.tags?.name || 'Myjnia bez nazwy',
      lat: el.center?.lat || el.lat,
      lng: el.center?.lon || el.lon,
      features: { ...DEFAULT_FEATURES },
      points: calculatePoints(DEFAULT_FEATURES),
      isRated: false,
    }));

    return osmStations;
  } catch (error) {
    console.error("Błąd ładowania pliku poland.json:", error);
    return [];
  }
}

export async function fetchStationsNearby(lat: number, lng: number): Promise<WashStation[]> {
  try {
    const query = `[out:json][timeout:25];
(
  node["amenity"="car_wash"](around:20000,${lat},${lng});
  way["amenity"="car_wash"](around:20000,${lat},${lng});
  relation["amenity"="car_wash"](around:20000,${lat},${lng});
  node["car_wash"="yes"](around:20000,${lat},${lng});
  way["car_wash"="yes"](around:20000,${lat},${lng});
  relation["car_wash"="yes"](around:20000,${lat},${lng});
);
out center;`;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'data=' + encodeURIComponent(query)
    });

    if (!response.ok) {
      console.error("Błąd pobierania z Overpass API");
      return [];
    }
    
    const data = await response.json();
    
    const osmStations: WashStation[] = data.elements.map((el: any) => ({
      id: el.id.toString(),
      name: el.tags?.name || 'Myjnia bez nazwy',
      lat: el.center?.lat || el.lat,
      lng: el.center?.lon || el.lon,
      features: { ...DEFAULT_FEATURES },
      points: calculatePoints(DEFAULT_FEATURES),
      isRated: false,
    }));


    if (osmStations.length === 0) {
      // Jeśli serwer zwrócił 0, spróbujmy wyświetlić chociaż alert
      // alert("Brak myjni w promieniu 10km.");
      return [];
    }

    // Extract IDs to query Supabase
    const ids = osmStations.map(s => s.id);
    
    try {
      const { data: supabaseData, error } = await supabase
        .from('wash_stations')
        .select('*')
        .in('id', ids);

      if (error) {
        console.error('Błąd pobierania z Supabase:', error);
        return osmStations;
      }

      // Merge Supabase ratings into OSM stations
      if (supabaseData && supabaseData.length > 0) {
        const dbMap = new Map(supabaseData.map(d => [d.id, d]));
        return osmStations.map(station => {
          const dbEntry = dbMap.get(station.id);
          if (dbEntry) {
            const features: WashFeatures = {
              timePerPLN: (dbEntry.time_per_pln as WashFeatures['timePerPLN']) || '45s',
              hasVacuum: dbEntry.has_vacuum || false,
              hasBrush: dbEntry.has_brush || false,
              acceptsCoins: dbEntry.accepts_coins || false,
              acceptsBanknotes: dbEntry.accepts_banknotes || false,
              acceptsCards: dbEntry.accepts_cards || false,
              hasChanger: dbEntry.has_changer || false,
            };
            return {
              ...station,
              name: dbEntry.name || station.name, // Override name if exists in DB
              features,
              points: calculatePoints(features),
              isRated: true,
            };
          }
          return station;
        });
      }
    } catch (supaErr) {
      console.error('Wyjątek podczas łączenia z Supabase:', supaErr);
      return osmStations;
    }

    return osmStations;
  } catch (err) {
    console.error('Błąd Overpass API:', err);
    return [];
  }
}

export async function submitSurvey(stationId: string, features: WashFeatures, newName?: string) {
  const payload: any = {
    id: stationId,
    time_per_pln: features.timePerPLN,
    has_vacuum: features.hasVacuum,
    has_brush: features.hasBrush,
    accepts_coins: features.acceptsCoins,
    accepts_banknotes: features.acceptsBanknotes,
    accepts_cards: features.acceptsCards,
    has_changer: features.hasChanger,
  };
  
  if (newName && newName.trim() !== '') {
    payload.name = newName.trim();
  }

  const { error } = await supabase
    .from('wash_stations')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error("Błąd zapisu ankiety do Supabase:", error);
    throw error;
  }
}

export async function geocodeCity(cityName: string): Promise<[number, number] | null> {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&countrycodes=pl&limit=1`, {
      headers: {
        'User-Agent': 'MojaMyjnia/1.0'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    return null;
  } catch (err) {
    console.error('Geocoding error:', err);
    return null;
  }
}
