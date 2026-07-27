import { useEffect, useState } from 'react';
import { BusinessSettingsForm } from '../components/BusinessSettingsForm';
import { ApiError, api } from '../lib/api';
import type { BusinessSettings } from '../lib/api';
import { Loading, PageError, buttonPrimary, buttonSecondary, toApiError } from './pageUtils';

const STEPS = [
  { id: 'company', title: 'Unternehmen', sections: ['company'] as const },
  { id: 'tax', title: 'Steuer', sections: ['tax'] as const },
  { id: 'bank', title: 'Bank', sections: ['bank'] as const },
  { id: 'numbering', title: 'Nummernkreise', sections: ['numbering'] as const },
];

export function OnboardingWizard({ onFinish, onSkip }: { onFinish: () => void; onSkip?: () => void }) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.businessSettings().then(setSettings).catch((err) => setError(toApiError(err)));
  }, []);

  function validateCurrent(): string | null {
    if (!settings) return 'Einstellungen nicht geladen.';
    if (step === 0 && !settings.legalName.trim()) return 'Bitte geben Sie den Unternehmensnamen ein.';
    if (step === 1 && settings.taxScheme === 'standard' && !settings.taxNumber.trim() && !settings.vatId.trim()) {
      return 'Bitte tragen Sie eine Steuernummer oder USt-IdNr. ein.';
    }
    if (step === 2 && settings.iban && settings.iban.length < 15) return 'Die IBAN ist zu kurz.';
    if (step === 3 && [settings.invoicePattern, settings.quotePattern, settings.creditNotePattern].some((pattern) => !pattern.includes('{COUNTER}'))) {
      return 'Jeder Nummernkreis muss den Platzhalter {COUNTER} enthalten.';
    }
    return null;
  }

  async function next() {
    const problem = validateCurrent();
    if (problem) {
      setError(new ApiError('E_MISSING_FIELDS', problem));
      return;
    }
    setError(null);
    if (step < STEPS.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    if (!settings) return;
    setBusy(true);
    try {
      await api.completeOnboarding(settings);
      onFinish();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !settings) return <div className="p-8"><PageError error={error} /></div>;
  if (!settings) return <div className="p-8"><Loading /></div>;
  const current = STEPS[step];

  return <div className="flex min-h-full items-center justify-center bg-canvas p-6">
    <div className="w-full max-w-4xl rounded-xl border border-border bg-surface shadow-elev2">
      <header className="border-b border-border px-6 py-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs uppercase text-primary">Ersteinrichtung</p><h1 className="mt-1 text-xl font-semibold">Noctura produktiv einrichten</h1></div>{onSkip && <button type="button" onClick={onSkip} className="text-sm text-subtle hover:text-text">Später fortsetzen</button>}</div><ol className="mt-5 grid grid-cols-4 gap-2">{STEPS.map((entry, index) => <li key={entry.id} className={`rounded px-2 py-1.5 text-center text-xs ${index === step ? 'bg-primary-soft font-medium' : index < step ? 'text-primary' : 'text-subtle'}`}>{index + 1}. {entry.title}</li>)}</ol></header>
      <main className="max-h-[65vh] overflow-y-auto p-6"><BusinessSettingsForm value={settings} onChange={setSettings} sections={[...current.sections]} />{error && <div className="mt-4"><PageError error={error} /></div>}</main>
      <footer className="flex items-center justify-between border-t border-border px-6 py-4"><button type="button" disabled={step === 0 || busy} onClick={() => { setError(null); setStep((value) => value - 1); }} className={buttonSecondary}>Zurück</button><button type="button" disabled={busy} onClick={() => void next()} className={buttonPrimary}>{step === STEPS.length - 1 ? 'Einrichtung abschließen' : 'Weiter'}</button></footer>
    </div>
  </div>;
}
