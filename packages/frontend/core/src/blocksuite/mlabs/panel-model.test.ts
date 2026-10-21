/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalPageUrl,
  cardHeightForText,
  cardWidthForText,
  changeLabel,
  CHAR_W,
  emptyWhy,
  FOREIGN_GAP,
  foreignMinX,
  humanBridgeError,
  indexingNotice,
  isDocumentIndexing,
  LINE_H,
  openRequestBody,
  type PageDoc,
  paintPlan,
  paintPlanFromTree,
  personCardText,
  planBounds,
  readDatasetId,
  readWhy,
  runOnStore,
  SHAPE_PAD,
  statusLabel,
  syncSummaryLabel,
  uploadRejection,
  visualLen,
  whyRejection,
  writeDatasetId,
  writeWhy,
} from './panel-model.ts';

test('the dataset id is stored on the page document', () => {
  const doc = memoryDoc();
  assert.equal(readDatasetId(doc), undefined);
  let transacted = false;
  doc.transact = fn => {
    transacted = true;
    fn();
  };
  writeDatasetId(doc, '68080011-1111-4111-8111-111111111111');
  assert.equal(transacted, true);
  assert.equal(readDatasetId(doc), '68080011-1111-4111-8111-111111111111');
});

test('the open body carries the page, the url and the stored id', () => {
  assert.equal(
    openRequestBody({
      pageId: 'page-1',
      pageUrl: 'https://affine-pampa.manticore-labs.cc/workspace/w/page-1',
      datasetId: '68080011-1111-4111-8111-111111111111',
    }),
    '{"command":"mlabs-framework","page_id":"page-1","page_url":"https://affine-pampa.manticore-labs.cc/workspace/w/page-1","dataset_id":"68080011-1111-4111-8111-111111111111"}'
  );
  assert.equal(canonicalPageUrl('javascript:alert(1)'), undefined);
});

test('upload rejection covers empty, huge and zip files', () => {
  assert.equal(uploadRejection('', 10), 'Nombre de archivo inválido.');
  assert.equal(uploadRejection('a.pdf', 0), 'El archivo está vacío.');
  assert.equal(
    uploadRejection('a.pdf', 16 * 1024 * 1024),
    'Supera el tope de 15 MB.'
  );
  assert.match(uploadRejection('a.zip', 10) ?? '', /Dify no acepta/);
  assert.equal(uploadRejection('a.pdf', 10), null);
});

test('document status labels stay short', () => {
  assert.equal(statusLabel('completed'), 'Listo');
  assert.equal(statusLabel('indexing'), 'Indexando');
  assert.equal(statusLabel('error'), 'Error');
  assert.equal(isDocumentIndexing('indexing'), true);
  assert.equal(isDocumentIndexing('waiting'), true);
  assert.equal(isDocumentIndexing('completed'), false);
});

test('bridge errors are shown in Spanish', () => {
  assert.match(humanBridgeError('dify_unconfigured'), /Dify/);
  assert.match(humanBridgeError('bad_request', 'x'), /dataset/);
});

test('indexing notice covers unfinished documents', () => {
  assert.equal(indexingNotice([]), null);
  assert.match(
    indexingNotice([{ id: '1', name: 'a', indexing_status: 'indexing' }]) ?? '',
    /indexa/i
  );
  assert.equal(
    indexingNotice([{ id: '1', name: 'a', indexing_status: 'completed' }]),
    null
  );
  assert.match(
    syncSummaryLabel({ ready: 1, indexing: 0, error: 0 }),
    /Listo 1/
  );
  assert.equal(changeLabel('new'), 'Nueva');
});

test('the WHY contract is stored on the page document', () => {
  const doc = memoryDoc();
  assert.equal(whyRejection(emptyWhy()), 'Escribí el objetivo de negocio.');
  const draft = {
    statement: 'Bajar horas',
    indicator_type: 'leading' as const,
    from: '12',
    to: '8',
    unit: 'horas/semana',
    okr_alignment: 'OKR Q4',
  };
  assert.equal(whyRejection(draft), null);
  writeWhy(doc, draft);
  const stored = readWhy(doc);
  assert.equal(stored.statement, 'Bajar horas');
  assert.equal(stored.from, '12');
  assert.equal(stored.to, '8');
  assert.equal(stored.unit, 'horas/semana');
  assert.equal(stored.okr_alignment, 'OKR Q4');
});

test('bands: EQUIPOS | WHY | WHO | HOW | WHAT + foreign gap', () => {
  assert.equal(foreignMinX([]), null);
  const empty = paintPlan(null);
  assert.ok(empty.shapes.some(s => s.role === 'title' && s.name === 'EQUIPOS'));
  for (const name of ['WHY', 'WHO', 'HOW', 'WHAT']) {
    assert.ok(
      empty.shapes.some(s => s.role === 'title' && s.name === name),
      `missing title ${name}`
    );
  }
  assert.ok(empty.shapes.some(s => s.role === 'team'));
  assert.ok(empty.shapes.some(s => s.role === 'why'));
  assert.match(
    personCardText('Ada', { email: 'a@b.c', title: 'CEO' }),
    /📧 a@b.c/
  );

  const tree = paintPlanFromTree(
    {
      actors: [
        {
          id: 't1',
          external_id: 'mlabs:gestion-admin',
          kind: 'team',
          name: 'Gestión y Administración',
          status: 'active',
          attrs: { hierarchy: 1 },
        },
        {
          id: 'p1',
          external_id: 'mlabs:adrian-eguez',
          kind: 'person',
          name: 'Adrian Eguez',
          status: 'active',
          attrs: {
            email: 'adrian@manticore-labs.cc',
            affine_user_id: 'aff-1',
            title: 'CEO',
          },
        },
        {
          id: 'p2',
          external_id: 'mlabs:mac-adrian',
          kind: 'person',
          name: 'Mac Adrian',
          status: 'active',
          attrs: { email: 'mac@manticore-labs.cc', title: 'CTO' },
        },
      ],
      edges: [
        { from_id: 'p1', to_id: 't1', rel: 'member_of' },
        { from_id: 'p2', to_id: 't1', rel: 'member_of' },
      ],
      artifacts: [
        {
          id: 'w1',
          external_id: 'why-tiempo',
          kind: 'why',
          body: {
            label: 'WHY · Tiempo',
            statement: 'Reducir tiempo',
            needs_human: true,
            question: '¿SLA?',
          },
        },
        {
          id: 'who1',
          external_id: 'who-tiempo',
          kind: 'who',
          parent_id: 'w1',
          body: { label: 'Mesa', statement: 'Owner + Gestor' },
        },
        {
          id: 'how1',
          external_id: 'how-tiempo',
          kind: 'how',
          parent_id: 'w1',
          body: { label: 'Cola', statement: 'Registry' },
        },
        {
          id: 'what1',
          external_id: 'what-tiempo',
          kind: 'what',
          parent_id: 'w1',
          body: { label: 'Lienzo', statement: 'UI' },
        },
        {
          id: 'sc1',
          external_id: 'scenario-drag',
          kind: 'scenario',
          parent_id: 'what1',
          body: {
            label: 'Drag ticket',
            statement: 'Feature: board\nScenario: drag',
          },
        },
      ],
    },
    null
  );
  const titles = tree.shapes.filter(s => s.role === 'title');
  const titleXs = Object.fromEntries(
    titles.map(t => [t.name, Number(t.xywh.match(/^\[(-?\d+)/)?.[1])])
  );
  assert.equal(titleXs.EQUIPOS, 0);
  assert.ok(titleXs.WHY! > titleXs.EQUIPOS!);
  assert.ok(titleXs.WHO! > titleXs.WHY!);
  assert.ok(titleXs.HOW! > titleXs.WHO!);
  assert.ok(titleXs.WHAT! > titleXs.HOW!);
  assert.ok(titleXs.SCENARIOS! > titleXs.WHAT!);

  const who = tree.shapes.find(s => s.role === 'who');
  const how = tree.shapes.find(s => s.role === 'how');
  const what = tree.shapes.find(s => s.role === 'what');
  assert.ok(who && how && what);
  const why = tree.shapes.find(s => s.role === 'why');
  assert.ok(why);
  assert.equal(why!.text.startsWith('WHY'), false);

  const scen = tree.shapes.find(s => s.role === 'scenario');
  assert.ok(scen);
  assert.match(scen!.text, /↳ WHAT:/);
  const whatCard = tree.shapes.find(s => s.role === 'what');
  assert.ok(whatCard);
  const scenX = Number(scen!.xywh.match(/^\[(-?\d+)/)?.[1]);
  const whatX = Number(whatCard!.xywh.match(/^\[(-?\d+)/)?.[1]);
  assert.ok(scenX > whatX);
  assert.ok(
    tree.connectors.some(
      c =>
        c.fromExternalId === 'what-tiempo' && c.toExternalId === 'scenario-drag'
    )
  );
  // Impact Mapping chain: WHY→WHO→HOW→WHAT (not WHY→HOW/WHAT)
  assert.ok(
    tree.connectors.some(
      c => c.fromExternalId === 'why-tiempo' && c.toExternalId === 'who-tiempo'
    )
  );
  assert.ok(
    tree.connectors.some(
      c => c.fromExternalId === 'who-tiempo' && c.toExternalId === 'how-tiempo'
    )
  );
  assert.ok(
    tree.connectors.some(
      c => c.fromExternalId === 'how-tiempo' && c.toExternalId === 'what-tiempo'
    )
  );
  assert.equal(
    tree.connectors.some(
      c => c.fromExternalId === 'why-tiempo' && c.toExternalId === 'how-tiempo'
    ),
    false
  );
  const whyFill = tree.shapes.find(s => s.role === 'why')?.fillColor;
  const whoFill = tree.shapes.find(s => s.role === 'who')?.fillColor;
  const howFill = tree.shapes.find(s => s.role === 'how')?.fillColor;
  const whatFill = tree.shapes.find(s => s.role === 'what')?.fillColor;
  const scenFill = tree.shapes.find(s => s.role === 'scenario')?.fillColor;
  assert.ok(whyFill && whoFill && howFill && whatFill && scenFill);
  assert.equal(
    new Set([whyFill, whoFill, howFill, whatFill, scenFill]).size,
    5
  );
  // SCENARIOS must not reuse teal lane fills
  assert.ok(![howFill, whatFill].includes(scenFill!));
  const teamFillColor = tree.shapes.find(s => s.role === 'team')?.fillColor;
  assert.ok(teamFillColor);
  assert.ok(
    ![whyFill, whoFill, howFill, whatFill, scenFill].includes(teamFillColor!)
  );

  const shifted = paintPlanFromTree(
    {
      actors: [
        {
          id: 't1',
          external_id: 'mlabs:t',
          kind: 'team',
          name: 'T',
          attrs: { hierarchy: 1 },
        },
      ],
      edges: [],
      artifacts: [
        {
          id: 'w1',
          external_id: 'why-a',
          kind: 'why',
          body: { label: 'A', statement: 'a' },
        },
      ],
    },
    8000
  );
  const bounds = planBounds(shifted.shapes);
  assert.equal(bounds.maxX + FOREIGN_GAP, 8000);
});

test('card sizing covers long Gherkin + emoji without underestimating', () => {
  assert.ok(visualLen('❓ SLA?') > 'SLA?'.length);
  assert.equal(CHAR_W >= 9, true);
  assert.equal(LINE_H >= 22, true);

  const short = 'Mesa';
  const wShort = cardWidthForText(short, 200, 420);
  assert.ok(wShort >= 200);
  assert.ok(wShort <= 420);

  const gherkin = [
    'Feature: board drag ticket across columns',
    'Scenario: agent moves card to Doing',
    'Given a ticket in Backlog with owner assigned',
    'When the agent drags it onto the Doing column',
    'Then the status updates and SLA clock starts',
    '↳ WHAT: Lienzo',
  ].join('\n');
  const w = cardWidthForText(gherkin, 200, 420);
  const h = cardHeightForText(gherkin, w, 128);
  const lines = gherkin.split('\n').reduce((acc, line) => {
    const inner = Math.max(40, w - SHAPE_PAD[1] * 2);
    const cpl = Math.max(8, Math.floor(inner / CHAR_W));
    return acc + Math.max(1, Math.ceil(visualLen(line) / cpl));
  }, 0);
  const minExpected = SHAPE_PAD[0] * 2 + lines * LINE_H + 8;
  assert.ok(h >= minExpected, `h=${h} < expected ${minExpected}`);
  assert.ok(h > 128, 'long Gherkin must grow past LANE_CHILD_H');

  const q = '❓ ¿Confirmamos el SLA de respuesta en <15m para P1?';
  const qw = cardWidthForText(q, 200, 420);
  const qh = cardHeightForText(q, qw, 128);
  assert.ok(qh >= cardHeightForText(q.replace('❓ ', ''), qw, 128));
});

test('distinct team fills cycle across squads', () => {
  const tree = paintPlanFromTree(
    {
      actors: [
        {
          id: 't1',
          external_id: 'mlabs:t1',
          kind: 'team',
          name: 'Alpha',
          attrs: { hierarchy: 1 },
        },
        {
          id: 't2',
          external_id: 'mlabs:t2',
          kind: 'team',
          name: 'Beta',
          attrs: { hierarchy: 2 },
        },
        {
          id: 't3',
          external_id: 'mlabs:t3',
          kind: 'team',
          name: 'Gamma',
          attrs: { hierarchy: 3 },
        },
      ],
      edges: [],
      artifacts: [],
    },
    null
  );
  const fills = tree.shapes
    .filter(s => s.role === 'team')
    .map(s => s.fillColor);
  assert.equal(fills.length, 3);
  assert.equal(new Set(fills).size, 3);
});

test('store.transact keeps its this when painting', () => {
  let ran = false;
  const store = {
    _shouldTransact: true,
    transact(fn: () => void, flag = this._shouldTransact) {
      assert.equal(flag, true);
      fn();
    },
  };
  runOnStore(store, () => {
    ran = true;
  });
  assert.equal(ran, true);
});

function memoryDoc(): PageDoc {
  const values = new Map<string, string>();
  return {
    getMap(name: string) {
      if (name !== 'mlabs')
        return { get: () => undefined, set: () => undefined };
      return {
        get: (k: string) => values.get(k),
        set: (k: string, v: string) => values.set(k, v),
      };
    },
  } as PageDoc;
}
