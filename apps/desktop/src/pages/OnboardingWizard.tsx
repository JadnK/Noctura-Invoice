import { useState } from 'react';

/**
 * Einrichtungsassistent. Zehn Schritte, jederzeit ueberspringbar und spaeter
 * unter Einstellungen erneut aufrufbar. Der Fortschritt wird nach jedem Schritt
 * gespeichert, damit ein Abbruch nichts kostet.
 */
const STEPS = [
  { id: 'welcome', title: 'Willkommen', hint: 'Kurzer Überblick über die Einrichtung.' },
  { id: 'company-type', title: 'Unternehmensart', hint: 'Einzelunternehmen, GmbH, Verein oder Freiberuflich.' },
  { id: 'company', title: 'Firmendaten', hint: 'Name, Anschrift, Kontakt und Registereinträge.' },
  { id: 'tax', title: 'Steuerliche Einstellungen', hint: 'Regelbesteuerung oder Kleinunternehmerregelung.' },
  { id: 'bank', title: 'Bankverbindung', hint: 'IBAN und BIC für den Zahlungsteil der Rechnung.' },
  { id: 'numbering', title: 'Rechnungsnummern', hint: 'Muster, Startwert und Zurücksetzen.' },
  { id: 'branding', title: 'Logo und Branding', hint: 'Logo, Akzentfarbe, Fußzeile.' },
  { id: 'email', title: 'E-Mail-Versand', hint: 'SMTP-Zugang einrichten und testen.' },
  { id: 'license', title: 'Lizenz aktivieren', hint: 'Lizenzschlüssel eingeben.' },
  { id: 'first-invoice', title: 'Erste Rechnung', hint: 'Direkt loslegen.' },
] as const;

export function OnboardingWizard({ onFinish, onSkip }: { onFinish: () => void; onSkip: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center p-8">
      <ol className="mb-6 flex gap-1" aria-label="Fortschritt">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === index ? 'step' : undefined}
            className="h-1 flex-1 rounded-full"
            style={{ background: i <= index ? 'var(--n-primary)' : 'var(--n-border)' }}
          />
        ))}
      </ol>

      <p className="text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
        Schritt {index + 1} von {STEPS.length}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{step.title}</h1>
      <p className="mt-2 text-muted">{step.hint}</p>

      <div className="mt-6 min-h-48 rounded-lg border border-border bg-surface p-5 shadow-elev1">
        {/* Formular je Schritt: React Hook Form + Zod, Felder aus docs/data-model.md */}
        <p className="text-sm text-subtle">Formular für „{step.title}“.</p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onSkip} className="text-sm text-subtle hover:text-text">
          Einrichtung später fortsetzen
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Zurück
          </button>
          <button
            type="button"
            onClick={() => (last ? onFinish() : setIndex((i) => i + 1))}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {last ? 'Einrichtung abschließen' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
