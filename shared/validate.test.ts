import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITS, TARGET_MODELS } from './protocol';
import { validateRefineRequest } from './validate';

const PNG = { mediaType: 'image/png', data: 'iVBORw0KGgo=' };

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
      value: { inputText: 'Write a haiku', images: [], effort: undefined, targetModel: undefined },
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
});
