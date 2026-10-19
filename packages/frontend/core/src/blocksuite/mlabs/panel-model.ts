export const PAGE_FILE_NAME = 'mlabs-page.txt';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'csv',
  'doc',
  'docx',
  'htm',
  'html',
  'md',
  'markdown',
  'mdx',
  'pdf',
  'pptx',
  'txt',
  'vtt',
  'xls',
  'xlsx',
]);

const DATASET_LINK = 'mlabs';
const DATASET_KEY = 'dify_dataset_id';
const WHY_KEY = 'why';

export type WhyIndicator = 'leading' | 'lagging';

export type WhyDraft = {
  statement: string;
  indicator_type: WhyIndicator;
  from: string;
  to: string;
  unit: string;
  okr_alignment: string;
};

type PageMap = {
  get: (key: string) => unknown;
  set: (key: string, value: string) => void;
};

export type PageDoc = {
  getMap: (name: string) => PageMap;
  transact?: (fn: () => void) => void;
};

export type SourceDocument = {
  id: string;
  name: string;
  indexing_status: string;
  error: string | null;
  change?: 'new' | 'modified' | 'unchanged';
};

export function readDatasetId(doc: PageDoc | undefined): string | undefined {
  if (!doc) return undefined;
  const value = doc.getMap(DATASET_LINK).get(DATASET_KEY);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function writeDatasetId(doc: PageDoc, datasetId: string) {
  const apply = () => doc.getMap(DATASET_LINK).set(DATASET_KEY, datasetId);
  if (doc.transact) doc.transact(apply);
  else apply();
}

export function emptyWhy(): WhyDraft {
  return {
    statement: '',
    indicator_type: 'leading',
    from: '',
    to: '',
    unit: '',
    okr_alignment: '',
  };
}

export function readWhy(doc: PageDoc | undefined): WhyDraft {
  const blank = emptyWhy();
  if (!doc) return blank;
  const raw = doc.getMap(DATASET_LINK).get(WHY_KEY);
  if (typeof raw !== 'string' || raw.length === 0) return blank;
  try {
    const body = JSON.parse(raw) as Partial<WhyDraft>;
    const indicator = body.indicator_type === 'lagging' ? 'lagging' : 'leading';
    return {
      statement: typeof body.statement === 'string' ? body.statement : '',
      indicator_type: indicator,
      from: typeof body.from === 'string' ? body.from : '',
      to: typeof body.to === 'string' ? body.to : '',
      unit: typeof body.unit === 'string' ? body.unit : '',
      okr_alignment: typeof body.okr_alignment === 'string' ? body.okr_alignment : '',
    };
  } catch {
    return blank;
  }
}

export function writeWhy(doc: PageDoc, draft: WhyDraft) {
  const payload = JSON.stringify({
    statement: draft.statement.trim(),
    indicator_type: draft.indicator_type,
    from: draft.from.trim(),
    to: draft.to.trim(),
    unit: draft.unit.trim(),
    okr_alignment: draft.okr_alignment.trim(),
  });
  const apply = () => doc.getMap(DATASET_LINK).set(WHY_KEY, payload);
  if (doc.transact) doc.transact(apply);
  else apply();
}

/** Business goal only. People/teams/roles stay in WHO (not this slice). */
export function whyRejection(draft: WhyDraft): string | null {
  const statement = draft.statement.trim();
  if (statement.length === 0) return 'Escribí el objetivo de negocio.';
  if (statement.length > 400) return 'El objetivo supera 400 caracteres.';
  if (draft.indicator_type !== 'leading' && draft.indicator_type !== 'lagging') {
    return 'Elegí leading o lagging.';
  }
  const from = Number(draft.from);
  const to = Number(draft.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 'From y To tienen que ser números.';
  }
  const unit = draft.unit.trim();
  if (unit.length === 0 || unit.length > 40) return 'Indicá la unidad (máx. 40).';
  const okr = draft.okr_alignment.trim();
  if (okr.length > 200) return 'La alineación OKR supera 200 caracteres.';
  return null;
}

export function canonicalPageUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 500 || !/^https:\/\/\S+$/.test(value)) return undefined;
  return value;
}

export function openRequestBody(input: {
  pageId: string;
  pageUrl?: string;
  datasetId?: string;
}) {
  const body: Record<string, string> = {
    command: 'mlabs-framework',
    page_id: input.pageId,
  };
  const pageUrl = canonicalPageUrl(input.pageUrl);
  if (pageUrl) body.page_url = pageUrl;
  if (input.datasetId) body.dataset_id = input.datasetId;
  return JSON.stringify(body);
}

export function uploadRejection(name: string, size: number): string | null {
  if (!name || name.length > 200 || name.includes('/') || name.includes('\\')) {
    return 'Nombre de archivo inválido.';
  }
  if (
    name === PAGE_FILE_NAME ||
    name === 'mlabs-page.json' ||
    name === 'mlabs-sync-state.txt'
  ) {
    return 'Ese archivo lo reserva el vínculo de la página.';
  }
  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return 'Dify no acepta ese tipo. Sirve pdf, md, txt, docx y formatos de texto parecidos.';
  }
  if (size <= 0) return 'El archivo está vacío.';
  if (size > MAX_FILE_BYTES) return 'Supera el tope de 15 MB.';
  return null;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Listo',
    error: 'Error',
    indexing: 'Indexando',
    waiting: 'En espera',
    parsing: 'Leyendo',
    splitting: 'Partiendo',
    cleaning: 'Limpiando',
  };
  return labels[status] ?? status;
}

/** True while Dify has not finished indexing (or failed). */
export function isDocumentIndexing(status: string): boolean {
  return status !== 'completed' && status !== 'error';
}

export function indexingNotice(documents: SourceDocument[]): string | null {
  const pending = documents.filter(doc => isDocumentIndexing(doc.indexing_status));
  if (pending.length === 0) return null;
  if (pending.length === 1) {
    return `“${pending[0].name}” todavía se indexa. Esperá a Listo para que Preguntar lo use entero.`;
  }
  return `${pending.length} archivos todavía se indexan. Esperá a Listo para que Preguntar los use enteros.`;
}

export function syncSummaryLabel(summary: {
  ready: number;
  indexing: number;
  error: number;
  total: number;
  new?: number;
  modified?: number;
  unchanged?: number;
  removed?: number;
}): string {
  const hasChanges =
    summary.new != null ||
    summary.modified != null ||
    summary.unchanged != null ||
    summary.removed != null;
  if (!hasChanges) {
    return `Listo ${summary.ready} · Indexando ${summary.indexing} · Error ${summary.error} (total ${summary.total}).`;
  }
  return (
    `Nuevas ${summary.new ?? 0} · Modificadas ${summary.modified ?? 0} · ` +
    `Iguales ${summary.unchanged ?? 0} · Quitadas ${summary.removed ?? 0} · ` +
    `Listo ${summary.ready} · Indexando ${summary.indexing} · Error ${summary.error}.`
  );
}

export function changeLabel(change: SourceDocument['change']): string {
  if (change === 'new') return 'Nueva';
  if (change === 'modified') return 'Modificada';
  if (change === 'unchanged') return 'Igual';
  return '';
}

export function humanBridgeError(code: string, detail?: string): string {
  const messages: Record<string, string> = {
    bad_request:
      'Falta el dataset de esta página. Cerrá el panel y volvé a abrir /mlabs-framework.',
    bad_question: 'Escribí una pregunta antes de enviar.',
    freellm_unconfigured: 'FreeLLMAPI no está configurado en el puente.',
    freellm_unavailable: 'FreeLLMAPI no respondió. Probá de nuevo en un momento.',
    bad_json: 'La petición no es válida.',
    bad_name: 'El nombre no es válido (máx. 40 caracteres).',
    bad_description: 'La descripción es demasiado larga.',
    bad_type: 'Dify no acepta ese tipo de archivo.',
    empty_file: 'El archivo está vacío.',
    too_large: 'El archivo supera 15 MB.',
    dataset_missing: 'No encontramos ese dataset en Dify.',
    document_missing: 'Ese archivo ya no está en el dataset.',
    page_file_protected: 'Ese archivo es el vínculo de la página y no se puede tocar aquí.',
    name_taken: 'Ya hay otro dataset con ese nombre.',
    dify_unconfigured: 'El puente a Dify no está configurado.',
    dify_unavailable: 'Dify no respondió. Probá de nuevo en un momento.',
    dify_rejected: 'Dify rechazó la operación.',
    method_not_allowed: 'Método no permitido.',
    not_found: 'Ruta no encontrada en el puente.',
  };
  const base = messages[code] ?? code;
  return detail ? `${base} (${detail})` : base;
}
