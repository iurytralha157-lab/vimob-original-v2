import React, { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { 
  LocationResult, 
  PrecisionLevel,
  getZoomLevel, 
  getPrecisionLabel,
  geocodeStructured,
  geocodeSimple,
  POI_CONFIG
} from './map-utils';
import { usePOIs } from './usePOIs';
import POIMarkers from './POIMarkers';

interface PropertyLocationProps {
  latitude?: number | null;
  longitude?: number | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  title: string;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
}

interface LeafletModules {
  MapContainer: any;
  TileLayer: any;
  Marker: any;
  Popup: any;
  Rectangle: any;
  L: any;
}

// Error Boundary to catch map errors
interface ErrorBoundaryState {
  hasError: boolean;
}

class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Map Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Separate map component for exact location (pin) with POIs
function LeafletMapWithMarker({ 
  location, 
  title, 
  modules,
  pois
}: { 
  location: LocationResult; 
  title: string; 
  modules: LeafletModules;
  pois: import('./map-utils').POI[];
}) {
  const { MapContainer, TileLayer, Marker, Popup, L } = modules;
  
  try {
    return (
      <MapContainer
        center={[location.lat, location.lon]}
        zoom={getZoomLevel(location.precision)}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        className="rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[location.lat, location.lon]}>
          <Popup>{title}</Popup>
        </Marker>
        <POIMarkers 
          pois={pois} 
          modules={{ Marker, Popup }} 
          L={L} 
        />
      </MapContainer>
    );
  } catch (error) {
    console.error('Error rendering map with marker:', error);
    return null;
  }
}

// Separate map component for area (rectangle) with POIs
function LeafletMapWithArea({ 
  location, 
  title,
  primaryColor,
  modules,
  pois
}: { 
  location: LocationResult; 
  title: string;
  primaryColor: string;
  modules: LeafletModules;
  pois: import('./map-utils').POI[];
}) {
  const { MapContainer, TileLayer, Rectangle, Popup, Marker, L } = modules;
  
  if (!location.boundingBox) {
    return null;
  }

  // boundingBox format from Nominatim: [south, north, west, east]
  const [south, north, west, east] = location.boundingBox;
  const bounds: [[number, number], [number, number]] = [[south, west], [north, east]];
  
  // Calculate center from bounding box
  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;

  try {
    return (
      <MapContainer
        center={[centerLat, centerLon]}
        zoom={getZoomLevel(location.precision)}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        className="rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Rectangle 
          bounds={bounds}
          pathOptions={{ 
            color: primaryColor, 
            fillColor: primaryColor, 
            fillOpacity: 0.2,
            weight: 2
          }}
        >
          <Popup>{title} - {getPrecisionLabel(location.precision)}</Popup>
        </Rectangle>
        <POIMarkers 
          pois={pois} 
          modules={{ Marker, Popup }} 
          L={L} 
        />
      </MapContainer>
    );
  } catch (error) {
    console.error('Error rendering map with area:', error);
    return null;
  }
}

// Static map fallback using OpenStreetMap embed
function StaticMapFallback({ location, primaryColor }: { location: LocationResult; primaryColor: string }) {
  let bbox: string;
  
  if (location.boundingBox && location.precision !== 'exact') {
    const [south, north, west, east] = location.boundingBox;
    bbox = `${west},${south},${east},${north}`;
  } else {
    bbox = `${location.lon - 0.01},${location.lat - 0.01},${location.lon + 0.01},${location.lat + 0.01}`;
  }
  
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${location.lat},${location.lon}`;
  
  return (
    <iframe
      src={mapUrl}
      style={{ width: '100%', height: '100%', border: 0 }}
      loading="lazy"
      title="Localização do imóvel"
    />
  );
}

// Placeholder when no map available
function MapPlaceholder({ primaryColor }: { primaryColor: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
      <div className="text-center">
        <MapPin className="w-12 h-12 mx-auto mb-2" />
        <p className="text-sm">Mapa não disponível</p>
      </div>
    </div>
  );
}

// POI Legend component
function POILegend({ pois, primaryColor }: { pois: import('./map-utils').POI[]; primaryColor: string }) {
  const uniqueTypes = useMemo(() => {
    const types = new Set(pois.map(p => p.type));
    return Array.from(types);
  }, [pois]);

  if (uniqueTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 px-6 py-3 border-t border-gray-100">
      {uniqueTypes.map(type => {
        const config = POI_CONFIG[type];
        return (
          <div key={type} className="flex items-center gap-1.5 text-sm text-gray-600">
            <span 
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{ backgroundColor: config.color }}
            >
              {config.emoji}
            </span>
            <span>{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function PropertyLocation({
  latitude,
  longitude,
  endereco,
  numero,
  complemento,
  bairro,
  cidade,
  uf,
  cep,
  title,
  primaryColor = '#F97316',
  cardColor = '#FFFFFF',
  textColor,
}: PropertyLocationProps) {
  const [leafletModules, setLeafletModules] = useState<LeafletModules | null>(null);
  const [leafletError, setLeafletError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [geocodeAttempted, setGeocodeAttempted] = useState(false);

  // Build full address string for display
  const fullAddress = useMemo(() => {
    const addressParts = [
      endereco,
      bairro,
      cidade,
      uf,
      cep,
    ].filter(Boolean);
    return addressParts.join(', ');
  }, [endereco, bairro, cidade, uf, cep]);

  const hasExistingCoordinates = latitude !== null && longitude !== null && latitude !== undefined && longitude !== undefined;

  // POIs disabled
  const pois: import('./map-utils').POI[] = [];

  // Geocode address with structured search and precision-based fallback
  useEffect(() => {
    let isMounted = true;
    
    const loadCoordinates = async () => {
      try {
        // Priority 1: Use existing coordinates (street precision to hide exact location)
        if (hasExistingCoordinates) {
          if (isMounted) {
            setLocation({ 
              lat: latitude!, 
              lon: longitude!, 
              precision: 'street'
            });
            setGeocodeAttempted(true);
          }
          return;
        }

        // Priority 2: Street geocoding (without number to protect exact location)
        if (endereco && cidade) {
          let result = await geocodeStructured(endereco, null, cidade, uf || '', 'street');
          
          if (!result) {
            const searchAddress = [endereco, bairro, cidade, uf, 'Brasil'].filter(Boolean).join(', ');
            result = await geocodeSimple(searchAddress, 'street');
          }
          
          if (result && isMounted) {
            setLocation(result);
            setGeocodeAttempted(true);
            return;
          }
        }

        // Priority 4: Only neighborhood → neighborhood area
        if (bairro && cidade) {
          const searchAddress = `${bairro}, ${cidade}, ${uf || ''}, Brasil`;
          const result = await geocodeSimple(searchAddress, 'neighborhood');
          if (result && isMounted) {
            setLocation(result);
            setGeocodeAttempted(true);
            return;
          }
        }

        // Priority 5: Only city → city area
        if (cidade && uf) {
          const result = await geocodeSimple(`${cidade}, ${uf}, Brasil`, 'city');
          if (result && isMounted) {
            setLocation(result);
          }
        }
      } catch (error) {
        console.error('Error geocoding:', error);
      }
      
      if (isMounted) {
        setGeocodeAttempted(true);
        setIsLoading(false);
      }
    };

    loadCoordinates();
    
    return () => {
      isMounted = false;
    };
  }, [latitude, longitude, endereco, numero, bairro, cidade, uf, hasExistingCoordinates]);

  // Load Leaflet modules once
  useEffect(() => {
    let isMounted = true;

    const loadLeaflet = async () => {
      try {
        // Inject Leaflet CSS
        const existingLink = document.querySelector('link[href*="leaflet"]');
        if (!existingLink) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        const L = await import('leaflet');
        const reactLeaflet = await import('react-leaflet');

        // Fix default marker icon
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        if (isMounted) {
          setLeafletModules({
            MapContainer: reactLeaflet.MapContainer,
            TileLayer: reactLeaflet.TileLayer,
            Marker: reactLeaflet.Marker,
            Popup: reactLeaflet.Popup,
            Rectangle: reactLeaflet.Rectangle,
            L: L.default || L,
          });
        }
      } catch (error) {
        console.error('Error loading Leaflet:', error);
        if (isMounted) {
          setLeafletError(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadLeaflet();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Don't render section if no address at all
  if (!fullAddress && !location && geocodeAttempted) {
    return null;
  }

  const canShowLeafletMap = location && leafletModules && !leafletError;
  const canShowFallbackMap = location && (leafletError || !leafletModules);
  const showExactMarker = location?.precision === 'exact';

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: textColor }}>
        <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
        Localização
      </h2>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardColor, borderColor: textColor ? `${textColor}15` : undefined, borderWidth: 1 }}>
        {/* Precision indicator */}
        {location && location.precision !== 'exact' && (
          <div 
            className="px-4 py-2 text-sm flex items-center gap-2"
            style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
          >
            <MapPin className="w-4 h-4" />
            {getPrecisionLabel(location.precision)}
          </div>
        )}

        {/* Map */}
        <div className="h-[300px] md:h-[400px] w-full bg-gray-100 relative z-0">
          {isLoading && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: primaryColor }} />
            </div>
          )}
          
          {!isLoading && canShowLeafletMap && showExactMarker && (
            <MapErrorBoundary fallback={<StaticMapFallback location={location} primaryColor={primaryColor} />}>
              <LeafletMapWithMarker 
                location={location} 
                title={title} 
                modules={leafletModules}
                pois={pois}
              />
            </MapErrorBoundary>
          )}

          {!isLoading && canShowLeafletMap && !showExactMarker && location.boundingBox && (
            <MapErrorBoundary fallback={<StaticMapFallback location={location} primaryColor={primaryColor} />}>
              <LeafletMapWithArea 
                location={location} 
                title={title}
                primaryColor={primaryColor}
                modules={leafletModules}
                pois={pois}
              />
            </MapErrorBoundary>
          )}

          {/* Fallback: exact without boundingBox shows marker */}
          {!isLoading && canShowLeafletMap && !showExactMarker && !location.boundingBox && (
            <MapErrorBoundary fallback={<StaticMapFallback location={location} primaryColor={primaryColor} />}>
              <LeafletMapWithMarker 
                location={location} 
                title={title} 
                modules={leafletModules}
                pois={pois}
              />
            </MapErrorBoundary>
          )}
          
          {!isLoading && canShowFallbackMap && (
            <StaticMapFallback location={location} primaryColor={primaryColor} />
          )}
          
          {!isLoading && !location && geocodeAttempted && (
            <MapPlaceholder primaryColor={primaryColor} />
          )}
        </div>

        {/* POI Legend removed */}

        {/* Address */}
        {fullAddress && (
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-sm mb-1" style={{ color: textColor, opacity: 0.5 }}>Endereço</p>
                <p className="font-medium" style={{ color: textColor }}>{fullAddress}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
