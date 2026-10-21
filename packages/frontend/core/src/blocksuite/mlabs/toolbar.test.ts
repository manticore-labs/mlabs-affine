/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as Y from 'yjs';

import { readSelectedExternalId } from './toolbar-attrs';

test('readSelectedExternalId reads Y.Map mlabsAttrs', () => {
  const doc = new Y.Doc();
  const yMap = doc.getMap('el');
  const attrs = new Y.Map<string>();
  yMap.set('mlabsAttrs', attrs);
  attrs.set('externalId', 'mlabs:scenario-login');
  attrs.set('role', 'scenario');
  assert.equal(readSelectedExternalId([{ yMap }]), 'mlabs:scenario-login');
});

test('readSelectedExternalId reads plain object mlabsAttrs', () => {
  assert.equal(
    readSelectedExternalId([
      { mlabsAttrs: { externalId: 'valentina-morales', role: 'person' } },
    ]),
    'valentina-morales'
  );
});

test('readSelectedExternalId reads serialize() payload', () => {
  assert.equal(
    readSelectedExternalId([
      {
        serialize: () => ({
          mlabsAttrs: { externalId: 'why-pulse', role: 'why' },
        }),
      },
    ]),
    'why-pulse'
  );
});

test('readSelectedExternalId returns undefined when missing', () => {
  const doc = new Y.Doc();
  assert.equal(readSelectedExternalId([{ yMap: doc.getMap('el') }]), undefined);
  assert.equal(readSelectedExternalId([]), undefined);
});

test('readSelectedExternalId reads HITL q-* cards', () => {
  assert.equal(
    readSelectedExternalId([
      {
        mlabsAttrs: {
          externalId: 'q-what-toc',
          role: 'question',
          question: '¿TOC filtrada?',
        },
      },
    ]),
    'q-what-toc'
  );
});
