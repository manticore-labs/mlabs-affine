/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalPageUrl,
  changeLabel,
  emptyWhy,
  FOREIGN_GAP,
  foreignMinX,
  humanBridgeError,
  indexingNotice,
  isDocumentIndexing,
  openRequestBody,
  type PageDoc,
  paintPlan,
  paintPlanFromTree,
  personCardText,
  planBounds,
  readDatasetId,
  readWhy,
  runOnStore,
  statusLabel,
  syncSummaryLabel,
  uploadRejection,
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
  assert.ok(
    tree.connectors.some(
      c =>
        c.fromExternalId === 'what-tiempo' && c.toExternalId === 'scenario-drag'
    )
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
