import React, { useEffect, useState, useRef } from 'react';
import { POI, POIType, createPOIIcon, getPOILabel, POI_CONFIG } from './map-utils';

interface POIMarkersProps {
  pois: POI[];
  modules: {
    Marker: any;
    Popup: any;
  };
  L: any;
}

export default function POIMarkers({ pois, modules, L }: POIMarkersProps) {
  const { Marker, Popup } = modules;
  const iconsRef = useRef<Record<POIType, any>>({} as Record<POIType, any>);

  // Pre-create icons for each type
  useEffect(() => {
    if (!L) return;
    
    const types: POIType[] = ['supermarket', 'hospital', 'school', 'pharmacy', 'bank', 'restaurant'];
    types.forEach(type => {
      iconsRef.current[type] = createPOIIcon(L, type);
    });
  }, [L]);

  if (!pois.length || !L) return null;

  return (
    <>
      {pois.map((poi, index) => {
        const icon = iconsRef.current[poi.type];
        if (!icon) return null;

        return (
          <Marker
            key={`poi-${index}-${poi.lat}-${poi.lon}`}
            position={[poi.lat, poi.lon]}
            icon={icon}
          >
            <Popup>
              <div className="text-center">
                <span className="text-lg">{POI_CONFIG[poi.type]?.emoji}</span>
                <p className="font-medium text-sm mt-1">
                  {poi.name || getPOILabel(poi.type)}
                </p>
                {poi.name && (
                  <p className="text-xs text-gray-500">{getPOILabel(poi.type)}</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
