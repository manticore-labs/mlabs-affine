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
  isOwnNode,
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

test('lane layout: EQUIPOS left + WHYs horizontal to the right', () => {
  assert.equal(foreignMinX([]), null);
  const empty = paintPlan(null);
  assert.ok(empty.shapes.some(s => s.role === 'title' && s.name === 'EQUIPOS'));
  assert.ok(empty.shapes.some(s => s.role === 'title' && s.name === 'WHY'));
  assert.ok(empty.shapes.some(s => s.role === 'team'));
  assert.ok(empty.shapes.some(s => s.role === 'person'));
  assert.ok(empty.shapes.some(s => s.role === 'why'));
  assert.ok(
    empty.shapes.some(s => s.role === 'question' || s.text.startsWith('❓'))
  );
  assert.match(
    personCardText('Ada', { email: 'a@b.c', title: 'CEO' }),
    /📧 a@b.c/
  );
  assert.equal(isOwnNode({ id: 'x', role: 'team' }), true);
  assert.equal(isOwnNode({ id: 'note-1' }), false);

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
          id: 'w2',
          external_id: 'why-calidad',
          kind: 'why',
          body: {
            label: 'Calidad',
            statement: 'Menos bugs',
            needs_human: false,
          },
        },
        {
          id: 'who1',
          external_id: 'who-tiempo',
          kind: 'who',
          parent_id: 'w1',
          body: { label: 'WHO', statement: 'Owner + Gestor' },
        },
        {
          id: 'how1',
          external_id: 'how-tiempo',
          kind: 'how',
          parent_id: 'w1',
          body: { label: 'HOW', statement: 'Registry' },
        },
        {
          id: 'what1',
          external_id: 'what-tiempo',
          kind: 'what',
          parent_id: 'w1',
          body: { label: 'WHAT', statement: 'Lienzo' },
        },
      ],
    },
    null
  );
  const team = tree.shapes.find(s => s.role === 'team');
  assert.ok(team);
  // 2 members → height = 2*168 + 20; equipos start at x=0
  assert.match(team!.xywh, /^\[0,.*,160,356\]/);
  assert.ok(tree.shapes.some(s => s.text.includes('📧 adrian@')));
  assert.ok(tree.shapes.some(s => s.role === 'question'));
  const whyCards = tree.shapes.filter(s => s.role === 'why');
  assert.equal(whyCards.length, 2);
  assert.equal(whyCards[0]!.text.startsWith('WHY'), false);
  // Second WHY must sit to the right of the first
  const x1 = Number(whyCards[0]!.xywh.match(/^\[(-?\d+)/)?.[1]);
  const x2 = Number(whyCards[1]!.xywh.match(/^\[(-?\d+)/)?.[1]);
  assert.ok(x2 > x1);
  // WHY band starts to the right of EQUIPOS column
  assert.ok(x1 > 160);
  assert.ok(tree.connectors.some(c => c.fromExternalId === 'gestion-admin'));

  // Foreign content: map right edge + FOREIGN_GAP == foreignLeft
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
    5000
  );
  const bounds = planBounds(shifted.shapes);
  assert.equal(bounds.maxX + FOREIGN_GAP, 5000);
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
