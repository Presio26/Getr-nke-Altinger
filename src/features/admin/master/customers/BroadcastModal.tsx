import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Building2, Megaphone, Send, User, Users } from 'lucide-react';
import { api } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { Button, Input, Modal, RadioCards, Select, Textarea } from '@/components/ui';

type Audience = 'all' | 'b2c' | 'b2b';

const LINKS = [
  { value: '', label: 'Kein Link' },
  { value: '/angebote', label: 'Angebote' },
  { value: '/sortiment', label: 'Sortiment' },
  { value: '/fest', label: 'Festservice & Verleih' },
  { value: '/markt', label: 'Markt-Info & Öffnungszeiten' },
  { value: '/business/schnellbestellung', label: 'Schnellbestellung (Geschäftskunden)' },
  { value: 'custom', label: 'Eigener Pfad …' },
];

const TEMPLATES: { label: string; title: string; body: string; audience: Audience; link: string }[] = [
  {
    label: 'Wochenangebote',
    title: 'Neue Angebote der Woche',
    body: 'Frisch eingetroffen: Unsere neuen Wochenangebote – jetzt online bestellen und bequem liefern lassen oder im Markt abholen.',
    audience: 'all',
    link: '/angebote',
  },
  {
    label: 'Festsaison',
    title: 'Ihr Fest – wir liefern alles',
    body: 'Bierzeltgarnituren, Zapfanlage und Fassbier: Reservieren Sie Ihren Festbedarf jetzt rechtzeitig online.',
    audience: 'all',
    link: '/fest',
  },
  {
    label: 'Gastro-Info',
    title: 'Information für unsere Geschäftskunden',
    body: 'Planen Sie Ihre Bestellungen für die kommende Woche schon jetzt – mit der Schnellbestellung geht es in einer Minute.',
    audience: 'b2b',
    link: '/business/schnellbestellung',
  },
];

/** Benachrichtigung an Kunden senden (api.adminBroadcast) */
export function BroadcastModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [linkChoice, setLinkChoice] = useState('');
  const [customLink, setCustomLink] = useState('/');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
  }, [open]);

  const link = linkChoice === 'custom' ? customLink.trim() : linkChoice;
  const errors = {
    title: !title.trim() ? 'Bitte geben Sie einen Titel an.' : undefined,
    body: !body.trim() ? 'Bitte geben Sie einen Text an.' : undefined,
    link: linkChoice === 'custom' && !/^\/[\w\-/äöüß]*$/i.test(link) ? 'Der Link muss ein App-Pfad sein, z. B. /angebote.' : undefined,
  };
  const valid = !errors.title && !errors.body && !errors.link;

  const send = useApiMutation(
    (input: { title: string; body: string; audience: Audience; link?: string }) => api.adminBroadcast(input),
    {
      success: (n) => (n === 1 ? 'Nachricht an 1 Kundenkonto gesendet' : `Nachricht an ${n} Kundenkonten gesendet`),
      onSuccess: () => {
        setTitle('');
        setBody('');
        setLinkChoice('');
        onClose();
      },
    },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!valid) return;
    send.mutate({ title: title.trim(), body: body.trim(), audience, ...(link ? { link } : {}) });
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setTitle(t.title);
    setBody(t.body);
    setAudience(t.audience);
    setLinkChoice(t.link);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Nachricht an Kunden"
      description="Erscheint sofort als Benachrichtigung in der App Ihrer Kunden (Glocke und Hinweis)."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" form="broadcast-form" icon={Send} loading={send.isPending}>
            Jetzt senden
          </Button>
        </>
      }
    >
      <form id="broadcast-form" onSubmit={submit} noValidate className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Vorlagen</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => applyTemplate(t)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
              >
                <Megaphone size={15} aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Zielgruppe</p>
          <RadioCards
            aria-label="Zielgruppe"
            columns={3}
            value={audience}
            onChange={(v) => setAudience(v as Audience)}
            options={[
              { value: 'all', title: 'Alle', description: 'Privat & Geschäft', icon: Users },
              { value: 'b2c', title: 'Privat', description: 'Privatkunden', icon: User },
              { value: 'b2b', title: 'Geschäft', description: 'Geschäftskunden', icon: Building2 },
            ]}
          />
        </div>

        <Input label="Titel" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={showErrors ? errors.title : undefined} placeholder="z. B. Neue Angebote der Woche" />
        <Textarea
          label="Text"
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          error={showErrors ? errors.body : undefined}
          hint={`${body.length} / 1000 Zeichen`}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Link in der App (optional)" value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)} options={LINKS} />
          {linkChoice === 'custom' ? (
            <Input label="Eigener Pfad" value={customLink} onChange={(e) => setCustomLink(e.target.value)} error={showErrors ? errors.link : undefined} placeholder="/produkt/augustiner-hell" />
          ) : null}
        </div>

        {title.trim() || body.trim() ? (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Vorschau</p>
            <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                <Bell size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{title.trim() || 'Titel'}</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{body.trim() || 'Text'}</p>
                {link ? <p className="mt-1.5 text-sm font-semibold text-brand-700">Öffnen → {link}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
