import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatForCopy, parseRefineOutput } from './parseOutput';
import { splitRationale } from './parseRationale';

const ANSWER = `<analysis>
Cut the step-by-step instructions; kept the goal.
</analysis>
<refined_prompt>
Deploy the service. Do not deploy to production until I have given the go-ahead.
</refined_prompt>`;

const RATIONALE = `<rationale target="claude-fable-5-2">
<change rule="fable-exception-in-rule">Moved the go-ahead exception into the deploy rule.</change>
<change rule="refiner-edit">Removed the greeting.</change>
</rationale>`;

const FULL = `${ANSWER}\n${RATIONALE}`;

describe('splitRationale', () => {
  it('reads the target and each change', () => {
    const { rationale } = splitRationale(FULL);
    assert.equal(rationale.started, true);
    assert.equal(rationale.complete, true);
    assert.equal(rationale.target, 'claude-fable-5-2');
    assert.deepEqual(rationale.entries, [
      { rule: 'fable-exception-in-rule', change: 'Moved the go-ahead exception into the deploy rule.' },
      { rule: 'refiner-edit', change: 'Removed the greeting.' },
    ]);
  });

  it('reports no rationale for an answer without one', () => {
    const { main, rationale } = splitRationale(ANSWER);
    assert.equal(main, ANSWER);
    assert.equal(rationale.started, false);
    assert.deepEqual(rationale.entries, []);
  });

  it('never shows tag fragments at any point in the stream', () => {
    for (let length = 0; length <= FULL.length; length++) {
      const { rationale } = splitRationale(FULL.slice(0, length));
      for (const entry of rationale.entries) {
        const visible = entry.rule + entry.change;
        assert.ok(!visible.includes('<'), `tag fragment leaked at length ${length}: ${JSON.stringify(visible)}`);
      }
    }
  });

  it('shows the entry being written before its closing tag arrives', () => {
    const partial = `${ANSWER}\n<rationale target="generic">\n<change rule="bp-give-reason">Kept the rea`;
    const { rationale } = splitRationale(partial);
    assert.equal(rationale.complete, false);
    assert.equal(rationale.target, 'generic');
    assert.deepEqual(rationale.entries, [{ rule: 'bp-give-reason', change: 'Kept the rea' }]);
  });

  it('accepts an empty block', () => {
    const { rationale } = splitRationale(`${ANSWER}<rationale target="generic"></rationale>`);
    assert.equal(rationale.complete, true);
    assert.deepEqual(rationale.entries, []);
  });

  it('keeps plain text the model wrote instead of change items', () => {
    const { rationale } = splitRationale(`${ANSWER}<rationale>Only trimmed filler.</rationale>`);
    assert.equal(rationale.target, null);
    assert.deepEqual(rationale.entries, [{ rule: '', change: 'Only trimmed filler.' }]);
  });

  it('leaves alone a prompt that only mentions the tag', () => {
    const answer = '<analysis>ok</analysis><refined_prompt>\nPut your reasons in <rationale> tags.\n</refined_prompt>';
    const { main, rationale } = splitRationale(answer);
    assert.equal(main, answer);
    assert.equal(rationale.started, false);
  });

  it('takes the last block when the refined prompt quotes the output format', () => {
    const quoted = 'Reply with <refined_prompt>…</refined_prompt>\n<rationale target="x"><change rule="a">b</change></rationale>';
    const answer = `<analysis>ok</analysis><refined_prompt>\n${quoted}\n</refined_prompt>`;
    const { main, rationale } = splitRationale(`${answer}\n${RATIONALE}`);
    assert.equal(rationale.target, 'claude-fable-5-2');
    assert.equal(rationale.entries.length, 2);
    assert.equal(parseRefineOutput(main).prompt, quoted);
  });
});

describe('the rationale and the existing parser', () => {
  it('leaves the analysis and the prompt exactly as they were without a rationale', () => {
    const { main } = splitRationale(FULL);
    assert.deepEqual(parseRefineOutput(main), parseRefineOutput(ANSWER));
    // The existing parser alone also ignores a trailing rationale block.
    assert.deepEqual(parseRefineOutput(FULL), parseRefineOutput(ANSWER));
  });

  it('gives the same analysis and prompt at every point in the stream', () => {
    for (let length = 0; length <= FULL.length; length++) {
      const partial = FULL.slice(0, length);
      const expected = parseRefineOutput(partial.slice(0, Math.min(length, ANSWER.length)));
      const actual = parseRefineOutput(splitRationale(partial).main);
      assert.deepEqual(actual, expected, `diverged at length ${length}`);
    }
  });

  it('keeps the rationale out of the prompt even when it names the prompt tag', () => {
    const tricky = `${ANSWER}\n<rationale target="generic">\n<change rule="refiner-edit">Closed the </refined_prompt> block earlier.</change>\n</rationale>`;
    const { main } = splitRationale(tricky);
    assert.equal(parseRefineOutput(main).prompt, parseRefineOutput(ANSWER).prompt);
  });

  it('keeps the rationale out of both copy actions', () => {
    const { main } = splitRationale(FULL);
    assert.ok(!parseRefineOutput(main).prompt.includes('go-ahead exception'));
    assert.equal(formatForCopy(main), formatForCopy(ANSWER));
    assert.ok(!formatForCopy(main).includes('rationale'));
  });
});
