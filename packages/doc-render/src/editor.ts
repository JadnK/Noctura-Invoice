/**
 * Bearbeitungsoperationen fuer den visuellen Vorlageneditor.
 *
 * Alle Operationen sind rein: sie nehmen ein Layout und geben ein neues zurueck.
 * Damit sind Rueckgaengig, Wiederholen und Versionierung im Editor trivial —
 * der Verlauf ist schlicht eine Liste von Layouts.
 */
import { DEFAULT_LAYOUT } from './model.ts';
import type { Block, BlockStyle, BlockType, TemplateLayout } from './model.ts';
import { BLOCK_TYPES } from './model.ts';
import { sanitizeCss } from './sanitize.ts';
import { unknownPlaceholders } from './placeholders.ts';

export type Section = 'header' | 'body' | 'footer';

/** Bloecke, die je Vorlage nur einmal sinnvoll sind. */
export const SINGLETON_BLOCKS: readonly BlockType[] = [
  'items_table', 'totals', 'tax_summary', 'address', 'document_info', 'page_numbers',
];

/** Bloecke, die frei beschriftet werden koennen. */
export const TEXT_BLOCKS: readonly BlockType[] = ['text', 'sender_line', 'payment_info'];

function replaceSection(layout: TemplateLayout, section: Section, blocks: readonly Block[]): TemplateLayout {
  return { ...layout, [section]: blocks };
}

function nextId(layout: TemplateLayout, type: BlockType): string {
  const all = [...layout.header, ...layout.body, ...layout.footer];
  let counter = 1;
  let candidate = type;
  while (all.some((block) => block.id === candidate)) {
    counter += 1;
    candidate = `${type}-${counter}` as BlockType;
  }
  return candidate;
}

export function addBlock(
  layout: TemplateLayout,
  section: Section,
  type: BlockType,
  index?: number,
): TemplateLayout {
  const blocks = [...layout[section]];
  const position = index === undefined ? blocks.length : Math.max(0, Math.min(index, blocks.length));
  const block: Block = {
    id: nextId(layout, type),
    type,
    ...(TEXT_BLOCKS.includes(type) ? { content: '' } : {}),
    ...(type === 'items_table'
      ? { columns: ['position', 'description', 'quantity', 'unit_price', 'line_total'] as const }
      : {}),
  };
  blocks.splice(position, 0, block);
  return replaceSection(layout, section, blocks);
}

export function removeBlock(layout: TemplateLayout, section: Section, id: string): TemplateLayout {
  return replaceSection(layout, section, layout[section].filter((block) => block.id !== id));
}

/**
 * Verschiebt einen Block um `delta` Positionen. Ausserhalb der Grenzen passiert
 * nichts — die Tastaturbedienung soll am Rand nicht ins Leere laufen.
 */
export function moveBlock(layout: TemplateLayout, section: Section, id: string, delta: number): TemplateLayout {
  const blocks = [...layout[section]];
  const from = blocks.findIndex((block) => block.id === id);
  if (from < 0) return layout;
  const to = from + delta;
  if (to < 0 || to >= blocks.length) return layout;
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return replaceSection(layout, section, blocks);
}

/** Verschiebt einen Block in einen anderen Bereich, etwa aus dem Rumpf in die Fusszeile. */
export function moveToSection(
  layout: TemplateLayout,
  from: Section,
  to: Section,
  id: string,
  index?: number,
): TemplateLayout {
  const block = layout[from].find((candidate) => candidate.id === id);
  if (!block || from === to) return layout;
  const without = replaceSection(layout, from, layout[from].filter((b) => b.id !== id));
  const target = [...without[to]];
  target.splice(index ?? target.length, 0, block);
  return replaceSection(without, to, target);
}

export function updateBlock(
  layout: TemplateLayout,
  section: Section,
  id: string,
  patch: Partial<Omit<Block, 'id' | 'type'>>,
): TemplateLayout {
  return replaceSection(
    layout,
    section,
    layout[section].map((block) => (block.id === id ? { ...block, ...patch } : block)),
  );
}

export function updateStyle(
  layout: TemplateLayout,
  section: Section,
  id: string,
  patch: BlockStyle,
): TemplateLayout {
  return replaceSection(
    layout,
    section,
    layout[section].map((block) =>
      block.id === id ? { ...block, style: { ...block.style, ...patch } } : block,
    ),
  );
}

export function toggleVisibility(layout: TemplateLayout, section: Section, id: string): TemplateLayout {
  return replaceSection(
    layout,
    section,
    layout[section].map((block) =>
      block.id === id ? { ...block, visible: block.visible === false } : block,
    ),
  );
}

export function duplicateLayout(layout: TemplateLayout, name: string): TemplateLayout {
  return { ...layout, name, version: 1 };
}

export function bumpVersion(layout: TemplateLayout): TemplateLayout {
  return { ...layout, version: layout.version + 1 };
}

export interface LayoutProblem {
  readonly severity: 'error' | 'warning';
  readonly blockId?: string;
  readonly message: string;
}

/**
 * Prueft eine Vorlage vor dem Speichern.
 *
 * Fehler verhindern das Speichern, Warnungen nicht. Eine Rechnung ohne
 * Positionstabelle oder ohne Summen waere kein Beleg, sondern ein Brief.
 */
export function validateLayout(layout: TemplateLayout): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const all = [...layout.header, ...layout.body, ...layout.footer];

  for (const required of ['items_table', 'totals'] as const) {
    if (!all.some((block) => block.type === required && block.visible !== false)) {
      problems.push({
        severity: 'error',
        message: required === 'items_table'
          ? 'Die Vorlage braucht eine sichtbare Positionstabelle.'
          : 'Die Vorlage braucht einen sichtbaren Summenbereich.',
      });
    }
  }

  if (!all.some((block) => block.type === 'address' && block.visible !== false)) {
    problems.push({ severity: 'warning', message: 'Ohne Empfängeranschrift eignet sich die Vorlage nicht für den Postversand.' });
  }

  const ids = new Set<string>();
  for (const block of all) {
    if (ids.has(block.id)) {
      problems.push({ severity: 'error', blockId: block.id, message: `Der Baustein „${block.id}" kommt mehrfach vor.` });
    }
    ids.add(block.id);

    if (block.content) {
      for (const placeholder of unknownPlaceholders(block.content)) {
        problems.push({
          severity: 'warning', blockId: block.id,
          message: `Unbekannter Platzhalter {{${placeholder}}} — er bleibt im Dokument leer.`,
        });
      }
    }
  }

  for (const type of SINGLETON_BLOCKS) {
    if (all.filter((block) => block.type === type).length > 1) {
      problems.push({ severity: 'warning', message: `Der Baustein „${type}" ist mehrfach vorhanden.` });
    }
  }

  const margins = layout.page;
  if (margins.marginTopMm < 10 || margins.marginLeftMm < 10) {
    problems.push({ severity: 'warning', message: 'Ränder unter 10 mm werden von vielen Druckern beschnitten.' });
  }
  if (layout.page.baseFontSizePt < 7) {
    problems.push({ severity: 'error', message: 'Eine Grundschriftgröße unter 7 pt ist nicht mehr zuverlässig lesbar.' });
  }

  if (layout.customCss) {
    const { removed } = sanitizeCss(layout.customCss);
    for (const rule of removed) {
      problems.push({ severity: 'warning', message: `CSS wird nicht übernommen: ${rule}` });
    }
  }

  return problems;
}

export function isSavable(layout: TemplateLayout): boolean {
  return !validateLayout(layout).some((problem) => problem.severity === 'error');
}

/** Export als JSON, bewusst formatiert, damit Versionen vergleichbar bleiben. */
export function exportLayout(layout: TemplateLayout): string {
  return JSON.stringify(layout, null, 2);
}

export type ImportResult =
  | { readonly ok: true; readonly layout: TemplateLayout }
  | { readonly ok: false; readonly reason: string };

/** Import einer fremden Vorlagendatei. Unbekannte Felder werden verworfen. */
export function importLayout(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'Die Datei enthält kein gültiges JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'Die Datei enthält keine Vorlage.' };
  }

  const source = parsed as Partial<TemplateLayout>;
  const section = (blocks: unknown): Block[] => {
    if (!Array.isArray(blocks)) return [];
    return blocks
      .filter((block): block is Block =>
        typeof block === 'object' && block !== null
        && typeof (block as Block).id === 'string'
        && (BLOCK_TYPES as readonly string[]).includes((block as Block).type))
      .map((block) => ({
        id: block.id, type: block.type, visible: block.visible,
        style: block.style, content: block.content, columns: block.columns,
      }));
  };

  const layout: TemplateLayout = {
    name: typeof source.name === 'string' ? source.name.slice(0, 80) : 'Importierte Vorlage',
    version: 1,
    page: { ...DEFAULT_LAYOUT.page, ...(typeof source.page === 'object' && source.page ? source.page : {}) },
    header: section(source.header),
    body: section(source.body),
    footer: section(source.footer),
    customCss: typeof source.customCss === 'string' ? sanitizeCss(source.customCss).css : undefined,
    watermark: source.watermark === 'draft' || source.watermark === 'paid' ? source.watermark : 'none',
  };

  if (layout.body.length === 0 && layout.header.length === 0) {
    return { ok: false, reason: 'Die Vorlage enthält keine verwertbaren Bausteine.' };
  }
  return { ok: true, layout };
}
