/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFeedbackNodes,
  matchFeedbackExternalId,
  normalizeExtId,
  type RegistryTree,
} from './panel-model';

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

test('matchFeedbackExternalId maps canvas q-* HITL card to itself when listed', () => {
  const nodes = [
    { externalId: 'what-toc' },
    { externalId: 'q-what-toc' },
    { externalId: 'valentina-morales' },
  ];
  assert.equal(matchFeedbackExternalId(nodes, 'q-what-toc'), 'q-what-toc');
});

test('matchFeedbackExternalId falls back q-* to parent when question missing', () => {
  const nodes = [
    { externalId: 'what-toc' },
    { externalId: 'valentina-morales' },
  ];
  assert.equal(matchFeedbackExternalId(nodes, 'q-what-toc'), 'what-toc');
  assert.equal(matchFeedbackExternalId(nodes, 'mlabs:q-what-toc'), 'what-toc');
});

test('buildFeedbackNodes includes HITL questions as q-<parent>', () => {
  const tree: RegistryTree = {
    actors: [
      {
        external_id: 'mlabs:valentina-morales',
        kind: 'person',
        name: 'Valentina Morales',
      },
    ],
    artifacts: [
      {
        external_id: 'what-toc',
        kind: 'what',
        body: {
          label: 'TOC filtrada',
          statement: 'lista curada',
          needs_human: true,
          question:
            '¿TOC filtrada completa o lista curada de 12 artículos onboarding?',
        },
      },
      {
        external_id: 'how-plain',
        kind: 'how',
        body: { label: 'Plain how', statement: 'no hitl' },
      },
    ],
  };
  const nodes = buildFeedbackNodes(tree);
  assert.ok(nodes.some(n => n.externalId === 'valentina-morales'));
  assert.ok(nodes.some(n => n.externalId === 'what-toc'));
  const q = nodes.find(n => n.externalId === 'q-what-toc');
  assert.ok(q);
  assert.equal(q?.kind, 'question');
  assert.match(q?.label ?? '', /TOC filtrada/);
  assert.equal(nodes.filter(n => n.externalId === 'how-plain').length, 1);
  assert.ok(!nodes.some(n => n.externalId === 'q-how-plain'));
});
