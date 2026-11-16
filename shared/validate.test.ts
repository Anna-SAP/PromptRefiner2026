import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITS, TARGET_MODELS } from './protocol';
import { validateRefineRequest } from './validate';

const PNG = { mediaType: 'image/png', data: 'iVBORw0KGgo=' };
const SESSION = { originalPrompt: 'Write a haiku', analysis: 'Tightened.', refinedPrompt: 'Write a haiku about rain.' };

function messageOf(body: unknown): string {
  const result = validateRefineRequest(body);
  assert.equal(result.ok, false);
  return result.ok ? '' : result.message;
}

describe('validateRefineRequest', () => {
  it('accepts a text-only request', () => {
    const result = validateRefineRequest({ inputText: 'Write a haiku' });
    assert.deepEqual(result, {
      ok: true,
      value: { inputText: 'Write a haiku', images: [], references: [], effort: undefined, targetModel: undefined },
    });
  });

  it('accepts an image-only request', () => {
    const result = validateRefineRequest({ inputText: '', images: [PNG], effort: 'high' });
    assert.equal(result.ok, true);
  });

  it('drops unknown fields from images', () => {
    const result = validateRefineRequest({ inputText: 'x', images: [{ ...PNG, id: 'abc', evil: true }] });
    assert.deepEqual(result.ok && result.value.images, [PNG]);
  });

  it('rejects an empty request', () => {
    assert.match(messageOf({ inputText: '   ', images: [] }), /draft prompt or at least one image/);
  });

  it('rejects non-object bodies', () => {
    assert.match(messageOf(null), /JSON object/);
    assert.match(messageOf('hello'), /JSON object/);
  });

  it('rejects unsupported image formats', () => {
    assert.match(messageOf({ images: [{ mediaType: 'image/bmp', data: 'AAAA' }] }), /unsupported format/);
  });

  it('rejects a data URL where raw base64 is expected', () => {
    assert.match(messageOf({ images: [{ mediaType: 'image/png', data: 'data:image/png;base64,AAAA' }] }), /not valid base64/);
  });

  it('rejects images over the per-image limit', () => {
    const data = 'A'.repeat(Math.ceil((LIMITS.maxImageBytes + 3) / 3) * 4);
    assert.match(messageOf({ images: [{ mediaType: 'image/png', data }] }), /larger than 5 MB/);
  });

  it('rejects too many images', () => {
    const images = Array.from({ length: LIMITS.maxImages + 1 }, () => PNG);
    assert.match(messageOf({ images }), /Too many images/);
  });

  it('rejects an over-long draft', () => {
    assert.match(messageOf({ inputText: 'a'.repeat(LIMITS.maxInputChars + 1) }), /too long/);
  });

  it('rejects an unknown effort level', () => {
    assert.match(messageOf({ inputText: 'x', effort: 'max' }), /effort/);
  });

  it('accepts each target model', () => {
    for (const targetModel of TARGET_MODELS) {
      const result = validateRefineRequest({ inputText: 'x', targetModel });
      assert.equal(result.ok && result.value.targetModel, targetModel);
    }
  });

  it('rejects an unknown target model', () => {
    assert.match(messageOf({ inputText: 'x', targetModel: 'gpt-9' }), /targetModel/);
    assert.match(messageOf({ inputText: 'x', targetModel: 'Claude Fable 5.2' }), /targetModel/);
  });

  it('accepts earlier sessions and keeps only their known fields', () => {
    const result = validateRefineRequest({
      inputText: 'Make it shorter',
      references: [{ ...SESSION, id: 'abc', timestamp: 1 }, { refinedPrompt: 'Only a result' }],
    });
    assert.deepEqual(result.ok && result.value.references, [
      SESSION,
      { originalPrompt: '', analysis: '', refinedPrompt: 'Only a result' },
    ]);
  });

  it('still needs new input when earlier sessions are referenced', () => {
    assert.match(messageOf({ inputText: ' ', references: [SESSION] }), /draft prompt or at least one image/);
  });

  it('rejects malformed earlier sessions', () => {
    assert.match(messageOf({ inputText: 'x', references: 'abc' }), /"references" must be an array/);
    assert.match(messageOf({ inputText: 'x', references: [null] }), /Earlier session 1 is malformed/);
    assert.match(messageOf({ inputText: 'x', references: [{ ...SESSION, analysis: 7 }] }), /Earlier session 1 is malformed/);
    assert.match(
      messageOf({ inputText: 'x', references: [SESSION, { ...SESSION, refinedPrompt: '  ' }] }),
      /Earlier session 2 has no refined prompt/,
    );
  });

  it('rejects too many earlier sessions', () => {
    const references = Array.from({ length: LIMITS.maxReferences + 1 }, () => SESSION);
    assert.match(messageOf({ inputText: 'x', references }), /Too many earlier sessions/);
  });

  it('rejects earlier sessions that are too long in total', () => {
    const half = { ...SESSION, refinedPrompt: 'a'.repeat(LIMITS.maxReferenceChars / 2) };
    assert.match(messageOf({ inputText: 'x', references: [half, half] }), /too long in total/);
  });
});
