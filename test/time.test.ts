import assert from 'node:assert';
import { HSmartDate, getSmartIntervals } from '../src/index';
import type { SmartDate } from '../src/index';

const HOUR = 3_600_000;
const CET = HOUR; // UTC+1
const CEST = 2 * HOUR; // UTC+2

/** Timestamp of `YYYY-MM-DD 00:00` German winter time */
function berlinWinterMidnight(year: number, month: number, date: number): number {
    return Date.UTC(year, month - 1, date) - CET;
}

/** Timestamp of `YYYY-MM-DD 00:00` German summer time */
function berlinSummerMidnight(year: number, month: number, date: number): number {
    return Date.UTC(year, month - 1, date) - CEST;
}

function smart(year: number, month: number, date: number): SmartDate {
    return { year, month, date, timeZone: 1 };
}

describe('HSmartDate', () => {
    it('detects leap years', () => {
        assert.strictEqual(HSmartDate.isLeap(2024), true);
        assert.strictEqual(HSmartDate.isLeap(2025), false);
        assert.strictEqual(HSmartDate.isLeap(1900), false, '1900 is divisible by 100 but not by 400');
        assert.strictEqual(HSmartDate.isLeap(2000), true, '2000 is divisible by 400');
    });

    it('finds the last Sunday of a month', () => {
        // The European DST switches of 2026
        assert.strictEqual(HSmartDate.getLastSundayOfMonth(2026, 3), 29);
        assert.strictEqual(HSmartDate.getLastSundayOfMonth(2026, 10), 25);
    });

    it('converts a winter date into the correct UTC timestamp', () => {
        const d = new HSmartDate(smart(2026, 1, 1));
        assert.strictEqual(d.getTime(), berlinWinterMidnight(2026, 1, 1));
    });

    it('converts a summer date into the correct UTC timestamp', () => {
        const d = new HSmartDate(smart(2026, 7, 1));
        assert.strictEqual(d.getTime(), berlinSummerMidnight(2026, 7, 1));
    });

    it('subtracts one millisecond for "end" dates', () => {
        const d = new HSmartDate(smart(2026, 1, 1), true);
        assert.strictEqual(d.getTime(), berlinWinterMidnight(2026, 1, 1) - 1);
    });

    it('honours a time zone other than Germany', () => {
        // UTC+0 without daylight saving offset of the German summer time is not applied,
        // because summer time is derived from the local time zone. In January there is none.
        const d = new HSmartDate({ year: 2026, month: 1, date: 1, timeZone: 0 });
        assert.strictEqual(d.getTime(), Date.UTC(2026, 0, 1));
    });

    it('walks over a month border', () => {
        const d = new HSmartDate(smart(2026, 1, 31));
        for (let i = 0; i < 24; i++) {
            d.getNextHour();
        }
        assert.strictEqual(d.getMonth(), 2);
        assert.strictEqual(d.getTime(), berlinWinterMidnight(2026, 2, 1));
    });

    it('walks over the 29th of February in a leap year', () => {
        const d = new HSmartDate(smart(2024, 2, 28));
        for (let i = 0; i < 24; i++) {
            d.getNextHour();
        }
        assert.strictEqual(d.getMonth(), 2, 'the 29th of February 2024 exists');
        for (let i = 0; i < 24; i++) {
            d.getNextHour();
        }
        assert.strictEqual(d.getMonth(), 3);
    });

    it('skips the 29th of February in a non leap year', () => {
        const d = new HSmartDate(smart(2026, 2, 28));
        for (let i = 0; i < 24; i++) {
            d.getNextHour();
        }
        assert.strictEqual(d.getMonth(), 3);
        assert.strictEqual(d.getTime(), berlinWinterMidnight(2026, 3, 1));
    });

    it('walks over the year border', () => {
        const d = new HSmartDate(smart(2026, 12, 31));
        for (let i = 0; i < 24; i++) {
            d.getNextHour();
        }
        assert.strictEqual(d.getMonth(), 1);
        assert.strictEqual(d.getTime(), berlinWinterMidnight(2027, 1, 1));
    });

    it('reports the switch to the summer time', () => {
        const d = new HSmartDate(smart(2026, 3, 29));
        const switches: number[] = [];
        for (let i = 0; i < 24; i++) {
            switches.push(d.getNextHour());
        }
        assert.deepStrictEqual(
            switches.filter(s => s !== 0),
            [-1],
            'exactly one hour is skipped',
        );
    });

    it('reports the switch to the winter time', () => {
        const d = new HSmartDate(smart(2026, 10, 25));
        const switches: number[] = [];
        for (let i = 0; i < 24; i++) {
            switches.push(d.getNextHour());
        }
        assert.deepStrictEqual(
            switches.filter(s => s !== 0),
            [1],
            'exactly one hour is repeated',
        );
    });
});

describe('getSmartIntervals', () => {
    it('requires a time zone', () => {
        assert.throws(
            () => getSmartIntervals({ year: 2026, month: 1, date: 1 }, 'hour', smart(2026, 1, 2)),
            /Time zone not provided/,
        );
    });

    it('returns nothing if the end is not after the start', () => {
        assert.deepStrictEqual(getSmartIntervals(smart(2026, 1, 2), 'hour', smart(2026, 1, 1)), []);
    });

    it('splits a day into 24 hours', () => {
        const intervals = getSmartIntervals(smart(2026, 1, 1), 'hour', smart(2026, 1, 2));
        assert.strictEqual(intervals.length, 24);
        assert.strictEqual(intervals[0].start, berlinWinterMidnight(2026, 1, 1));
        assert.strictEqual(intervals[23].end, berlinWinterMidnight(2026, 1, 2));
        for (const interval of intervals) {
            assert.strictEqual(interval.end - interval.start, HOUR);
        }
        // intervals are gapless
        for (let i = 1; i < intervals.length; i++) {
            assert.strictEqual(intervals[i].start, intervals[i - 1].end);
        }
    });

    it('adds human-readable borders in debug mode', () => {
        const [interval] = getSmartIntervals(smart(2026, 1, 1), 'hour', smart(2026, 1, 2), true);
        assert.strictEqual(interval.startS, new Date(interval.start).toISOString());
        assert.strictEqual(interval.endS, new Date(interval.end).toISOString());
    });

    it('does not add human-readable borders without debug mode', () => {
        const [interval] = getSmartIntervals(smart(2026, 1, 1), 'hour', smart(2026, 1, 2));
        assert.strictEqual(interval.startS, undefined);
        assert.strictEqual(interval.endS, undefined);
    });

    it('builds days of 24 hours outside of the DST switches', () => {
        const intervals = getSmartIntervals(smart(2026, 1, 1), 'day', smart(2026, 1, 4));
        assert.strictEqual(intervals.length, 3);
        for (const interval of intervals) {
            assert.strictEqual(interval.end - interval.start, 24 * HOUR);
        }
    });

    it('builds a 23 hours long day when the summer time starts', () => {
        const [interval] = getSmartIntervals(smart(2026, 3, 29), 'day', smart(2026, 3, 30));
        assert.strictEqual(interval.start, berlinWinterMidnight(2026, 3, 29));
        assert.strictEqual(interval.end, berlinSummerMidnight(2026, 3, 30));
        assert.strictEqual(interval.end - interval.start, 23 * HOUR);
    });

    it('builds a 25 hours long day when the winter time starts', () => {
        const [interval] = getSmartIntervals(smart(2026, 10, 25), 'day', smart(2026, 10, 26));
        assert.strictEqual(interval.start, berlinSummerMidnight(2026, 10, 25));
        assert.strictEqual(interval.end, berlinWinterMidnight(2026, 10, 26));
        assert.strictEqual(interval.end - interval.start, 25 * HOUR);
    });

    it('builds months of the real length', () => {
        const intervals = getSmartIntervals(smart(2026, 1, 1), 'month', smart(2026, 4, 1));
        assert.strictEqual(intervals.length, 3);
        assert.strictEqual(intervals[0].end - intervals[0].start, 31 * 24 * HOUR, 'January has 31 days');
        assert.strictEqual(intervals[1].end - intervals[1].start, 28 * 24 * HOUR, 'February 2026 has 28 days');
        assert.strictEqual(
            intervals[2].end - intervals[2].start,
            31 * 24 * HOUR - HOUR,
            'March has 31 days, but one hour is skipped by the DST switch',
        );
        assert.strictEqual(intervals[0].start, berlinWinterMidnight(2026, 1, 1));
        assert.strictEqual(intervals[2].end, berlinSummerMidnight(2026, 4, 1));
    });

    it('builds a 29 days long February in a leap year', () => {
        const [interval] = getSmartIntervals(smart(2024, 2, 1), 'month', smart(2024, 3, 1));
        assert.strictEqual(interval.end - interval.start, 29 * 24 * HOUR);
    });
});
