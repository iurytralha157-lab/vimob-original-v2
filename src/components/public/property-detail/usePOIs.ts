import { useState, useEffect } from 'react';
import { POI, fetchNearbyPOIs } from './map-utils';

interface UsePOIsOptions {
  lat: number | null;
  lon: number | null;
  enabled?: boolean;
  radius?: number;
}

export function usePOIs({ lat, lon, enabled = true, radius = 1000 }: UsePOIsOptions) {
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || lat === null || lon === null) {
      setPois([]);
      return;
    }

    let isMounted = true;

    const loadPOIs = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchNearbyPOIs(lat, lon, radius);
        if (isMounted) {
          setPois(result);
        }
      } catch (err) {
        console.error('Error loading POIs:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to load POIs'));
          setPois([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPOIs();

    return () => {
      isMounted = false;
    };
  }, [lat, lon, enabled, radius]);

  return { pois, isLoading, error };
}
