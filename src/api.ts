import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);

export type WashFeatures = {
  timePerPLN: '45s' | '60s' | '+60s';
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
  if (features.timePerPLN === '+60s') pts += 3;
  else if (features.timePerPLN === '60s') pts += 2;
  else if (features.timePerPLN === '45s') pts += 1;

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

// Fetch from OpenStreetMap Overpass API
export async function fetchStationsNearby(lat: number, lng: number): Promise<WashStation[]> {
  const query = `[out:json][timeout:25];nwr["amenity"="car_wash"](around:10000,${lat},${lng});out center;`;
  
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'data=' + encodeURIComponent(query)
    });
    
    if (!response.ok) {
      throw new Error('Overpass API error: ' + response.statusText);
    }
    
    const data = await response.json();
    
    // Parse OSM nodes, ways and relations
    const osmStations: WashStation[] = data.elements.map((el: any) => ({
      id: el.id.toString(),
      name: el.tags?.name || 'Myjnia bez nazwy',
      lat: el.center?.lat || el.lat,
      lng: el.center?.lon || el.lon,
      features: { ...DEFAULT_FEATURES }, // default before supabase merge
      points: calculatePoints(DEFAULT_FEATURES),
      isRated: false,
    }));

    if (osmStations.length === 0) return [];

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
              timePerPLN: dbEntry.time_per_pln || '45s',
              hasVacuum: dbEntry.has_vacuum || false,
              hasBrush: dbEntry.has_brush || false,
              acceptsCoins: dbEntry.accepts_coins || false,
              acceptsBanknotes: dbEntry.accepts_banknotes || false,
              acceptsCards: dbEntry.accepts_cards || false,
              hasChanger: dbEntry.has_changer || false,
            };
            return {
              ...station,
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

export async function submitSurvey(stationId: string, features: WashFeatures) {
  const { error } = await supabase
    .from('wash_stations')
    .upsert({
      id: stationId,
      time_per_pln: features.timePerPLN,
      has_vacuum: features.hasVacuum,
      has_brush: features.hasBrush,
      accepts_coins: features.acceptsCoins,
      accepts_banknotes: features.acceptsBanknotes,
      accepts_cards: features.acceptsCards,
      has_changer: features.hasChanger,
    }, { onConflict: 'id' });

  if (error) {
    console.error("Błąd zapisu ankiety do Supabase:", error);
    throw error;
  }
}
