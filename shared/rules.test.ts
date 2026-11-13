import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSystemBlocks, buildSystemPrompt, buildTargetSection } from './prompt';
import { TARGET_MODELS } from './protocol';
import {
  ALL_RULES,
  CROSS_MODEL_GUIDES,
  DOCS_ROOT,
  GUIDES,
  type GuideSource,
  REFINER_EDIT_RULE,
  TALK,
  TARGETS,
  type TalkSource,
  findRule,
  isOutsideScope,
  isTalkSource,
  rulesForTarget,
  sourceLabel,
  sourceUrl,
  timestampSeconds,
} from './rules';

const ids = (target: (typeof TARGET_MODELS)[number]) => rulesForTarget(target).map((rule) => rule.id);
const guideSources = (sources: readonly (typeof ALL_RULES)[number]['sources'][number][]) =>
  sources.filter((source): source is GuideSource => !isTalkSource(source));
const TALK_RULES = ALL_RULES.filter((rule) => rule.id.startsWith('talk-'));

describe('rule catalogue', () => {
  it('has unique ids, none of them the reserved one', () => {
    const all = ALL_RULES.map((rule) => rule.id);
    assert.equal(new Set(all).size, all.length);
    assert.ok(!all.includes(REFINER_EDIT_RULE));
  });

  it('gives every rule a source in Anthropic’s documentation or the talk', () => {
    for (const rule of ALL_RULES) {
      assert.ok(rule.sources.length > 0, `${rule.id} has no source`);
      for (const source of rule.sources) {
        const url = sourceUrl(source);
        if (isTalkSource(source)) {
          assert.equal(url, `${TALK.url}&t=${timestampSeconds(source.start)}s`, rule.id);
          assert.ok(source.quotes.length > 0 && source.quotes.every((quote) => quote.trim()), `${rule.id}: empty quote`);
          assert.ok(timestampSeconds(source.start) <= timestampSeconds(source.end), `${rule.id}: start after end`);
          assert.ok(timestampSeconds(source.end) <= TALK.durationSeconds, `${rule.id}: past the end of the talk`);
        } else {
          assert.ok(url.startsWith(`${DOCS_ROOT}/`), `${rule.id}: ${url}`);
          assert.match(url, /#[a-z0-9-]+$/, `${rule.id}: ${url}`);
          assert.ok(source.section.length > 0);
        }
      }
    }
  });

  it('backs every talk-sourced rule with a passage of the talk, for all models', () => {
    assert.equal(TALK_RULES.length, 4);
    for (const rule of TALK_RULES) {
      assert.ok(rule.sources.some(isTalkSource), `${rule.id} cites no passage of the talk`);
      assert.equal(rule.scope, 'all', rule.id);
    }
  });

  it('labels and links a talk passage by its start time', () => {
    const source: TalkSource = { kind: 'talk', start: '07:00', end: '07:11', quotes: ['x'] };
    assert.equal(sourceUrl(source), `${TALK.url}&t=420s`);
    assert.match(sourceLabel(source), /07:00–07:11$/);
    assert.match(sourceLabel({ ...source, end: '07:00' }), /› 07:00$/);
    assert.throws(() => timestampSeconds('7 min'));
  });

  it('takes a model-specific rule only from that model’s guide', () => {
    const guideOf = {
      'claude-fable-5-2': 'fable-5-2',
      'claude-opus-5-5': 'opus-5-5',
      'claude-sonnet-5-5': 'sonnet-5-5',
      'claude-haiku-5-5': 'haiku-5-5',
    } as const;
    for (const rule of ALL_RULES) {
      for (const source of guideSources(rule.sources)) {
        if (rule.scope === 'all') assert.ok(CROSS_MODEL_GUIDES.includes(source.guide), `${rule.id}: ${source.guide}`);
        else assert.equal(source.guide, guideOf[rule.scope], rule.id);
      }
      if (rule.scope !== 'all') assert.ok(!rule.sources.some(isTalkSource), `${rule.id}: talk rules hold for all models`);
    }
  });

  it('uses every rule in at least one target', () => {
    const used = new Set(TARGET_MODELS.flatMap(ids));
    for (const rule of ALL_RULES) assert.ok(used.has(rule.id), `${rule.id} is in no target`);
  });
});

describe('rules per target', () => {
  it('gives each target a different set of rules', () => {
    const sets = TARGET_MODELS.map((target) => ids(target).join(','));
    assert.equal(new Set(sets).size, TARGET_MODELS.length);
  });

  it('keeps each model’s own rules out of the other targets', () => {
    for (const target of TARGET_MODELS) {
      for (const rule of rulesForTarget(target)) {
        if (rule.id === 'fable-exception-in-rule') continue; // applied to every target on purpose
        assert.ok(!isOutsideScope(rule, target), `${rule.id} is listed for ${target}`);
      }
    }
  });

  it('limits the generic target to cross-model sources, plus the exception rule', () => {
    for (const rule of rulesForTarget('generic')) {
      if (rule.id === 'fable-exception-in-rule') continue;
      for (const source of guideSources(rule.sources)) {
        assert.ok(CROSS_MODEL_GUIDES.includes(source.guide), `${rule.id}: ${source.guide}`);
      }
    }
    assert.deepEqual(TARGETS.generic.guides, ['best-practices']);
  });

  it('gives every target the talk-sourced rules', () => {
    for (const target of TARGET_MODELS) {
      for (const rule of TALK_RULES) assert.ok(ids(target).includes(rule.id), `${target}: ${rule.id}`);
    }
  });

  it('keeps the talk rules from clashing with the rules beside them', () => {
    // Sonnet 5.5's guide asks for "Think the problem through" before a JSON
    // answer, and the coding rules ask for a real check: the talk rule that
    // removes thinking and checking lines must leave those alone.
    const tryHarder = findRule('talk-try-harder-lines')?.instruction ?? '';
    assert.match(tryHarder, /another rule in this list asks for/);
    assert.match(tryHarder, /running the project's tests/);
    // The Haiku date line and the cache rule agree on where a date goes.
    assert.match(findRule('haiku-search-date')?.instruction ?? '', /once when the conversation starts/);
    assert.match(findRule('talk-stable-prefix')?.instruction ?? '', /date the session started/);
  });

  it('includes both owner-requested rules for every target', () => {
    for (const target of TARGET_MODELS) {
      const list = ids(target);
      assert.ok(list.some((id) => id.endsWith('-finish-task')), `${target}: finish-the-task rule`);
      assert.ok(list.includes('fable-exception-in-rule'), `${target}: exception-in-the-rule rule`);
    }
    assert.match(findRule('fable-exception-in-rule')?.instruction ?? '', /exception in the same sentence/);
    assert.match(findRule('fable-finish-task')?.instruction ?? '', /ordinary obstacles/);
  });

  it('marks the exception rule as written for another model outside Fable 5.2', () => {
    const rule = findRule('fable-exception-in-rule');
    assert.ok(rule);
    assert.equal(isOutsideScope(rule, 'claude-fable-5-2'), false);
    assert.equal(isOutsideScope(rule, 'claude-haiku-5-5'), true);
    assert.equal(isOutsideScope(rule, 'generic'), true);
  });

  it('names the guides each target draws on', () => {
    const supporting = CROSS_MODEL_GUIDES.filter((guide) => guide !== 'best-practices');
    for (const target of TARGET_MODELS) {
      const used = new Set(rulesForTarget(target).flatMap((rule) => guideSources(rule.sources).map((source) => source.guide)));
      for (const guide of TARGETS[target].guides) assert.ok(GUIDES[guide], guide);
      const expected = [...TARGETS[target].guides, 'fable-5-2', ...supporting];
      if (target !== 'generic') assert.deepEqual([...used].sort(), [...new Set(expected)].sort());
    }
  });
});

describe('meta-prompt', () => {
  it('lists exactly the target’s rules, by id', () => {
    for (const target of TARGET_MODELS) {
      const section = buildTargetSection(target);
      const cited = [...section.matchAll(/^\[([a-z0-9-]+)\] /gm)].map((match) => match[1]);
      assert.deepEqual(cited, ids(target));
      assert.ok(section.includes(`<rationale target="${target}">`));
    }
  });

  it('changes with the target, beyond the label', () => {
    const fable = buildSystemPrompt('claude-fable-5-2');
    const haiku = buildSystemPrompt('claude-haiku-5-5');
    assert.ok(fable.includes('[fable-code-ownership]') && !haiku.includes('[fable-code-ownership]'));
    assert.ok(haiku.includes('[haiku-search-date]') && !fable.includes('[haiku-search-date]'));
    assert.ok(!buildSystemPrompt('generic').includes('Claude Fable 5.2'));
  });

  it('keeps the two existing output tags and adds the rationale', () => {
    const prompt = buildSystemPrompt('generic');
    for (const tag of ['<analysis>', '</analysis>', '<refined_prompt>', '</refined_prompt>', '</rationale>']) {
      assert.ok(prompt.includes(tag), tag);
    }
    assert.ok(prompt.includes(`rule="${REFINER_EDIT_RULE}"`));
  });

  it('shares one cacheable base block across targets', () => {
    const [baseA, targetA] = buildSystemBlocks('claude-opus-5-5');
    const [baseB, targetB] = buildSystemBlocks('claude-sonnet-5-5');
    assert.equal(baseA?.text, baseB?.text);
    assert.notEqual(targetA?.text, targetB?.text);
    assert.deepEqual(baseA?.cache_control, { type: 'ephemeral' });
    assert.deepEqual(buildSystemBlocks('claude-opus-5-5'), [baseA, targetA]);
  });
});
