/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchFeedbackExternalId, normalizeExtId } from './panel-model';

test('normalizeExtId strips mlabs: prefix once', () => {
  assert.equal(normalizeExtId('mlabs:why-1'), 'why-1');
  assert.equal(normalizeExtId('why-1'), 'why-1');
});

test('matchFeedbackExternalId matches full vs short ids', () => {
  const nodes = [
    { externalId: 'valentina-morales' },
    { externalId: 'why-pulse' },
    { externalId: 'scenario-login' },
  ];
  assert.equal(
    matchFeedbackExternalId(nodes, 'mlabs:scenario-login'),
    'scenario-login'
  );
  assert.equal(matchFeedbackExternalId(nodes, 'why-pulse'), 'why-pulse');
  assert.equal(
    matchFeedbackExternalId(nodes, 'mlabs:valentina-morales'),
    'valentina-morales'
  );
  assert.equal(matchFeedbackExternalId(nodes, 'missing'), undefined);
  assert.equal(matchFeedbackExternalId(nodes, undefined), undefined);
});
