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
      okr_alignment:
        typeof body.okr_alignment === 'string' ? body.okr_alignment : '',
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
  if (
    draft.indicator_type !== 'leading' &&
    draft.indicator_type !== 'lagging'
  ) {
    return 'Elegí leading o lagging.';
  }
  const from = Number(draft.from);
  const to = Number(draft.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 'From y To tienen que ser números.';
  }
  const unit = draft.unit.trim();
  if (unit.length === 0 || unit.length > 40)
    return 'Indicá la unidad (máx. 40).';
  const okr = draft.okr_alignment.trim();
  if (okr.length > 200) return 'La alineación OKR supera 200 caracteres.';
  return null;
}

export function canonicalPageUrl(
  value: string | undefined
): string | undefined {
  if (!value || value.length > 500 || !/^https:\/\/\S+$/.test(value))
    return undefined;
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
  const pending = documents.filter(doc =>
    isDocumentIndexing(doc.indexing_status)
  );
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

export const SHAPE_W = 220;
export const SHAPE_H = 96;
export const SHAPE_H_Z3 = 140;
export const SHAPE_GAP_Y = 20;
export const SHAPE_GAP_X = 160;
export const COL_GAP = 48;
/** Full impact-map width left of the note: Z1 + WHY→WHO→HOW→WHAT */
export const TREE_COLS = 5;

export type CanvasNode = {
  id: string;
  role?: string;
  externalId?: string;
  text?: string;
};

export type PaintRole =
  | 'team'
  | 'person'
  | 'role'
  | 'why'
  | 'who'
  | 'how'
  | 'what';

export type PaintShape = {
  role: PaintRole;
  externalId: string;
  name: string;
  /** Shown on the canvas (label + statement). */
  text: string;
  xywh: string;
  fillColor: string;
  strokeStyle: 'solid' | 'dash';
  attrs: Record<string, string>;
};

export type PaintConnector = {
  fromExternalId: string;
  toExternalId: string;
};

export type PaintPlan = {
  shapes: PaintShape[];
  connectors: PaintConnector[];
};

export type RegistryTree = {
  actors?: Array<{
    id?: string;
    external_id: string;
    kind: string;
    name: string;
    status?: string;
    attrs?: Record<string, unknown>;
  }>;
  artifacts?: Array<{
    external_id: string;
    kind: string;
    body?: { label?: string; statement?: string };
    verification?: string;
  }>;
  edges?: Array<{
    from_id?: string;
    to_id?: string;
    rel?: string;
  }>;
};

const COLOR_OK = '#3cbc36';
const COLOR_PROPOSED = '#e6b422';
const COLOR_ROLE = '#5b8def';

export function shapeCaption(label: string, statement?: string): string {
  const body = (statement ?? '').trim();
  if (!body) return label;
  const clipped = body.length > 110 ? `${body.slice(0, 107)}…` : body;
  return `${label}\n${clipped}`;
}

function shortId(externalId: string): string {
  return externalId.replace(/^mlabs:/, '') || externalId;
}

const FALLBACK_Z1: Array<Omit<PaintShape, 'xywh'>> = [
  {
    role: 'team',
    externalId: 'mlabs-core',
    name: 'Mlabs Core',
    text: 'Mlabs Core',
    fillColor: COLOR_OK,
    strokeStyle: 'solid',
    attrs: {
      email: '',
      affine_user_id: '',
      plane_user_id: '',
      buzz_pubkey: '',
    },
  },
  {
    role: 'person',
    externalId: 'adrian-eguez',
    name: 'Adrian Eguez',
    text: 'Adrian Eguez\nOwner',
    fillColor: COLOR_OK,
    strokeStyle: 'solid',
    attrs: {
      email: '',
      affine_user_id: '58eefc79-b154-4202-a83c-9cfe6930c165',
      plane_user_id: '',
      buzz_pubkey:
        '1aab62cb42ea5682d5a7dd4b221d9b75f002acc531f2464d35c044e394122f3e',
    },
  },
];

const FALLBACK_Z3: Array<Omit<PaintShape, 'xywh'>> = [
  {
    role: 'why',
    externalId: 'why-poc',
    name: 'WHY',
    text: shapeCaption(
      'WHY',
      'Bajar el tiempo de decisión del framework Mlabs con un master registry trazable.'
    ),
    fillColor: COLOR_PROPOSED,
    strokeStyle: 'dash',
    attrs: {
      statement:
        'Bajar el tiempo de decisión del framework Mlabs con un master registry trazable.',
    },
  },
  {
    role: 'who',
    externalId: 'who-poc',
    name: 'WHO',
    text: shapeCaption('WHO', 'Adrian · Mac Adrian · Infra · equipos Mlabs'),
    fillColor: COLOR_PROPOSED,
    strokeStyle: 'dash',
    attrs: { statement: 'Adrian · Mac Adrian · Infra · equipos Mlabs' },
  },
  {
    role: 'how',
    externalId: 'how-poc',
    name: 'HOW',
    text: shapeCaption('HOW', 'PG mlabs + bridge + Pintar←SoT + feedback Dify'),
    fillColor: COLOR_PROPOSED,
    strokeStyle: 'dash',
    attrs: { statement: 'PG mlabs + bridge + Pintar←SoT + feedback Dify' },
  },
  {
    role: 'what',
    externalId: 'what-poc',
    name: 'WHAT',
    text: shapeCaption('WHAT', 'Árbol real en lienzo + feedback nodo→Dify'),
    fillColor: COLOR_PROPOSED,
    strokeStyle: 'dash',
    attrs: { statement: 'Árbol real en lienzo + feedback nodo→Dify' },
  },
];

const OWN_ROLES = new Set<string>([
  'person',
  'team',
  'role',
  'why',
  'who',
  'how',
  'what',
]);
const OWN_TEXT = new Set([...FALLBACK_Z1, ...FALLBACK_Z3].map(row => row.name));
const OWN_EXTERNAL = new Set(
  [...FALLBACK_Z1, ...FALLBACK_Z3].map(row => row.externalId)
);

export function isOwnNode(node: CanvasNode): boolean {
  return (
    (typeof node.role === 'string' && OWN_ROLES.has(node.role)) ||
    (typeof node.externalId === 'string' &&
      OWN_EXTERNAL.has(node.externalId)) ||
    node.id.startsWith('mlabs:person:') ||
    node.id.startsWith('mlabs:team:') ||
    node.id.startsWith('mlabs:artifact:') ||
    (typeof node.text === 'string' && OWN_TEXT.has(node.text))
  );
}

export function runOnStore(
  store: { transact?: (fn: () => void) => void } | undefined,
  fn: () => void
) {
  if (store?.transact) store.transact(fn);
  else fn();
}

export function foreignMinX(xywhs: Array<string | undefined>): number | null {
  const xs: number[] = [];
  for (const xywh of xywhs) {
    if (!xywh) continue;
    try {
      const parsed = JSON.parse(xywh) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length === 4 &&
        parsed.every(part => typeof part === 'number' && Number.isFinite(part))
      ) {
        xs.push(parsed[0] as number);
      }
    } catch {
      /* ignore a note the canvas cannot measure */
    }
  }
  if (xs.length === 0) return null;
  return Math.min(...xs);
}

function treeOriginX(foreignLeft: number | null): number {
  const width = TREE_COLS * SHAPE_W + (TREE_COLS - 1) * COL_GAP + SHAPE_GAP_X;
  return foreignLeft == null ? 0 : foreignLeft - width;
}

function place(
  row: Omit<PaintShape, 'xywh'>,
  col: number,
  rowIndex: number,
  originX: number,
  height = SHAPE_H
): PaintShape {
  const x = originX + col * (SHAPE_W + COL_GAP);
  const y = rowIndex * (height + SHAPE_GAP_Y);
  return { ...row, xywh: `[${x},${y},${SHAPE_W},${height}]` };
}

/** Default full tree (Z1 + impact map) — also fallback if registry unavailable. */
export function paintPlan(foreignLeft: number | null): PaintPlan {
  return paintPlanFromTree(null, foreignLeft);
}

export function paintPlanFromTree(
  tree: RegistryTree | null,
  foreignLeft: number | null
): PaintPlan {
  const originX = treeOriginX(foreignLeft);
  const z1: Array<Omit<PaintShape, 'xywh'>> = [];
  const actors = (tree?.actors ?? []).filter(
    a => !a.external_id.includes('smoke')
  );

  if (actors.length) {
    const kindRank = (k: string) =>
      k === 'team' ? 0 : k === 'role' ? 1 : k === 'person' ? 2 : 3;
    const ordered = [...actors].sort(
      (a, b) =>
        kindRank(a.kind) - kindRank(b.kind) ||
        a.name.localeCompare(b.name, 'es')
    );
    for (const actor of ordered) {
      if (
        actor.kind !== 'team' &&
        actor.kind !== 'person' &&
        actor.kind !== 'role'
      ) {
        continue;
      }
      const short = shortId(actor.external_id);
      const roleLabel =
        actor.kind === 'role' ? `Rol: ${actor.name}` : actor.name;
      const active = actor.status === 'active';
      z1.push({
        role: actor.kind as PaintRole,
        externalId: short,
        name: actor.name,
        text: roleLabel,
        fillColor:
          actor.kind === 'role'
            ? COLOR_ROLE
            : active
              ? COLOR_OK
              : COLOR_PROPOSED,
        strokeStyle: active ? 'solid' : 'dash',
        attrs: {
          email: String(actor.attrs?.email ?? ''),
          affine_user_id: String(actor.attrs?.affine_user_id ?? ''),
          plane_user_id: String(actor.attrs?.plane_user_id ?? ''),
          buzz_pubkey: String(actor.attrs?.buzz_pubkey ?? ''),
          actor_kind: actor.kind,
        },
      });
    }
  }
  if (z1.length === 0) z1.push(...FALLBACK_Z1);

  const z3: Array<Omit<PaintShape, 'xywh'>> = [];
  const kindOrder: PaintRole[] = ['why', 'who', 'how', 'what'];
  if (tree?.artifacts?.length) {
    for (const kind of kindOrder) {
      const art = tree.artifacts.find(a => a.kind === kind);
      if (!art) continue;
      const label = art.body?.label || kind.toUpperCase();
      const statement = String(art.body?.statement ?? '');
      const verified = art.verification === 'verified';
      z3.push({
        role: kind,
        externalId: art.external_id,
        name: label,
        text: shapeCaption(label, statement),
        fillColor: verified ? COLOR_OK : COLOR_PROPOSED,
        strokeStyle: verified ? 'solid' : 'dash',
        attrs: { statement },
      });
    }
  }
  if (z3.length === 0) z3.push(...FALLBACK_Z3);

  const shapes: PaintShape[] = [
    ...z1.map((row, i) => place(row, 0, i, originX, SHAPE_H)),
    ...z3.map((row, i) => place(row, i + 1, 0, originX, SHAPE_H_Z3)),
  ];

  const connectors: PaintConnector[] = [];
  for (let i = 0; i < z3.length - 1; i++) {
    connectors.push({
      fromExternalId: z3[i].externalId,
      toExternalId: z3[i + 1].externalId,
    });
  }

  // Hierarchy edges from registry (member_of / part_of / plays_role / reports_to)
  if (tree?.edges?.length && actors.length) {
    const byUuid = new Map(
      actors.filter(a => a.id).map(a => [String(a.id), shortId(a.external_id)])
    );
    for (const edge of tree.edges) {
      const from = edge.from_id ? byUuid.get(String(edge.from_id)) : undefined;
      const to = edge.to_id ? byUuid.get(String(edge.to_id)) : undefined;
      if (!from || !to) continue;
      connectors.push({ fromExternalId: from, toExternalId: to });
    }
  }

  // People/teams → WHO (impact map)
  const who = z3.find(s => s.role === 'who');
  if (who) {
    for (const actor of z1.filter(
      a => a.role === 'person' || a.role === 'team'
    )) {
      connectors.push({
        fromExternalId: actor.externalId,
        toExternalId: who.externalId,
      });
    }
  }

  for (const s of shapes) {
    OWN_TEXT.add(s.name);
    OWN_TEXT.add(s.text);
    OWN_EXTERNAL.add(s.externalId);
  }

  return { shapes, connectors };
}

export function humanBridgeError(code: string, detail?: string): string {
  const messages: Record<string, string> = {
    bad_request:
      'Falta el dataset de esta página. Cerrá el panel y volvé a abrir /mlabs-framework.',
    bad_question: 'Escribí una pregunta antes de enviar.',
    freellm_unconfigured: 'FreeLLMAPI no está configurado en el puente.',
    freellm_unavailable:
      'FreeLLMAPI no respondió. Probá de nuevo en un momento.',
    bad_json: 'La petición no es válida.',
    bad_name: 'El nombre no es válido (máx. 40 caracteres).',
    bad_description: 'La descripción es demasiado larga.',
    bad_type: 'Dify no acepta ese tipo de archivo.',
    empty_file: 'El archivo está vacío.',
    too_large: 'El archivo supera 15 MB.',
    dataset_missing: 'No encontramos ese dataset en Dify.',
    document_missing: 'Ese archivo ya no está en el dataset.',
    page_file_protected:
      'Ese archivo es el vínculo de la página y no se puede tocar aquí.',
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
