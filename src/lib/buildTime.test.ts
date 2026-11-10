import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBuildTime } from './buildTime';

describe('formatBuildTime', () => {
  it('shows a UTC timestamp in UTC+8', () => {
    assert.equal(formatBuildTime('2026-11-10T07:38:00.000Z'), '2026-11-10 15:38 UTC+8');
  });

  it('rolls over to the next day when UTC+8 is past midnight', () => {
    assert.equal(formatBuildTime('2026-11-10T16:05:59.999Z'), '2026-11-11 00:05 UTC+8');
  });

  it('rolls over month and year boundaries', () => {
    assert.equal(formatBuildTime('2026-12-31T20:00:00Z'), '2027-01-01 04:00 UTC+8');
  });

  it('drops seconds without rounding up', () => {
    assert.equal(formatBuildTime('2026-03-05T01:02:59Z'), '2026-03-05 09:02 UTC+8');
  });

  it('accepts a timestamp written with another offset', () => {
    assert.equal(formatBuildTime('2026-11-10T02:38:00-05:00'), '2026-11-10 15:38 UTC+8');
  });

  it('returns null for something that is not a date', () => {
    assert.equal(formatBuildTime('not a date'), null);
  });
});
