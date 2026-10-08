/**
 * QR-Scanner für Abholcodes: Kamera per getUserMedia (Rückkamera bevorzugt, iPhone: playsinline),
 * Erkennung mit jsQR (läuft in jedem Browser), ergänzend die native BarcodeDetector-API, falls vorhanden.
 * Taschenlampe, sofern das Gerät sie anbietet. Ohne Kamera oder ohne Freigabe: freundlicher Hinweis
 * und Code-Eingabe direkt im Dialog.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CameraOff, CheckCircle2, Flashlight, FlashlightOff, Keyboard, RefreshCw, SwitchCamera } from 'lucide-react';
import { Button, Input, Modal, Notice } from '@/components/ui';
import { cn } from '@/lib/cn';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
type JsQr = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }) => { data: string } | null;

type Phase = 'starting' | 'scanning' | 'found' | 'error';

/** größte Kantenlänge des Analysebilds – klein genug für flüssige Erkennung auch auf älteren Geräten */
const ANALYZE_MAX = 720;

function cameraError(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Der Zugriff auf die Kamera wurde nicht erlaubt. Sie können ihn in den Browser-Einstellungen freigeben – oder den Abholcode einfach unten eingeben.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'An diesem Gerät wurde keine Kamera gefunden. Bitte geben Sie den Abholcode unten ein.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Die Kamera wird gerade von einer anderen Anwendung verwendet. Schließen Sie diese oder geben Sie den Abholcode unten ein.';
  return 'Die Kamera konnte nicht gestartet werden. Bitte geben Sie den Abholcode unten ein.';
}

export function QrScannerModal({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null); // null = nicht verfügbar
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameras, setCameras] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState('');
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    if (!open) return;
    setPhase('starting');
    setError(null);
    setTorch(null);
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    let frame = 0;

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? 'Dieser Browser bietet keinen Kamerazugriff. Bitte geben Sie den Abholcode unten ein.'
            : 'Die Kamera ist nur über eine sichere Verbindung (HTTPS) verfügbar. Bitte geben Sie den Abholcode unten ein.',
        );
        setPhase('error');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (!stopped) {
          setError(cameraError(err));
          setPhase('error');
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => !stopped && setCameras(list.filter((d) => d.kind === 'videoinput').length))
        .catch(() => {});

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // iOS Safari: nicht im Vollbild-Player öffnen
      try {
        await video.play();
      } catch {
        // Autoplay verweigert (sehr selten bei stummem Video) – der Nutzer kann neu starten
      }
      if (stopped) return;
      setPhase('scanning');

      // Erkennung: jsQR (immer), BarcodeDetector als Ergänzung, wenn vorhanden
      let jsQR: JsQr | null = null;
      import('jsqr')
        .then((m) => {
          jsQR = ((m as unknown as { default?: JsQr }).default ?? (m as unknown as JsQr)) as JsQr;
        })
        .catch(() => {});
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      let detector: BarcodeDetectorLike | null = null;
      try {
        detector = Ctor ? new Ctor({ formats: ['qr_code'] }) : null;
      } catch {
        detector = null;
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const found = (value: string) => {
        if (stopped) return;
        setPhase('found');
        navigator.vibrate?.(60);
        stop();
        // kurz den Treffer zeigen, dann weiter
        window.setTimeout(() => resultRef.current(value), 250);
      };

      const tick = async () => {
        if (stopped) return;
        frame += 1;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h && ctx) {
          const scale = Math.min(1, ANALYZE_MAX / Math.max(w, h));
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (jsQR) {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: frame % 4 === 0 ? 'attemptBoth' : 'dontInvert' });
            if (hit?.data) return found(hit.data);
          }
          if (detector && (!jsQR || frame % 3 === 0)) {
            try {
              const codes = await detector.detect(canvas);
              const value = codes.find((c) => c.rawValue)?.rawValue;
              if (value) return found(value);
            } catch {
              // einzelne Erkennungsfehler ignorieren
            }
          }
        }
        timer = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    })();

    return stop;
  }, [open, facing, attempt]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (manual.trim()) onResult(manual.trim());
  };

  useEffect(() => {
    if (open) setManual('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="QR-Code scannen"
      description={phase === 'error' ? undefined : 'Halten Sie den QR-Code aus der App bzw. Bestätigung des Kunden in den Rahmen.'}
      size="md"
    >
      {phase === 'error' && error ? (
        <Notice tone="warning" icon={CameraOff} title="Kamera nicht verfügbar">
          {error}
        </Notice>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} className={cn('h-full w-full object-cover', facing === 'user' && '-scale-x-100')} playsInline muted autoPlay aria-label="Kamerabild" />
          {/* Rahmen mit Ecken */}
          <div className="pointer-events-none absolute inset-[14%] rounded-2xl shadow-[0_0_0_999px_rgba(15,23,42,0.5)]" aria-hidden>
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map((c) => (
              <span key={c} className={cn('absolute h-10 w-10', phase === 'found' ? 'border-emerald-400' : 'border-white', c)} />
            ))}
            {phase === 'scanning' ? <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-accent-400/90 shadow-[0_0_12px_rgba(242,169,0,0.9)]" /> : null}
          </div>
          {phase === 'starting' ? <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white/85">Kamera wird gestartet …</p> : null}
          {phase === 'found' ? (
            <p className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-300">
              <CheckCircle2 size={18} aria-hidden /> Code erkannt
            </p>
          ) : null}
          <div className="absolute right-3 top-3 flex gap-2">
            {torch !== null ? (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-pressed={torch}
                aria-label={torch ? 'Taschenlampe ausschalten' : 'Taschenlampe einschalten'}
                className={cn('flex h-11 w-11 items-center justify-center rounded-full backdrop-blur', torch ? 'bg-accent-400 text-brand-950' : 'bg-white/20 text-white hover:bg-white/30')}
              >
                {torch ? <Flashlight size={20} aria-hidden /> : <FlashlightOff size={20} aria-hidden />}
              </button>
            ) : null}
            {cameras > 1 ? (
              <button
                type="button"
                onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                aria-label="Kamera wechseln"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/30"
              >
                <SwitchCamera size={20} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      )}

      <form onSubmit={submitManual} className="mt-4 border-t border-slate-100 pt-4" noValidate>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Keyboard size={15} aria-hidden className="text-slate-400" /> Oder Abholcode eingeben
        </p>
        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="z. B. K7Q2X9"
            aria-label="Abholcode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={80}
            containerClassName="flex-1"
            className="font-mono font-bold uppercase tracking-[0.12em] placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
            autoFocus={phase === 'error'}
          />
          <Button type="submit" disabled={!manual.trim()}>
            Prüfen
          </Button>
        </div>
        {phase === 'error' ? (
          <Button type="button" variant="ghost" size="sm" icon={RefreshCw} className="mt-2" onClick={() => setAttempt((a) => a + 1)}>
            Kamera erneut versuchen
          </Button>
        ) : null}
      </form>
    </Modal>
  );
}
