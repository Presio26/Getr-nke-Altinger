import { useCallback, useState } from 'react';
import { PlusSquare, Share } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, Modal } from '@/components/ui';
import { promptInstall, useInstallState } from './installState';

/**
 * Installation als Aktion (Kontomenü, Fahrer-Kopfzeile): Chrome/Edge/Android öffnen den Browser-Dialog,
 * iPhone/iPad (Safari) bekommen die Anleitung „Teilen → Zum Home-Bildschirm“ als Dialog.
 */
export function useInstallAction() {
  const { canPrompt, iosManual, standalone } = useInstallState();
  const [helpOpen, setHelpOpen] = useState(false);
  const run = useCallback(async () => {
    if (canPrompt) {
      await promptInstall();
      return;
    }
    if (iosManual) setHelpOpen(true);
  }, [canPrompt, iosManual]);
  return {
    available: !standalone && (canPrompt || iosManual),
    run,
    helpOpen,
    closeHelp: () => setHelpOpen(false),
  };
}

export function InstallHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Altinger als App installieren"
      footer={
        <Button onClick={onClose} block>
          Verstanden
        </Button>
      }
    >
      <div className="flex items-start gap-3">
        <Logo variant="mark" className="h-12 shrink-0" />
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700">
          <li>
            In Safari unten auf <Share size={16} className="inline -translate-y-px text-brand-700" aria-label="Teilen" /> <strong>Teilen</strong> tippen.
          </li>
          <li>
            <PlusSquare size={16} className="inline -translate-y-px text-brand-700" aria-hidden /> <strong>„Zum Home-Bildschirm“</strong> wählen.
          </li>
          <li>Die App startet danach im Vollbild – ohne Browserleiste.</li>
        </ol>
      </div>
    </Modal>
  );
}
