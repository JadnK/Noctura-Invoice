import type { TemplateSummary } from '../lib/api';

function formattedDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(parsed);
}

export function DocumentTemplatePicker({
  templates,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  templates: TemplateSummary[];
  value?: string;
  onChange: (templateId: string | undefined) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const defaultTemplate = templates.find((template) => template.isDefault);
  const effectiveValue = value || defaultTemplate?.id || '';

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-canvas p-4 text-sm text-muted">
        Es ist noch keine Rechnungsvorlage vorhanden. Legen Sie zuerst unter „Vorlagen“ ein Design an.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className={compact ? 'text-sm font-semibold' : 'font-semibold'}>Dokumentvorlage</h2>
          <p className="mt-0.5 text-xs text-muted">Diese Auswahl wird mit dem Beleg gespeichert und beim PDF-Export verwendet.</p>
        </div>
        {defaultTemplate && <span className="text-xs text-subtle">Standard: {defaultTemplate.name}</span>}
      </div>
      <div className={compact ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'}>
        {templates.map((template) => {
          const selected = effectiveValue === template.id;
          return (
            <label
              key={template.id}
              className={[
                'relative flex cursor-pointer gap-3 rounded-lg border p-3 transition',
                selected ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-canvas',
                disabled ? 'cursor-not-allowed opacity-70' : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name="document-template"
                value={template.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(template.id)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {template.name}
                  {template.isDefault && <span className="rounded bg-input px-1.5 py-0.5 text-[10px] font-semibold uppercase text-subtle">Standard</span>}
                </span>
                <span className="mt-1 block text-xs text-subtle">Version {template.version} · geändert {formattedDate(template.updatedAt)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
