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
export const MEMBER_W = 260;
export const MEMBER_H = 128;
export const TEAM_W = 150;
export const LANE_CHILD_W = 200;
export const LANE_CHILD_H = 110;
export const TITLE_H = 44;
export const SHAPE_GAP_Y = 16;
export const SHAPE_GAP_X = 24;
export const SECTION_GAP = 48;
export const COL_GAP = 24;

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
  | 'question';

export type PaintShape = {
  role: PaintRole;
  externalId: string;
  name: string;
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

export function shapeCaption(label: string, statement?: string): string {
  const body = (statement ?? '').trim();
  if (!body) return label;
  const clipped = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return `${label}\n${clipped}`;
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
  'question',
  'connector',
]);
const OWN_TEXT = new Set<string>(['EQUIPOS', 'WHY']);
const OWN_EXTERNAL = new Set<string>(['title-equipos', 'title-why']);

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
      /* ignore */
    }
  }
  if (xs.length === 0) return null;
  return Math.min(...xs);
}

function box(
  row: Omit<PaintShape, 'xywh'>,
  x: number,
  y: number,
  w: number,
  h: number
): PaintShape {
  return { ...row, xywh: `[${x},${y},${w},${h}]` };
}

/** Default / fallback + real tree lane layout. */
export function paintPlan(foreignLeft: number | null): PaintPlan {
  return paintPlanFromTree(null, foreignLeft);
}

export function paintPlanFromTree(
  tree: RegistryTree | null,
  foreignLeft: number | null
): PaintPlan {
  const originX = foreignLeft == null ? 0 : foreignLeft - 980;
  const shapes: PaintShape[] = [];
  const connectors: PaintConnector[] = [];
  let y = 0;

  const actors = (tree?.actors ?? []).filter(
    a => !a.external_id.includes('smoke')
  );
  const edges = tree?.edges ?? [];
  const artifacts = (tree?.artifacts ?? []).filter(Boolean);
  const byUuid = new Map(actors.filter(a => a.id).map(a => [String(a.id), a]));

  const memberOf = new Map<string, string[]>(); // teamExt -> personExt[]
  const playsRole = new Map<string, string>(); // personExt -> role name
  const partOf = new Map<string, string>(); // team -> parent team
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
    if (e.rel === 'part_of' && from.kind === 'team' && to.kind === 'team') {
      partOf.set(fe, te);
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

  // —— EQUIPOS ——
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
      originX,
      y,
      TEAM_W + SHAPE_GAP_X + MEMBER_W,
      TITLE_H
    )
  );
  y += TITLE_H + SHAPE_GAP_Y;

  if (teams.length === 0) {
    // fallback mini lane
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
        originX,
        y,
        TEAM_W,
        teamH
      )
    );
    people.forEach((p, i) => {
      const py = y + i * (MEMBER_H + SHAPE_GAP_Y);
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
          originX + TEAM_W + SHAPE_GAP_X,
          py,
          MEMBER_W,
          MEMBER_H
        )
      );
      connectors.push({ fromExternalId: teamExt, toExternalId: p.ext });
    });
    y += teamH + SECTION_GAP;
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
          originX,
          y,
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
            originX + TEAM_W + SHAPE_GAP_X,
            y,
            MEMBER_W,
            MEMBER_H
          )
        );
      } else {
        members.forEach((person, i) => {
          const pe = shortId(person.external_id);
          const py = y + i * (MEMBER_H + SHAPE_GAP_Y);
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
              originX + TEAM_W + SHAPE_GAP_X,
              py,
              MEMBER_W,
              MEMBER_H
            )
          );
          connectors.push({ fromExternalId: teamExt, toExternalId: pe });
        });
      }
      y += teamH + SECTION_GAP;
    }
  }

  // —— WHY lanes ——
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
      originX,
      y,
      TEAM_W + SHAPE_GAP_X + LANE_CHILD_W * 3 + COL_GAP * 2,
      TITLE_H
    )
  );
  y += TITLE_H + SHAPE_GAP_Y;

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
              label: 'WHY · Tiempo',
              statement: 'Reducir tiempo de decisión.',
              needs_human: true,
              question: '¿SLA objetivo en horas?',
            },
          },
        ];

  for (const why of whyList) {
    const whyExt = why.external_id;
    const children = why.id
      ? (byParent.get(String(why.id)) ?? [])
      : artifacts.filter(
          a =>
            a.kind !== 'why' &&
            a.external_id.includes(whyExt.replace('why-', ''))
        );
    const ordered = (['who', 'how', 'what'] as const)
      .map(k => children.find(c => c.kind === k))
      .filter(Boolean) as typeof artifacts;
    const needsQ = Boolean(why.body?.needs_human && why.body?.question);
    const childRows = ordered.length + (needsQ ? 1 : 0);
    const laneH = Math.max(
      LANE_CHILD_H,
      Math.max(1, childRows || 1) * LANE_CHILD_H +
        Math.max(0, (childRows || 1) - 1) * SHAPE_GAP_Y
    );

    shapes.push(
      box(
        {
          role: 'why',
          externalId: whyExt,
          name: why.body?.label || 'WHY',
          text: shapeCaption(why.body?.label || 'WHY', why.body?.statement),
          fillColor: COLOR_PROPOSED,
          strokeStyle: 'dash',
          attrs: { statement: String(why.body?.statement ?? '') },
        },
        originX,
        y,
        TEAM_W + 40,
        laneH
      )
    );

    let cx = originX + TEAM_W + 40 + SHAPE_GAP_X;
    ordered.forEach((child, i) => {
      const ce = child.external_id;
      shapes.push(
        box(
          {
            role: child.kind as PaintRole,
            externalId: ce,
            name: child.body?.label || child.kind.toUpperCase(),
            text: shapeCaption(
              child.body?.label || child.kind.toUpperCase(),
              child.body?.statement
            ),
            fillColor: COLOR_PROPOSED,
            strokeStyle: 'dash',
            attrs: { statement: String(child.body?.statement ?? '') },
          },
          cx + i * (LANE_CHILD_W + COL_GAP),
          y,
          LANE_CHILD_W,
          LANE_CHILD_H
        )
      );
      connectors.push({ fromExternalId: whyExt, toExternalId: ce });
    });

    if (needsQ) {
      const qExt = `q-${whyExt}`;
      const qy = y + (ordered.length > 0 ? LANE_CHILD_H + SHAPE_GAP_Y : 0);
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
          cx,
          qy,
          LANE_CHILD_W * 2 + COL_GAP,
          LANE_CHILD_H
        )
      );
      connectors.push({ fromExternalId: whyExt, toExternalId: qExt });
    }

    y += laneH + SECTION_GAP;
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
