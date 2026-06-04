import React from 'react';
import { cn } from '@/lib/utils';
import { getPositionClasses, WatermarkPosition } from '@/lib/watermark-utils';

interface WatermarkedImageProps {
  src: string;
  alt: string;
  watermarkUrl?: string | null;
  watermarkEnabled?: boolean;
  watermarkOpacity?: number;
  watermarkSize?: number;
  watermarkPosition?: WatermarkPosition;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
}

/**
 * Image component with optional watermark overlay
 * The watermark is applied via CSS, positioned based on settings
 */
export function WatermarkedImage({
  src,
  alt,
  watermarkUrl,
  watermarkEnabled = false,
  watermarkOpacity = 20,
  watermarkSize = 80,
  watermarkPosition = 'bottom-right',
  className,
  imgClassName,
  onClick,
}: WatermarkedImageProps) {
  const showWatermark = watermarkEnabled && watermarkUrl;
  const positionClasses = getPositionClasses(watermarkPosition);
  
  // Calculate size based on setting (40-200px range mapped to 40-150px actual)
  const sizeStyle = {
    maxHeight: `${Math.max(24, Math.min(watermarkSize * 0.6, 100))}px`,
    maxWidth: `${Math.max(40, Math.min(watermarkSize * 1.5, 200))}px`,
  };

  return (
    <div className={cn('relative overflow-hidden', className)} onClick={onClick}>
      <img
        src={src}
        alt={alt}
        width={800}
        height={600}
        loading="lazy"
        decoding="async"
        className={cn('w-full h-full object-cover', imgClassName)}
      />
      
      {showWatermark && (
        <div 
          className={cn('absolute pointer-events-none select-none', positionClasses)}
          style={{ opacity: watermarkOpacity / 100 }}
        >
          <img 
            src={watermarkUrl} 
            alt=""
            className="object-contain drop-shadow-lg"
            style={sizeStyle}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
