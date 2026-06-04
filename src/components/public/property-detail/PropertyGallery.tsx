import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X, Images, Play } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { getPositionClasses, WatermarkPosition } from '@/lib/watermark-utils';

interface PropertyGalleryProps {
  images: string[];
  title: string;
  primaryColor?: string;
  videoUrl?: string | null;
  watermarkEnabled?: boolean;
  watermarkOpacity?: number;
  watermarkUrl?: string | null;
  watermarkSize?: number;
  watermarkPosition?: WatermarkPosition;
}

export default function PropertyGallery({
  images,
  title,
  primaryColor = '#F97316',
  videoUrl,
  watermarkEnabled = false,
  watermarkOpacity = 20,
  watermarkUrl,
  watermarkSize = 80,
  watermarkPosition = 'bottom-right',
}: PropertyGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    dragFree: false,
    containScroll: 'trimSnaps',
    slidesToScroll: 1,
    duration: 25,
  });

  const [lightboxEmblaRef, lightboxEmblaApi] = useEmblaCarousel({
    loop: true,
    startIndex: currentIndex,
    duration: 20,
  });

  const allMedia = images.filter(Boolean);
  const hasMultiple = allMedia.length > 1;

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi]);

  useEffect(() => {
    if (!lightboxEmblaApi) return;

    const onSelect = () => setCurrentIndex(lightboxEmblaApi.selectedScrollSnap());
    lightboxEmblaApi.on('select', onSelect);
    onSelect();
  }, [lightboxEmblaApi]);

  useEffect(() => {
    if (lightboxOpen && lightboxEmblaApi) {
      lightboxEmblaApi.scrollTo(currentIndex, true);
    }
  }, [lightboxOpen, lightboxEmblaApi, currentIndex]);

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const lightboxScrollPrev = useCallback(() => {
    lightboxEmblaApi?.scrollPrev();
  }, [lightboxEmblaApi]);

  const lightboxScrollNext = useCallback(() => {
    lightboxEmblaApi?.scrollNext();
  }, [lightboxEmblaApi]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') lightboxScrollPrev();
      if (e.key === 'ArrowRight') lightboxScrollNext();
      if (e.key === 'Escape') setLightboxOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxScrollPrev, lightboxScrollNext]);

  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    return match ? match[1] : null;
  };

  const youtubeId = videoUrl ? getYouTubeId(videoUrl) : null;

  void primaryColor;

  if (allMedia.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center bg-gray-200 md:h-[400px]">
        <Images className="h-16 w-16 text-gray-400" />
      </div>
    );
  }

  return (
    <>
      <div className="relative w-full">
        <div className="relative h-[300px] overflow-hidden md:h-[450px] lg:h-[550px]">
          {showVideo && youtubeId ? (
            <div className="flex h-full w-full items-center justify-center bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                title="Video do imóvel"
                className="h-full w-full max-w-4xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <button
                onClick={() => setShowVideo(false)}
                className="absolute right-4 top-4 z-10 rounded-full bg-black/70 p-2 text-white shadow-lg transition-all hover:bg-black/90"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <div className="h-full overflow-hidden cursor-grab active:cursor-grabbing" ref={emblaRef}>
                <div className="flex h-full">
                  {allMedia.map((img, index) => (
                    <div
                      key={index}
                      className="h-full min-w-0 flex-[0_0_50%] px-1 md:flex-[0_0_25%]"
                    >
                      <button
                        onClick={() => {
                          setCurrentIndex(index);
                          setLightboxOpen(true);
                        }}
                        className="group relative h-full w-full cursor-zoom-in overflow-hidden"
                      >
                        <img
                          src={img}
                          alt={`${title} - Foto ${index + 1}`}
                          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />

                        {watermarkEnabled && watermarkUrl && (
                          <div
                            className={`absolute pointer-events-none select-none ${getPositionClasses(watermarkPosition)}`}
                            style={{ opacity: watermarkOpacity / 100 }}
                          >
                            <img
                              src={watermarkUrl}
                              alt=""
                              style={{
                                maxHeight: `${Math.max(20, watermarkSize * 0.3)}px`,
                                maxWidth: `${Math.max(40, watermarkSize * 0.8)}px`,
                              }}
                              className="object-contain drop-shadow-lg"
                              draggable={false}
                            />
                          </div>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {hasMultiple && (
                <>
                  <button
                    onClick={scrollPrev}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-3 shadow-lg transition-all duration-200 hover:scale-105 hover:bg-white active:scale-95 md:left-4 md:p-4"
                    aria-label="Fotos anteriores"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-800 md:h-6 md:w-6" />
                  </button>
                  <button
                    onClick={scrollNext}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-3 shadow-lg transition-all duration-200 hover:scale-105 hover:bg-white active:scale-95 md:right-4 md:p-4"
                    aria-label="Próximas fotos"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-800 md:h-6 md:w-6" />
                  </button>
                </>
              )}

              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                <Images className="h-4 w-4" />
                {currentIndex + 1} / {allMedia.length}
              </div>

              <button
                onClick={() => setLightboxOpen(true)}
                className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium shadow-lg transition-all duration-200 hover:scale-105 hover:bg-white"
              >
                <Images className="h-4 w-4" />
                Ver todas
              </button>

              {youtubeId && (
                <button
                  onClick={() => setShowVideo(true)}
                  className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:bg-red-700"
                >
                  <Play className="h-4 w-4" />
                  Ver Vídeo
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="!left-0 !top-0 !translate-x-0 !translate-y-0 h-[100dvh] w-screen max-h-none max-w-none overflow-hidden rounded-none border-0 bg-black/95 p-0 [&>button]:hidden sm:!left-1/2 sm:!top-1/2 sm:!h-[95vh] sm:!w-[95vw] sm:!max-h-[95vh] sm:!max-w-[95vw] sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-2xl">
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-black/95">
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative flex-1 overflow-hidden px-3 pb-24 pt-14 sm:px-6 sm:pb-32 sm:pt-6">
              <div className="h-full overflow-hidden" ref={lightboxEmblaRef}>
                <div className="flex h-full items-center">
                  {allMedia.map((img, index) => (
                    <div key={index} className="relative flex h-full min-w-0 flex-[0_0_100%] items-center justify-center">
                      <img
                        src={img}
                        alt={`${title} - Foto ${index + 1}`}
                        className="max-h-full max-w-full object-contain"
                      />

                      {watermarkEnabled && watermarkUrl && (
                        <div
                          className={`absolute pointer-events-none select-none ${getPositionClasses(watermarkPosition)}`}
                          style={{ opacity: watermarkOpacity / 100 }}
                        >
                          <img
                            src={watermarkUrl}
                            alt=""
                            style={{
                              maxHeight: `${Math.max(30, watermarkSize * 0.5)}px`,
                              maxWidth: `${Math.max(60, watermarkSize * 1.2)}px`,
                            }}
                            className="object-contain drop-shadow-lg"
                            draggable={false}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {hasMultiple && (
                <>
                  <button
                    onClick={lightboxScrollPrev}
                    className="absolute left-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60 sm:left-4 sm:p-3"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                  <button
                    onClick={lightboxScrollNext}
                    className="absolute right-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60 sm:right-4 sm:p-3"
                    aria-label="Próxima imagem"
                  >
                    <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                </>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col gap-3 bg-gradient-to-t from-black via-black/92 to-transparent px-3 pb-4 pt-10 sm:px-4 sm:pb-5">
              <div className="flex justify-center">
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm sm:text-sm">
                  {currentIndex + 1} / {allMedia.length}
                </div>
              </div>

              <div className="mx-auto flex max-w-full gap-2 overflow-x-auto rounded-2xl bg-white/10 p-2 backdrop-blur-sm">
                {allMedia.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentIndex(index);
                      lightboxEmblaApi?.scrollTo(index);
                    }}
                    className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl transition-all duration-200 sm:h-16 sm:w-16 ${
                      index === currentIndex ? 'opacity-100 ring-2 ring-white' : 'opacity-60'
                    }`}
                    aria-label={`Abrir foto ${index + 1}`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
