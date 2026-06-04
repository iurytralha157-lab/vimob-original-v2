// Types
export type PrecisionLevel = 'exact' | 'street' | 'neighborhood' | 'city';

export type POIType = 'supermarket' | 'hospital' | 'school' | 'pharmacy' | 'bank' | 'restaurant';

export interface LocationResult {
  lat: number;
  lon: number;
  boundingBox?: [number, number, number, number]; // [south, north, west, east]
  precision: PrecisionLevel;
}

export interface POI {
  lat: number;
  lon: number;
  type: POIType;
  name?: string;
}

export interface POIConfig {
  emoji: string;
  color: string;
  label: string;
}

// POI Configuration
export const POI_CONFIG: Record<POIType, POIConfig> = {
  supermarket: { emoji: '🛒', color: '#22c55e', label: 'Supermercado' },
  hospital: { emoji: '🏥', color: '#ef4444', label: 'Hospital' },
  school: { emoji: '🎓', color: '#3b82f6', label: 'Escola' },
  pharmacy: { emoji: '💊', color: '#10b981', label: 'Farmácia' },
  bank: { emoji: '🏦', color: '#eab308', label: 'Banco' },
  restaurant: { emoji: '🍽️', color: '#f97316', label: 'Restaurante' },
};

// Get zoom level based on precision
export const getZoomLevel = (precision: PrecisionLevel): number => {
  switch (precision) {
    case 'exact': return 17;
    case 'street': return 16;
    case 'neighborhood': return 14;
    case 'city': return 12;
    default: return 15;
  }
};

// Get precision label for display
export const getPrecisionLabel = (precision: PrecisionLevel): string => {
  switch (precision) {
    case 'exact': return 'Localização exata';
    case 'street': return 'Localização aproximada (rua)';
    case 'neighborhood': return 'Localização aproximada (bairro)';
    case 'city': return 'Localização aproximada (cidade)';
    default: return 'Localização';
  }
};

// Structured geocoding for better accuracy with Brazilian addresses
export const geocodeStructured = async (
  street: string,
  number: string | null,
  city: string,
  state: string,
  precision: PrecisionLevel
): Promise<LocationResult | null> => {
  try {
    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      country: 'Brasil',
    });

    // Use structured search for better accuracy
    if (number && street) {
      params.set('street', `${number} ${street}`);
    } else if (street) {
      params.set('street', street);
    }
    
    if (city) params.set('city', city);
    if (state) params.set('state', state);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'PropertySite/1.0'
        }
      }
    );

    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        boundingBox: result.boundingbox ? result.boundingbox.map(Number) as [number, number, number, number] : undefined,
        precision
      };
    }
    return null;
  } catch (error) {
    console.error('Structured geocoding error:', error);
    return null;
  }
};

// Fallback geocode with simple string search
export const geocodeSimple = async (
  address: string,
  precision: PrecisionLevel
): Promise<LocationResult | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'PropertySite/1.0'
        }
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        boundingBox: result.boundingbox ? result.boundingbox.map(Number) as [number, number, number, number] : undefined,
        precision
      };
    }
    return null;
  } catch (error) {
    console.error('Simple geocoding error:', error);
    return null;
  }
};

// Map OSM tags to our POI types
const mapTagsToPOIType = (tags: Record<string, string>): POIType | null => {
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital';
  if (tags.amenity === 'school' || tags.amenity === 'university' || tags.amenity === 'college') return 'school';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'bank') return 'bank';
  if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food') return 'restaurant';
  return null;
};

// Fetch nearby POIs using Overpass API
export const fetchNearbyPOIs = async (
  lat: number,
  lon: number,
  radius: number = 1000
): Promise<POI[]> => {
  try {
    const query = `
      [out:json][timeout:10];
      (
        node["shop"="supermarket"](around:${radius},${lat},${lon});
        way["shop"="supermarket"](around:${radius},${lat},${lon});
        node["amenity"="hospital"](around:${radius},${lat},${lon});
        way["amenity"="hospital"](around:${radius},${lat},${lon});
        node["amenity"="clinic"](around:${radius},${lat},${lon});
        node["amenity"="school"](around:${radius},${lat},${lon});
        way["amenity"="school"](around:${radius},${lat},${lon});
        node["amenity"="university"](around:${radius},${lat},${lon});
        node["amenity"="pharmacy"](around:${radius},${lat},${lon});
        node["amenity"="bank"](around:${radius},${lat},${lon});
        node["amenity"="restaurant"](around:${radius},${lat},${lon});
        node["amenity"="fast_food"](around:${radius},${lat},${lon});
      );
      out center;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
      console.warn('Overpass API request failed');
      return [];
    }

    const data = await response.json();
    
    if (!data.elements) return [];

    const pois: POI[] = [];
    
    for (const element of data.elements) {
      const type = mapTagsToPOIType(element.tags || {});
      if (!type) continue;

      // For ways (buildings), use the center coordinates
      const poiLat = element.lat ?? element.center?.lat;
      const poiLon = element.lon ?? element.center?.lon;

      if (poiLat && poiLon) {
        pois.push({
          lat: poiLat,
          lon: poiLon,
          type,
          name: element.tags?.name
        });
      }
    }

    // Limit to avoid cluttering the map
    return pois.slice(0, 30);
  } catch (error) {
    console.error('Error fetching POIs:', error);
    return [];
  }
};

// Create custom POI icon for Leaflet
export const createPOIIcon = (L: any, type: POIType): any => {
  const config = POI_CONFIG[type];
  
  return L.divIcon({
    html: `
      <div style="
        font-size: 20px;
        background: ${config.color};
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      ">${config.emoji}</div>
    `,
    className: 'poi-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

// Get POI label for display
export const getPOILabel = (type: POIType): string => {
  return POI_CONFIG[type]?.label || 'Local';
};
