import { AlertTriangle } from 'lucide-react';

export function PublicSiteUnavailable() {
  return (
    <div className="min-h-screen bg-[#0D0D0D] px-6 text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <AlertTriangle className="h-8 w-8 text-orange-400" />
        </div>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">Site temporariamente fora do ar</h1>
        <p className="text-base leading-relaxed text-white/70">
          Este site est&aacute; indispon&iacute;vel no momento. Entre em contato com a equipe respons&aacute;vel pelo sistema para regularizar o acesso.
        </p>
      </div>
    </div>
  );
}
