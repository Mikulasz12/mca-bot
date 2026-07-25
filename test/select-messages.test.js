import assert from 'node:assert/strict';
import test from 'node:test';

import { selectStarterAndReplies } from '../src/scan/select-messages.js';

const message = (id) => ({ id, content: id });

test('sorts messages chronologically, removes the starter, and keeps the first five replies', () => {
  const starter = message('100000000000000000');
  const messages = [
    message('100000000000000006'),
    starter,
    message('100000000000000002'),
    message('100000000000000005'),
    message('100000000000000001'),
    message('100000000000000004'),
    message('100000000000000003'),
  ];

  const result = selectStarterAndReplies(starter, messages);

  assert.equal(result.starter, starter);
  assert.deepEqual(
    result.replies.map(({ id }) => id),
    [
      '100000000000000001',
      '100000000000000002',
      '100000000000000003',
      '100000000000000004',
      '100000000000000005',
    ],
  );
});

test('keeps all replies when fewer than the limit exist', () => {
  const starter = message('100000000000000000');
  const result = selectStarterAndReplies(starter, [message('100000000000000002'), message('100000000000000001')]);

  assert.deepEqual(result.replies.map(({ id }) => id), ['100000000000000001', '100000000000000002']);
});

test('supports a custom reply limit', () => {
  const starter = message('100000000000000000');
  const result = selectStarterAndReplies(
    starter,
    [message('100000000000000001'), message('100000000000000002')],
    1,
  );

  assert.deepEqual(result.replies.map(({ id }) => id), ['100000000000000001']);
});
