import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatForCopy, parseRefineOutput } from './parseOutput';

const COMPLETE = `<analysis>
Cut the step-by-step instructions; kept the goal.
</analysis>
<refined_prompt>
Write a blog post about coffee for home brewers.
</refined_prompt>`;

describe('parseRefineOutput — tagged format', () => {
  it('splits a complete answer into analysis and prompt', () => {
    const parsed = parseRefineOutput(COMPLETE);
    assert.equal(parsed.format, 'tagged');
    assert.equal(parsed.analysis, 'Cut the step-by-step instructions; kept the goal.');
    assert.equal(parsed.prompt, 'Write a blog post about coffee for home brewers.');
    assert.equal(parsed.promptStarted, true);
    assert.equal(parsed.promptComplete, true);
  });

  it('never shows tag fragments at any point in the stream', () => {
    for (let length = 0; length <= COMPLETE.length; length++) {
      const parsed = parseRefineOutput(COMPLETE.slice(0, length));
      const visible = parsed.analysis + parsed.prompt;
      assert.ok(!visible.includes('<'), `tag fragment leaked at length ${length}: ${JSON.stringify(visible)}`);
    }
  });

  it('reports the prompt as started but incomplete mid-stream', () => {
    const parsed = parseRefineOutput('<analysis>Short.</analysis>\n<refined_prompt>\nWrite a blog');
    assert.equal(parsed.analysis, 'Short.');
    assert.equal(parsed.prompt, 'Write a blog');
    assert.equal(parsed.promptStarted, true);
    assert.equal(parsed.promptComplete, false);
  });

  it('keeps angle brackets and code fences that belong to the prompt', () => {
    const body = 'Return HTML like <div class="a">.\n\n```js\nconsole.log(1 < 2);\n```\n\nThen explain.';
    const parsed = parseRefineOutput(`<analysis>ok</analysis><refined_prompt>\n${body}\n</refined_prompt>`);
    assert.equal(parsed.prompt, body);
  });

  it('unwraps a prompt the model fenced despite being asked not to', () => {
    const parsed = parseRefineOutput('<analysis>ok</analysis><refined_prompt>\n```markdown\nDo the thing.\n```\n</refined_prompt>');
    assert.equal(parsed.prompt, 'Do the thing.');
  });

  it('tolerates a missing analysis block', () => {
    const parsed = parseRefineOutput('<refined_prompt>Do the thing.</refined_prompt>');
    assert.equal(parsed.analysis, '');
    assert.equal(parsed.prompt, 'Do the thing.');
  });
});

describe('parseRefineOutput — legacy Markdown format', () => {
  const LEGACY = '**Analysis:**\n移除了微观实现指令。\n\n**Refined Prompt:**\n\n```markdown\n**目标：**\n重构项目。\n```';

  it('reads history saved by the Gemini-era app', () => {
    const parsed = parseRefineOutput(LEGACY);
    assert.equal(parsed.format, 'legacy');
    assert.equal(parsed.analysis, '移除了微观实现指令。');
    assert.equal(parsed.prompt, '**目标：**\n重构项目。');
    assert.equal(parsed.promptComplete, true);
  });
});

describe('parseRefineOutput — plain text', () => {
  it('passes through text with no structure', () => {
    const parsed = parseRefineOutput('I can only help with prompts.');
    assert.equal(parsed.format, 'plain');
    assert.equal(parsed.analysis, 'I can only help with prompts.');
    assert.equal(parsed.promptStarted, false);
  });

  it('is empty for an empty string', () => {
    const parsed = parseRefineOutput('');
    assert.equal(parsed.analysis, '');
    assert.equal(parsed.prompt, '');
  });
});

describe('formatForCopy', () => {
  it('produces readable text without tags', () => {
    assert.equal(
      formatForCopy(COMPLETE),
      'Analysis:\nCut the step-by-step instructions; kept the goal.\n\nRefined Prompt:\nWrite a blog post about coffee for home brewers.',
    );
  });

  it('returns unstructured text unchanged', () => {
    assert.equal(formatForCopy('  just text  '), 'just text');
  });
});
