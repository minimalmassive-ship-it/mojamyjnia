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
  id: string;
  name: string;
  lat: number;
  lng: number;
  isSponsored: boolean;
  features: WashFeatures;
};

// Funkcja obliczająca punkty
export const calculatePoints = (features: WashFeatures): number => {
  let points = 0;
  // Czas
  if (features.timePerPLN === '+60s') points += 3;
  else if (features.timePerPLN === '60s') points += 2;
  else if (features.timePerPLN === '45s') points += 1;

  // Reszta cech
  if (features.hasVacuum) points += 1;
  if (features.hasBrush) points += 1;
  if (features.acceptsCoins) points += 1;
  if (features.acceptsBanknotes) points += 1;
  if (features.acceptsCards) points += 1;
  if (features.hasChanger) points += 1;

  return points;
};

export const MAX_POINTS = 9;

export const mockStations: WashStation[] = [
  {
    id: '1',
    name: 'Janosik Premium Wash',
    lat: 52.2297,
    lng: 21.0122,
    isSponsored: true,
    features: {
      timePerPLN: '+60s',
      hasVacuum: true,
      hasBrush: true,
      acceptsCoins: true,
      acceptsBanknotes: true,
      acceptsCards: true,
      hasChanger: true,
    } // 9 pkt (Fiolet)
  },
  {
    id: '2',
    name: 'Myjnia Szybka Błysk',
    lat: 52.2350,
    lng: 21.0150,
    isSponsored: false,
    features: {
      timePerPLN: '60s',
      hasVacuum: true,
      hasBrush: false,
      acceptsCoins: true,
      acceptsBanknotes: true,
      acceptsCards: true,
      hasChanger: true,
    } // 2 + 5 = 7 pkt (Niebieski)
  },
  {
    id: '3',
    name: 'Karcher Centrum',
    lat: 52.2200,
    lng: 21.0000,
    isSponsored: false,
    features: {
      timePerPLN: '+60s',
      hasVacuum: true,
      hasBrush: false,
      acceptsCoins: true,
      acceptsBanknotes: false,
      acceptsCards: true,
      hasChanger: true,
    } // 3 + 4 = 7 pkt (Niebieski)
  },
  {
    id: '4',
    name: 'Auto Spa Gold',
    lat: 52.2250,
    lng: 21.0250,
    isSponsored: false,
    features: {
      timePerPLN: '+60s',
      hasVacuum: true,
      hasBrush: true,
      acceptsCoins: true,
      acceptsBanknotes: false,
      acceptsCards: true,
      hasChanger: true,
    } // 3 + 5 = 8 pkt (Jasny Fiolet)
  },
  {
    id: '5',
    name: 'Myjka 24h',
    lat: 52.2400,
    lng: 20.9900,
    isSponsored: false,
    features: {
      timePerPLN: '45s',
      hasVacuum: false,
      hasBrush: false,
      acceptsCoins: true,
      acceptsBanknotes: false,
      acceptsCards: false,
      hasChanger: false,
    } // 1 + 1 = 2 pkt
  }
];
