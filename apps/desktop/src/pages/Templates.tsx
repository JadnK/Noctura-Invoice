import { useEffect, useState } from 'react';
import { DEFAULT_LAYOUT } from '@noctura/doc-render';
import type { TemplateLayout } from '@noctura/doc-render';
import { api } from '../lib/api';
import type { TemplateSummary } from '../lib/api';
import { ApiError } from '../lib/api';
import { ErrorNotice } from '../components/ErrorNotice';
import { TemplateEditor } from './TemplateEditor';

/**
 * Vorlagenliste. Der eigentliche visuelle Editor (TemplateEditor.tsx) stand
 * bereits, war aber nie an echte Speicherung angeschlossen - "Vorlage
 * speichern" rief bislang schlicht nichts auf.
 */
export function Templates() {
  const [rows, setRows] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  async function load() {
    setError(null);
    try {
      setRows(await api.templates());
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    }
  }

  useEffect(() => { void load(); }, []);

  if (editing) {
    return (
      <TemplateEditorPage
        templateId={editing.id}
        onDone={() => { setEditing(null); void load(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Vorlagen</h1>
        <button type="button" onClick={() => setEditing({ id: null })}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
          Neue Vorlage
        </button>
      </div>

      {error && <ErrorNotice error={error} onRetry={() => void load()} />}
      {!error && rows === null && <p className="text-sm text-subtle">Wird geladen…</p>}

      {!error && rows !== null && rows.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-elev1">
          <p className="font-medium">Noch keine eigene Vorlage</p>
          <p className="mt-1 text-sm text-muted">
            Ohne eigene Vorlage nutzen Belege die eingebaute Standardvorlage.
          </p>
        </div>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="border-b border-border py-2">Name</th>
              <th scope="col" className="border-b border-border py-2">Version</th>
              <th scope="col" className="border-b border-border py-2">Zuletzt geändert</th>
              <th scope="col" className="border-b border-border py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-surface">
                <td className="cursor-pointer border-b border-divider py-2" onClick={() => setEditing({ id: row.id })}>
                  {row.name}
                  {row.isDefault && <span className="ml-2 rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--n-primary-soft)' }}>Standard</span>}
                </td>
                <td className="border-b border-divider text-muted">v{row.version}</td>
                <td className="border-b border-divider text-muted">{row.updatedAt.slice(0, 10)}</td>
                <td className="border-b border-divider text-right">
                  {!row.isDefault && (
                    <button
                      type="button"
                      onClick={() => void api.setDefaultTemplate(row.id).then(load)}
                      className="text-xs"
                      style={{ color: 'var(--n-primary)' }}
                    >
                      Als Standard setzen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Verbindet den bereits fertigen visuellen Editor mit echter Speicherung.
 * Neue Vorlagen fragen zuerst nach einem Namen, bestehende laden ihr
 * gespeichertes Layout.
 */
function TemplateEditorPage({ templateId, onDone, onCancel }: {
  templateId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<TemplateLayout | null>(templateId ? null : DEFAULT_LAYOUT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!templateId) return;
    api.template(templateId)
      .then((detail) => {
        if (detail) {
          setName(detail.name);
          setLayout(JSON.parse(detail.layoutJson) as TemplateLayout);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err))));
  }, [templateId]);

  async function save(nextLayout: TemplateLayout) {
    const finalName = name.trim() || 'Unbenannte Vorlage';
    setSaving(true);
    setError(null);
    try {
      const json = JSON.stringify(nextLayout);
      if (templateId) await api.updateTemplate(templateId, finalName, json);
      else await api.createTemplate(finalName, json);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    } finally {
      setSaving(false);
    }
  }

  if (layout === null) return <p className="text-sm text-subtle">Wird geladen…</p>;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-sm text-subtle hover:text-text">← Vorlagen</button>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name der Vorlage"
          className="flex-1 rounded border border-border bg-input px-2 py-1 text-sm"
        />
        {saving && <span className="text-xs text-subtle">Wird gespeichert…</span>}
      </div>
      {error && <ErrorNotice error={error} />}
      <div className="min-h-0 flex-1">
        <TemplateEditor initial={layout} onSave={(nextLayout) => void save(nextLayout)} />
      </div>
    </div>
  );
}
