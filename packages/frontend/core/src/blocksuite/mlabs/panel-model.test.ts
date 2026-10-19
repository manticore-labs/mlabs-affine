import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalPageUrl,
  changeLabel,
  emptyWhy,
  humanBridgeError,
  indexingNotice,
  isDocumentIndexing,
  openRequestBody,
  readDatasetId,
  readWhy,
  statusLabel,
  syncSummaryLabel,
  uploadRejection,
  whyRejection,
  writeDatasetId,
  writeWhy,
  type PageDoc,
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

test('upload checks match the bridge rules', () => {
  assert.equal(uploadRejection('nota.txt', 4), null);
  assert.equal(
    uploadRejection('mlabs-page.txt', 4),
    'Ese archivo lo reserva el vínculo de la página.'
  );
  assert.match(uploadRejection('paquete.zip', 4) ?? '', /no acepta/);
  assert.match(uploadRejection('grande.pdf', 15 * 1024 * 1024 + 1) ?? '', /15 MB/);
});

test('bridge errors are shown in Spanish', () => {
  assert.match(humanBridgeError('bad_request'), /dataset/);
  assert.match(humanBridgeError('bad_type'), /no acepta/);
  assert.equal(statusLabel('completed'), 'Listo');
  assert.equal(statusLabel('indexing'), 'Indexando');
});

test('indexing notice covers unfinished documents', () => {
  assert.equal(isDocumentIndexing('indexing'), true);
  assert.equal(isDocumentIndexing('completed'), false);
  assert.equal(
    indexingNotice([{ id: '1', name: 'a.pdf', indexing_status: 'completed', error: null }]),
    null
  );
  assert.match(
    indexingNotice([{ id: '1', name: 'a.pdf', indexing_status: 'indexing', error: null }]) ??
      '',
    /a\.pdf/
  );
  assert.equal(
    syncSummaryLabel({ ready: 1, indexing: 2, error: 0, total: 3 }),
    'Listo 1 · Indexando 2 · Error 0 (total 3).'
  );
  assert.equal(
    syncSummaryLabel({
      ready: 1,
      indexing: 0,
      error: 0,
      total: 1,
      new: 0,
      modified: 1,
      unchanged: 0,
      removed: 0,
    }),
    'Nuevas 0 · Modificadas 1 · Iguales 0 · Quitadas 0 · Listo 1 · Indexando 0 · Error 0.'
  );
  assert.equal(changeLabel('new'), 'Nueva');
  assert.equal(changeLabel('modified'), 'Modificada');
});

test('the WHY contract is stored on the page document', () => {
  const doc = memoryDoc();
  assert.equal(whyRejection(emptyWhy()), 'Escribí el objetivo de negocio.');
  const draft = {
    statement: '  Bajar el costo de permanencia  ',
    indicator_type: 'leading' as const,
    from: '12',
    to: '8',
    unit: 'horas/semana',
    okr_alignment: ' OKR Q4 ',
  };
  assert.equal(whyRejection(draft), null);
  assert.match(whyRejection({ ...draft, from: 'no' }) ?? '', /números/);
  writeWhy(doc, draft);
  const stored = readWhy(doc);
  assert.equal(stored.statement, 'Bajar el costo de permanencia');
  assert.equal(stored.indicator_type, 'leading');
  assert.equal(stored.from, '12');
  assert.equal(stored.to, '8');
  assert.equal(stored.unit, 'horas/semana');
  assert.equal(stored.okr_alignment, 'OKR Q4');
});

function memoryDoc(): PageDoc {
  const values = new Map<string, string>();
  return {
    getMap: () => ({
      get: key => values.get(key),
      set: (key, value) => values.set(key, value),
    }),
  };
}
