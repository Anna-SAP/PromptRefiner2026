import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEarlierSessions, buildSystemPrompt, buildUserContent } from './prompt';
import { referenceLength, toReference } from './references';

const RAW = `<analysis>
Cut the filler and named the audience.
</analysis>
<refined_prompt>
Write a 600-word post about pour-over coffee for beginners.
</refined_prompt>
<rationale target="claude-fable-5-2">
<change rule="clear-and-direct">Named the audience.</change>
</rationale>`;

describe('toReference', () => {
  it('hands on the draft, the analysis and the refined prompt, without tags or rationale', () => {
    assert.deepEqual(toReference({ originalPrompt: '  blog post about coffee \n', refinedPrompt: RAW }), {
      originalPrompt: 'blog post about coffee',
      analysis: 'Cut the filler and named the audience.',
      refinedPrompt: 'Write a 600-word post about pour-over coffee for beginners.',
    });
  });

  it('reads history saved by the previous app version', () => {
    const legacy = '**Analysis:** Tightened it.\n\n**Refined Prompt:**\n```\nWrite a haiku about rain.\n```';
    assert.deepEqual(toReference({ originalPrompt: 'haiku', refinedPrompt: legacy }), {
      originalPrompt: 'haiku',
      analysis: 'Tightened it.',
      refinedPrompt: 'Write a haiku about rain.',
    });
  });

  it('treats an answer in an unknown layout as the result itself', () => {
    assert.deepEqual(toReference({ originalPrompt: 'x', refinedPrompt: '  Just a prompt.  ' }), {
      originalPrompt: 'x',
      analysis: '',
      refinedPrompt: 'Just a prompt.',
    });
  });

  it('has no result for an empty answer', () => {
    assert.equal(toReference({ originalPrompt: 'x', refinedPrompt: ' \n' }).refinedPrompt, '');
  });

  it('measures a reference by its three parts', () => {
    assert.equal(referenceLength({ originalPrompt: 'ab', analysis: 'c', refinedPrompt: 'def' }), 6);
  });
});

describe('earlier sessions in the request', () => {
  const first = { originalPrompt: 'blog post about coffee', analysis: 'Named the audience.', refinedPrompt: 'Prompt one.' };
  const second = { originalPrompt: '', analysis: '', refinedPrompt: 'Prompt two.' };

  it('numbers the sessions in the order given and leaves out an empty analysis', () => {
    assert.equal(
      buildEarlierSessions([first, second]),
      `<earlier_sessions>
<session number="1">
<earlier_draft>
blog post about coffee
</earlier_draft>
<earlier_analysis>
Named the audience.
</earlier_analysis>
<earlier_refined_prompt>
Prompt one.
</earlier_refined_prompt>
</session>
<session number="2">
<earlier_draft>
(No text was provided. The draft of that session was one or more images.)
</earlier_draft>
<earlier_refined_prompt>
Prompt two.
</earlier_refined_prompt>
</session>
</earlier_sessions>`,
    );
  });

  it('puts the sessions before the images and the new draft', () => {
    const content = buildUserContent({
      inputText: 'Make it shorter',
      images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
      references: [first],
    });
    assert.deepEqual(
      content.map((block) => block.type),
      ['text', 'image', 'text'],
    );
    assert.ok(content[0]?.type === 'text' && content[0].text.startsWith('<earlier_sessions>'));
    assert.deepEqual(content[2], { type: 'text', text: '<raw_request>\nMake it shorter\n</raw_request>' });
  });

  it('sends the same user turn as before when nothing is referenced', () => {
    const expected = [{ type: 'text', text: '<raw_request>\nWrite a haiku\n</raw_request>' }];
    assert.deepEqual(buildUserContent({ inputText: 'Write a haiku', images: [] }), expected);
    assert.deepEqual(buildUserContent({ inputText: 'Write a haiku', images: [], references: [] }), expected);
  });

  it('is explained in the meta-prompt, with the tags the request uses', () => {
    const prompt = buildSystemPrompt('generic');
    for (const tag of ['<earlier_sessions>', '<session>', '<earlier_draft>', '<earlier_analysis>', '<earlier_refined_prompt>']) {
      assert.ok(prompt.includes(tag), tag);
    }
  });
});
