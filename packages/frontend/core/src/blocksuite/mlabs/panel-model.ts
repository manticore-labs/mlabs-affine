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

export const SHAPE_W = 200;
export const MEMBER_W = 280;
export const MEMBER_H = 168;
export const TEAM_W = 160;
export const LANE_CHILD_W = 220;
export const LANE_CHILD_H = 128;
export const TITLE_H = 44;
export const SHAPE_GAP_Y = 20;
export const SHAPE_GAP_X = 28;
export const SECTION_GAP = 56;
export const COL_GAP = 28;
/** Gap between our map's right edge and the leftmost foreign content. */
export const FOREIGN_GAP = 200;
export const WHY_CARD_W = TEAM_W + 40;
export const EQUIPOS_W = TEAM_W + SHAPE_GAP_X + MEMBER_W;
export const WHY_LANE_W =
  WHY_CARD_W + SHAPE_GAP_X + LANE_CHILD_W * 3 + COL_GAP * 2;
/** [vertical, horizontal] text padding inside shapes */
export const SHAPE_PAD: [number, number] = [22, 28];
export const COLOR_TEXT_LIGHT = '#f5f5f5';
export const COLOR_TEXT_DARK = '#141414';

export type CanvasNode = {
  id: string;
  role?: string;
  externalId?: string;
  text?: string;
};

export type PaintRole =
  | 'title'
  | 'team'
  | 'person'
  | 'role'
  | 'why'
  | 'who'
  | 'how'
  | 'what'
  | 'scenario'
  | 'question';

export type PaintShape = {
  role: PaintRole;
  externalId: string;
  name: string;
  text: string;
  xywh: string;
  fillColor: string;
  color: string;
  padding: [number, number];
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
    id?: string;
    external_id: string;
    kind: string;
    parent_id?: string | null;
    body?: {
      label?: string;
      statement?: string;
      needs_human?: boolean;
      question?: string;
    };
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
const COLOR_TITLE = '#2a2a2a';
const COLOR_TEAM = '#1f6f4a';
const COLOR_Q = '#c45c26';
const COLOR_SCENARIO = '#6b5b95';

export function shapeCaption(label: string, statement?: string): string {
  const body = (statement ?? '').trim();
  if (!body) return label;
  const clipped = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return `${label}\n${clipped}`;
}

/** Strip redundant WHY/WHO/HOW/WHAT prefix — section title already names the kind. */
export function methodologyCardText(
  label: string,
  statement?: string,
  kind?: string
): string {
  const kindRe = kind
    ? new RegExp(`^${kind}\\s*[·.•\\-–:]?\\s*`, 'i')
    : /^(WHY|WHO|HOW|WHAT|SCENARIO)\s*[·.•\-–:]?\s*/i;
  const clean = (label || '').replace(kindRe, '').trim() || label;
  const body = (statement ?? '').trim();
  if (!body) return clean;
  if (body === clean) return clean;
  const clipped = body.length > 140 ? `${body.slice(0, 137)}…` : body;
  return `${clean}\n${clipped}`;
}

function textOn(fill: string): string {
  const darkFills = new Set([COLOR_TITLE, COLOR_TEAM, COLOR_Q, COLOR_SCENARIO]);
  return darkFills.has(fill) ? COLOR_TEXT_LIGHT : COLOR_TEXT_DARK;
}

function shortId(externalId: string): string {
  return externalId.replace(/^mlabs:/, '') || externalId;
}

function attrStr(
  attrs: Record<string, unknown> | undefined,
  key: string
): string {
  const v = attrs?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

export function personCardText(
  name: string,
  attrs: Record<string, unknown> | undefined,
  roleName?: string
): string {
  const title = attrStr(attrs, 'title') || roleName || '';
  const email = attrStr(attrs, 'email');
  const affine = attrStr(attrs, 'affine_user_id');
  const plane = attrStr(attrs, 'plane_user_id');
  const given = attrStr(attrs, 'given_name');
  const family = attrStr(attrs, 'family_name');
  const lines = [
    name,
    title ? `Rol: ${title}` : '',
    given || family
      ? `Nombre: ${[given, family].filter(Boolean).join(' ')}`
      : '',
    email ? `📧 ${email}` : '📧 —',
    `Affine: ${affine || '—'}`,
    `Plane: ${plane || '—'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

const OWN_ROLES = new Set<string>([
  'title',
  'person',
  'team',
  'role',
  'why',
  'who',
  'how',
  'what',
  'scenario',
  'question',
  'connector',
]);
const OWN_TEXT = new Set<string>(['EQUIPOS', 'WHY', 'SIN EQUIPO', 'SCENARIOS']);
const OWN_EXTERNAL = new Set<string>([
  'title-equipos',
  'title-why',
  'title-orphans',
  'title-scenarios',
]);

export function isOwnNode(node: CanvasNode): boolean {
  return (
    (typeof node.role === 'string' && OWN_ROLES.has(node.role)) ||
    (typeof node.externalId === 'string' &&
      OWN_EXTERNAL.has(node.externalId)) ||
    node.id.startsWith('mlabs:') ||
    (typeof node.text === 'string' &&
      (OWN_TEXT.has(node.text) || node.text.startsWith('❓')))
  );
}

export function runOnStore(
  store: { transact?: (fn: () => void) => void } | undefined,
  fn: () => void
) {
  if (store?.transact) store.transact(fn);
  else fn();
}

export function parseXywh(
  xywh: string | undefined
): [number, number, number, number] | null {
  if (!xywh) return null;
  try {
    const parsed = JSON.parse(xywh) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      parsed.every(part => typeof part === 'number' && Number.isFinite(part))
    ) {
      return parsed as [number, number, number, number];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Leftmost X among foreign (non-mlabs) elements — notes, images, shapes. */
export function foreignMinX(xywhs: Array<string | undefined>): number | null {
  const xs: number[] = [];
  for (const xywh of xywhs) {
    const box = parseXywh(xywh);
    if (box) xs.push(box[0]);
  }
  if (xs.length === 0) return null;
  return Math.min(...xs);
}

export function planBounds(shapes: PaintShape[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const b = parseXywh(s.xywh);
    if (!b) continue;
    const [x, y, w, h] = b;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function shiftShapes(shapes: PaintShape[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const s of shapes) {
    const b = parseXywh(s.xywh);
    if (!b) continue;
    s.xywh = `[${b[0] + dx},${b[1] + dy},${b[2]},${b[3]}]`;
  }
}

function box(
  row: Omit<PaintShape, 'xywh' | 'color' | 'padding'> &
    Partial<Pick<PaintShape, 'color' | 'padding'>>,
  x: number,
  y: number,
  w: number,
  h: number
): PaintShape {
  const fill = row.fillColor;
  return {
    ...row,
    color: row.color ?? textOn(fill),
    padding: row.padding ?? SHAPE_PAD,
    xywh: `[${x},${y},${w},${h}]`,
  };
}

/** Default / fallback + real tree lane layout. */
export function paintPlan(foreignLeft: number | null): PaintPlan {
  return paintPlanFromTree(null, foreignLeft);
}

export function paintPlanFromTree(
  tree: RegistryTree | null,
  foreignLeft: number | null
): PaintPlan {
  // Layout at (0,0); shift left of foreign content after measuring total width.
  const shapes: PaintShape[] = [];
  const connectors: PaintConnector[] = [];

  const actors = (tree?.actors ?? []).filter(
    a => !a.external_id.includes('smoke')
  );
  const edges = tree?.edges ?? [];
  const artifacts = (tree?.artifacts ?? []).filter(Boolean);
  const byUuid = new Map(actors.filter(a => a.id).map(a => [String(a.id), a]));

  const memberOf = new Map<string, string[]>(); // teamExt -> personExt[]
  const playsRole = new Map<string, string>(); // personExt -> role name
  for (const e of edges) {
    const from = e.from_id ? byUuid.get(String(e.from_id)) : undefined;
    const to = e.to_id ? byUuid.get(String(e.to_id)) : undefined;
    if (!from || !to) continue;
    const fe = shortId(from.external_id);
    const te = shortId(to.external_id);
    if (e.rel === 'member_of' && to.kind === 'team' && from.kind === 'person') {
      const list = memberOf.get(te) ?? [];
      list.push(fe);
      memberOf.set(te, list);
    }
    if (
      e.rel === 'plays_role' &&
      to.kind === 'role' &&
      from.kind === 'person'
    ) {
      playsRole.set(fe, to.name);
    }
    if (e.rel === 'reports_to') {
      connectors.push({ fromExternalId: fe, toExternalId: te });
    }
  }

  const teams = actors
    .filter(a => a.kind === 'team')
    .sort((a, b) => {
      const ha = Number(a.attrs?.hierarchy ?? 99);
      const hb = Number(b.attrs?.hierarchy ?? 99);
      return ha - hb || a.name.localeCompare(b.name, 'es');
    });

  const memberPersonExts = new Set<string>();
  for (const list of memberOf.values()) {
    for (const ext of list) memberPersonExts.add(ext);
  }
  const orphans = actors.filter(
    a => a.kind === 'person' && !memberPersonExts.has(shortId(a.external_id))
  );

  const whys = artifacts.filter(a => a.kind === 'why');
  const byParent = new Map<string, typeof artifacts>();
  for (const a of artifacts) {
    if (!a.parent_id) continue;
    const list = byParent.get(String(a.parent_id)) ?? [];
    list.push(a);
    byParent.set(String(a.parent_id), list);
  }
  const whyList =
    whys.length > 0
      ? whys
      : [
          {
            id: 'fallback-why',
            external_id: 'why-tiempo',
            kind: 'why',
            body: {
              label: 'Tiempo',
              statement: 'Reducir tiempo de decisión.',
              needs_human: true,
              question: '¿SLA objetivo en horas?',
            },
          },
        ];
  const scenarios = artifacts.filter(a => a.kind === 'scenario');

  const measureCol = (kids: typeof artifacts): number => {
    let h = 0;
    for (const child of kids) {
      h += LANE_CHILD_H + SHAPE_GAP_Y;
      if (child.body?.needs_human && child.body?.question) {
        h += LANE_CHILD_H + SHAPE_GAP_Y;
      }
    }
    return Math.max(0, h - SHAPE_GAP_Y);
  };

  const stackColumn = (
    kids: typeof artifacts,
    kind: PaintRole,
    colX: number,
    topY: number,
    parentExt: string
  ): void => {
    let cy = topY;
    for (const child of kids) {
      const ce = child.external_id;
      const label = child.body?.label || kind.toUpperCase();
      shapes.push(
        box(
          {
            role: kind,
            externalId: ce,
            name: label,
            text: methodologyCardText(label, child.body?.statement, kind),
            fillColor: COLOR_PROPOSED,
            strokeStyle: 'dash',
            attrs: { statement: String(child.body?.statement ?? '') },
          },
          colX,
          cy,
          LANE_CHILD_W,
          LANE_CHILD_H
        )
      );
      connectors.push({ fromExternalId: parentExt, toExternalId: ce });
      cy += LANE_CHILD_H + SHAPE_GAP_Y;
      if (child.body?.needs_human && child.body?.question) {
        const qExt = `q-${ce}`;
        shapes.push(
          box(
            {
              role: 'question',
              externalId: qExt,
              name: 'Pregunta HITL',
              text: `❓ ${child.body.question}`,
              fillColor: COLOR_Q,
              strokeStyle: 'solid',
              attrs: { question: String(child.body.question) },
            },
            colX,
            cy,
            LANE_CHILD_W,
            LANE_CHILD_H
          )
        );
        connectors.push({ fromExternalId: ce, toExternalId: qExt });
        cy += LANE_CHILD_H + SHAPE_GAP_Y;
      }
    }
  };

  // —— Left column: EQUIPOS (+ SIN EQUIPO) ——
  let leftY = 0;
  shapes.push(
    box(
      {
        role: 'title',
        externalId: 'title-equipos',
        name: 'EQUIPOS',
        text: 'EQUIPOS',
        fillColor: COLOR_TITLE,
        strokeStyle: 'solid',
        attrs: { section: 'equipos' },
      },
      0,
      leftY,
      EQUIPOS_W,
      TITLE_H
    )
  );
  leftY += TITLE_H + SHAPE_GAP_Y;

  if (teams.length === 0) {
    const teamExt = 'gestion-admin';
    const people = [
      {
        ext: 'adrian-eguez',
        name: 'Adrian Eguez',
        attrs: {
          title: 'CEO',
          email: 'adrian@manticore-labs.cc',
          affine_user_id: '58eefc79-b154-4202-a83c-9cfe6930c165',
        } as Record<string, unknown>,
      },
      {
        ext: 'mac-adrian',
        name: 'Mac Adrian',
        attrs: { title: 'CTO', email: 'mac@manticore-labs.cc' } as Record<
          string,
          unknown
        >,
      },
    ];
    const teamH =
      people.length * MEMBER_H + Math.max(0, people.length - 1) * SHAPE_GAP_Y;
    shapes.push(
      box(
        {
          role: 'team',
          externalId: teamExt,
          name: 'Gestión y Administración',
          text: 'Gestión y\nAdministración',
          fillColor: COLOR_TEAM,
          strokeStyle: 'solid',
          attrs: {},
        },
        0,
        leftY,
        TEAM_W,
        teamH
      )
    );
    people.forEach((p, i) => {
      shapes.push(
        box(
          {
            role: 'person',
            externalId: p.ext,
            name: p.name,
            text: personCardText(p.name, p.attrs),
            fillColor: COLOR_OK,
            strokeStyle: 'solid',
            attrs: {},
          },
          TEAM_W + SHAPE_GAP_X,
          leftY + i * (MEMBER_H + SHAPE_GAP_Y),
          MEMBER_W,
          MEMBER_H
        )
      );
      connectors.push({ fromExternalId: teamExt, toExternalId: p.ext });
    });
    leftY += teamH + SECTION_GAP;
  } else {
    for (const team of teams) {
      const teamExt = shortId(team.external_id);
      const memberExts = memberOf.get(teamExt) ?? [];
      const members = memberExts
        .map(ext => actors.find(a => shortId(a.external_id) === ext))
        .filter(Boolean) as NonNullable<(typeof actors)[number]>[];
      const n = Math.max(1, members.length);
      const teamH = n * MEMBER_H + (n - 1) * SHAPE_GAP_Y;
      shapes.push(
        box(
          {
            role: 'team',
            externalId: teamExt,
            name: team.name,
            text: team.name.replace(/ y /g, '\ny '),
            fillColor: COLOR_TEAM,
            strokeStyle: 'solid',
            attrs: { hierarchy: String(team.attrs?.hierarchy ?? '') },
          },
          0,
          leftY,
          TEAM_W,
          teamH
        )
      );
      if (members.length === 0) {
        shapes.push(
          box(
            {
              role: 'person',
              externalId: `${teamExt}-vacant`,
              name: '(sin miembros)',
              text: '(sin miembros cargados)',
              fillColor: COLOR_PROPOSED,
              strokeStyle: 'dash',
              attrs: {},
            },
            TEAM_W + SHAPE_GAP_X,
            leftY,
            MEMBER_W,
            MEMBER_H
          )
        );
      } else {
        members.forEach((person, i) => {
          const pe = shortId(person.external_id);
          shapes.push(
            box(
              {
                role: 'person',
                externalId: pe,
                name: person.name,
                text: personCardText(
                  person.name,
                  person.attrs,
                  playsRole.get(pe)
                ),
                fillColor: COLOR_OK,
                strokeStyle: 'solid',
                attrs: {
                  email: attrStr(person.attrs, 'email'),
                  affine_user_id: attrStr(person.attrs, 'affine_user_id'),
                  plane_user_id: attrStr(person.attrs, 'plane_user_id'),
                  external_id: person.external_id,
                },
              },
              TEAM_W + SHAPE_GAP_X,
              leftY + i * (MEMBER_H + SHAPE_GAP_Y),
              MEMBER_W,
              MEMBER_H
            )
          );
          connectors.push({ fromExternalId: teamExt, toExternalId: pe });
        });
      }
      leftY += teamH + SECTION_GAP;
    }
  }

  if (orphans.length > 0) {
    shapes.push(
      box(
        {
          role: 'title',
          externalId: 'title-orphans',
          name: 'SIN EQUIPO',
          text: 'SIN EQUIPO',
          fillColor: COLOR_TITLE,
          strokeStyle: 'solid',
          attrs: { section: 'orphans' },
        },
        0,
        leftY,
        EQUIPOS_W,
        TITLE_H
      )
    );
    leftY += TITLE_H + SHAPE_GAP_Y;
    orphans.forEach((person, i) => {
      const pe = shortId(person.external_id);
      shapes.push(
        box(
          {
            role: 'person',
            externalId: pe,
            name: person.name,
            text: personCardText(person.name, person.attrs, playsRole.get(pe)),
            fillColor: COLOR_OK,
            strokeStyle: 'dash',
            attrs: {
              email: attrStr(person.attrs, 'email'),
              affine_user_id: attrStr(person.attrs, 'affine_user_id'),
              plane_user_id: attrStr(person.attrs, 'plane_user_id'),
              external_id: person.external_id,
            },
          },
          TEAM_W + SHAPE_GAP_X,
          leftY + i * (MEMBER_H + SHAPE_GAP_Y),
          MEMBER_W,
          MEMBER_H
        )
      );
    });
    leftY +=
      orphans.length * MEMBER_H +
      Math.max(0, orphans.length - 1) * SHAPE_GAP_Y +
      SECTION_GAP;
  }

  // —— Right of EQUIPOS: WHY1 | WHY2 | … (each with WHO/HOW/WHAT lane) ——
  const whyOriginX = EQUIPOS_W + SECTION_GAP;
  const whyCount = Math.max(1, whyList.length);
  const whyBandW =
    whyCount * WHY_LANE_W + Math.max(0, whyCount - 1) * SECTION_GAP;

  shapes.push(
    box(
      {
        role: 'title',
        externalId: 'title-why',
        name: 'WHY',
        text: 'WHY',
        fillColor: COLOR_TITLE,
        strokeStyle: 'solid',
        attrs: { section: 'why' },
      },
      whyOriginX,
      0,
      whyBandW,
      TITLE_H
    )
  );

  let whyContentBottom = TITLE_H + SHAPE_GAP_Y;
  whyList.forEach((why, wi) => {
    const whyExt = why.external_id;
    const laneX = whyOriginX + wi * (WHY_LANE_W + SECTION_GAP);
    const laneY = TITLE_H + SHAPE_GAP_Y;
    const children = why.id
      ? (byParent.get(String(why.id)) ?? [])
      : artifacts.filter(
          a =>
            a.kind !== 'why' &&
            a.kind !== 'scenario' &&
            a.external_id.includes(whyExt.replace('why-', ''))
        );
    const whoKids = children.filter(c => c.kind === 'who');
    const howKids = children.filter(c => c.kind === 'how');
    const whatKids = children.filter(c => c.kind === 'what');
    const needsQ = Boolean(why.body?.needs_human && why.body?.question);
    let laneH = Math.max(
      LANE_CHILD_H,
      measureCol(whoKids),
      measureCol(howKids),
      measureCol(whatKids)
    );
    if (needsQ) {
      laneH = Math.max(laneH, LANE_CHILD_H * 2 + SHAPE_GAP_Y);
    }

    const whyLabel = why.body?.label || 'Sin título';
    shapes.push(
      box(
        {
          role: 'why',
          externalId: whyExt,
          name: whyLabel,
          text: methodologyCardText(whyLabel, why.body?.statement, 'why'),
          fillColor: COLOR_PROPOSED,
          strokeStyle: 'dash',
          attrs: { statement: String(why.body?.statement ?? '') },
        },
        laneX,
        laneY,
        WHY_CARD_W,
        laneH
      )
    );

    const colX0 = laneX + WHY_CARD_W + SHAPE_GAP_X;
    stackColumn(whoKids, 'who', colX0, laneY, whyExt);
    stackColumn(howKids, 'how', colX0 + LANE_CHILD_W + COL_GAP, laneY, whyExt);
    stackColumn(
      whatKids,
      'what',
      colX0 + (LANE_CHILD_W + COL_GAP) * 2,
      laneY,
      whyExt
    );

    if (needsQ) {
      const qExt = `q-${whyExt}`;
      shapes.push(
        box(
          {
            role: 'question',
            externalId: qExt,
            name: 'Pregunta HITL',
            text: `❓ ${why.body?.question}`,
            fillColor: COLOR_Q,
            strokeStyle: 'solid',
            attrs: { question: String(why.body?.question ?? '') },
          },
          colX0,
          laneY + laneH - LANE_CHILD_H,
          LANE_CHILD_W * 2 + COL_GAP,
          LANE_CHILD_H
        )
      );
      connectors.push({ fromExternalId: whyExt, toExternalId: qExt });
    }

    whyContentBottom = Math.max(whyContentBottom, laneY + laneH);
  });

  // —— SCENARIOS under the taller of left / why band ——
  let belowY = Math.max(leftY, whyContentBottom) + SECTION_GAP;
  const fullW = EQUIPOS_W + SECTION_GAP + whyBandW;
  if (scenarios.length > 0) {
    shapes.push(
      box(
        {
          role: 'title',
          externalId: 'title-scenarios',
          name: 'SCENARIOS',
          text: 'SCENARIOS',
          fillColor: COLOR_TITLE,
          strokeStyle: 'solid',
          attrs: { section: 'scenarios' },
        },
        0,
        belowY,
        fullW,
        TITLE_H
      )
    );
    belowY += TITLE_H + SHAPE_GAP_Y;
    const cols = Math.min(3, Math.max(1, scenarios.length));
    const scenW = Math.floor((fullW - COL_GAP * (cols - 1)) / cols);
    scenarios.forEach((sc, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const label = sc.body?.label || sc.external_id;
      shapes.push(
        box(
          {
            role: 'scenario',
            externalId: sc.external_id,
            name: label,
            text: methodologyCardText(label, sc.body?.statement, 'scenario'),
            fillColor: COLOR_SCENARIO,
            strokeStyle: 'solid',
            attrs: { statement: String(sc.body?.statement ?? '') },
          },
          col * (scenW + COL_GAP),
          belowY + row * (LANE_CHILD_H + SHAPE_GAP_Y),
          scenW,
          LANE_CHILD_H
        )
      );
      if (sc.parent_id) {
        const parent = artifacts.find(
          a => String(a.id) === String(sc.parent_id)
        );
        if (parent) {
          connectors.push({
            fromExternalId: parent.external_id,
            toExternalId: sc.external_id,
          });
        }
      }
    });
  }

  // Place whole map to the left of foreign content (notes/images/shapes).
  if (foreignLeft != null) {
    const bounds = planBounds(shapes);
    const dx = foreignLeft - FOREIGN_GAP - bounds.maxX;
    shiftShapes(shapes, dx, 0);
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
