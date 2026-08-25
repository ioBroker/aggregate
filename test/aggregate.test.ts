import assert from 'node:assert';
import {
    aggregation,
    calcDiff,
    finishAggregation,
    initAggregate,
    sortByTs,
    type GetHistoryOptions,
    type IobDataEntry,
} from '../src/index';

const HOUR = 3_600_000;

/** Run the complete pipeline and return the final result */
function run(options: GetHistoryOptions, data: IobDataEntry[], id?: string): IobDataEntry[] {
    const internal = initAggregate({ limit: 2000, ...options }, id);
    aggregation(internal, data);
    finishAggregation(internal);
    return internal.result!;
}

describe('calcDiff', () => {
    it('calculates the trapezoid between two points', () => {
        // 10 and 30 over one hour => (10 + 30) / 2 * 1h
        assert.deepStrictEqual(calcDiff({ ts: 0, val: 10 }, { ts: HOUR, val: 30 }), { square: 20, deltaT: 1 });
    });

    it('returns half of the hour for half of an hour', () => {
        assert.deepStrictEqual(calcDiff({ ts: 0, val: 10 }, { ts: HOUR / 2, val: 10 }), { square: 5, deltaT: 0.5 });
    });

    it('treats null as zero', () => {
        assert.deepStrictEqual(calcDiff({ ts: 0, val: null }, { ts: HOUR, val: 10 }), { square: 5, deltaT: 1 });
    });

    it('refuses to go back in time', () => {
        assert.deepStrictEqual(calcDiff({ ts: HOUR, val: 10 }, { ts: 0, val: 10 }), { square: 0, deltaT: 0 });
    });
});

describe('sortByTs', () => {
    it('sorts ascending by timestamp', () => {
        const data: IobDataEntry[] = [
            { ts: 30, val: 3 },
            { ts: 10, val: 1 },
            { ts: 20, val: 2 },
        ];
        assert.deepStrictEqual(
            data.sort(sortByTs).map(e => e.ts),
            [10, 20, 30],
        );
    });
});

describe('initAggregate', () => {
    it('derives the step from the requested count', () => {
        const options = initAggregate({ start: 0, end: 1000, count: 10, limit: 2000 });
        assert.strictEqual(options.step, 100);
        assert.strictEqual(options.maxIndex, 9);
    });

    it('enlarges the step so that the limit is not exceeded', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 1, limit: 10 });
        assert.strictEqual(options.step, 100, '1000 ms / 10 buckets');
        assert.strictEqual(options.maxIndex, 9);
    });

    it('creates one bucket before and one after the requested range', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 500, limit: 2000 });
        assert.strictEqual(options.maxIndex, 1);
        assert.strictEqual(options.processing!.length, 4, 'pre + 2 buckets + post');
    });

    it('takes the number of buckets from the smart intervals', () => {
        const timeIntervals = [
            { start: 0, end: 100 },
            { start: 100, end: 250 },
            { start: 250, end: 300 },
        ];
        const options = initAggregate({ start: 0, end: 300, step: 100, limit: 2000 }, 'id', timeIntervals);
        assert.strictEqual(options.maxIndex, 2);
        assert.strictEqual(options.timeIntervals, timeIntervals);
    });

    it('defaults to the minmax aggregation', () => {
        assert.strictEqual(initAggregate({ start: 0, end: 1000, step: 100, limit: 2000 }).aggregate, 'minmax');
    });

    it('defaults the percentile to 50 and mirrors it into the quantile', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 100, limit: 2000, aggregate: 'percentile' });
        assert.strictEqual(options.percentile, 50);
        assert.strictEqual(options.quantile, 0.5);
    });

    it('rejects an out-of-range percentile', () => {
        const options = initAggregate({
            start: 0,
            end: 1000,
            step: 100,
            limit: 2000,
            aggregate: 'percentile',
            percentile: 101,
        });
        assert.strictEqual(options.percentile, 50);
    });

    it('defaults the quantile to 0.5', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 100, limit: 2000, aggregate: 'quantile' });
        assert.strictEqual(options.quantile, 0.5);
    });

    it('converts the integral unit from seconds into milliseconds', () => {
        const options = initAggregate({
            start: 0,
            end: 1000,
            step: 100,
            limit: 2000,
            aggregate: 'integral',
            integralUnit: 3600,
        });
        assert.strictEqual(options.integralUnit, 3_600_000);
    });

    it('defaults the integral unit to one minute', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 100, limit: 2000, aggregate: 'integral' });
        assert.strictEqual(options.integralUnit, 60_000);
    });

    it('silences the debug output if no logger was given', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 100, limit: 2000, logDebug: true } as any);
        assert.strictEqual(options.logDebug, false);
        assert.strictEqual(typeof options.log, 'function');
    });
});

describe('aggregation', () => {
    const base: GetHistoryOptions = {
        start: 0,
        end: 1000,
        step: 100,
        limit: 2000,
        removeBorderValues: true,
    };
    // the first two values land in bucket 0 (0..100), the third one in bucket 1 (100..200)
    const data: IobDataEntry[] = [
        { ts: 10, val: 10 },
        { ts: 20, val: 20 },
        { ts: 150, val: 5 },
    ];

    it('averages the values of every bucket', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'average' }, [...data]), [
            { ts: 50, val: 15 },
            { ts: 150, val: 5 },
        ]);
    });

    it('rounds the average to two decimals', () => {
        assert.deepStrictEqual(
            run({ ...base, aggregate: 'average' }, [
                { ts: 10, val: 1 },
                { ts: 20, val: 1 },
                { ts: 30, val: 2 },
            ]),
            [{ ts: 50, val: 1.33 }],
        );
    });

    it('takes the maximum of every bucket', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'max' }, [...data]), [
            { ts: 50, val: 20 },
            { ts: 150, val: 5 },
        ]);
    });

    it('takes the minimum of every bucket', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'min' }, [...data]), [
            { ts: 50, val: 10 },
            { ts: 150, val: 5 },
        ]);
    });

    it('sums up every bucket', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'total' }, [...data]), [
            { ts: 50, val: 30 },
            { ts: 150, val: 5 },
        ]);
    });

    it('counts the values of every bucket', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'count' }, [...data]), [
            { ts: 50, val: 2 },
            { ts: 150, val: 1 },
        ]);
    });

    it('reports start, min, max and end of a bucket in chronological order', () => {
        const result = run(
            { start: 0, end: 1000, step: 1000, limit: 2000, aggregate: 'minmax', removeBorderValues: true },
            [
                { ts: 100, val: 5 },
                { ts: 300, val: 1 },
                { ts: 500, val: 9 },
                { ts: 700, val: 4 },
            ],
        );
        assert.deepStrictEqual(result, [
            { ts: 100, val: 5 },
            { ts: 300, val: 1 },
            { ts: 500, val: 9 },
            { ts: 700, val: 4 },
        ]);
    });

    it('collapses a bucket with a single value', () => {
        const result = run(
            { start: 0, end: 1000, step: 1000, limit: 2000, aggregate: 'minmax', removeBorderValues: true },
            [{ ts: 100, val: 5 }],
        );
        assert.deepStrictEqual(result, [{ ts: 100, val: 5 }]);
    });

    it('keeps only the newest of several values before the range', () => {
        // ts -500 and -400 are both earlier than the "pre-bucket" (-100..0)
        const result = run({ start: 0, end: 1000, step: 100, limit: 2000, aggregate: 'max' }, [
            { ts: -500, val: 1 },
            { ts: -400, val: 2 },
            { ts: 150, val: 5 },
        ]);
        // the pre-value is used to interpolate the value at `start`, it is not returned as-is
        assert.strictEqual(result[0].ts, 0);
        assert.strictEqual(result[0].i, true, 'the border value is marked as interpolated');
        assert.ok(
            result[0].val! > 2 && result[0].val! < 5,
            `expected a value interpolated between 2 and 5, got ${result[0].val}`,
        );
    });

    it('keeps only the oldest of several values after the range', () => {
        const result = run({ start: 0, end: 1000, step: 100, limit: 2000, aggregate: 'max' }, [
            { ts: 150, val: 5 },
            { ts: 2000, val: 8 },
            { ts: 3000, val: 9 },
        ]);
        const last = result[result.length - 1];
        assert.strictEqual(last.ts, 1000);
        assert.strictEqual(last.i, true);
        assert.ok(last.val! > 5 && last.val! < 8, `expected a value interpolated between 5 and 8, got ${last.val}`);
    });

    it('ignores values for which no bucket exists', () => {
        const options = initAggregate({ start: 0, end: 1000, step: 100, limit: 2000, aggregate: 'max' });
        const { sourceLength } = aggregation(options, [{ ts: 150, val: 5 }]);
        assert.strictEqual(sourceLength, 1);
        assert.strictEqual(options.overallLength, 1);
    });
});

describe('aggregation with quantiles', () => {
    const base: GetHistoryOptions = {
        start: 0,
        end: 1000,
        step: 1000,
        limit: 2000,
        removeBorderValues: true,
    };
    const data: IobDataEntry[] = [
        { ts: 100, val: 4 },
        { ts: 200, val: 1 },
        { ts: 300, val: 3 },
        { ts: 400, val: 2 },
    ];

    it('returns the median for the 50th percentile', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'percentile', percentile: 50 }, [...data]), [
            { ts: 500, val: 2.5 },
        ]);
    });

    it('returns the smallest value for the 0th percentile', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'percentile', percentile: 0 }, [...data]), [
            { ts: 500, val: 1 },
        ]);
    });

    it('returns the largest value for the 100th percentile', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'percentile', percentile: 100 }, [...data]), [
            { ts: 500, val: 4 },
        ]);
    });

    it('supports the quantile notation', () => {
        assert.deepStrictEqual(run({ ...base, aggregate: 'quantile', quantile: 0.5 }, [...data]), [
            { ts: 500, val: 2.5 },
        ]);
    });

    it('interpolates between the two neighbours for a non-integer index', () => {
        // 5 values, q = 0.5 => index 2.5 => the third smallest value
        assert.deepStrictEqual(
            run({ ...base, aggregate: 'quantile', quantile: 0.5 }, [
                { ts: 100, val: 5 },
                { ts: 200, val: 1 },
                { ts: 300, val: 4 },
                { ts: 400, val: 2 },
                { ts: 500, val: 3 },
            ]),
            [{ ts: 500, val: 3 }],
        );
    });
});

describe('aggregation of integrals', () => {
    it('integrates a constant value over one hour', () => {
        // 10 W for one hour with the unit "hour" => 10 Wh
        const result = run(
            {
                start: 0,
                end: HOUR,
                step: HOUR,
                limit: 2000,
                aggregate: 'integral',
                integralUnit: 3600,
                removeBorderValues: true,
            },
            [{ ts: 0, val: 10 }],
        );
        assert.deepStrictEqual(result, [{ ts: HOUR / 2, val: 10 }]);
    });

    it('uses the integral unit as divisor', () => {
        // the same hour, but the unit is a minute => 60 times more
        const result = run(
            {
                start: 0,
                end: HOUR,
                step: HOUR,
                limit: 2000,
                aggregate: 'integral',
                integralUnit: 60,
                removeBorderValues: true,
            },
            [{ ts: 0, val: 10 }],
        );
        assert.deepStrictEqual(result, [{ ts: HOUR / 2, val: 600 }]);
    });

    it('keeps the value constant between the data points without interpolation', () => {
        // 10 for the first half, 30 for the second half => 20 Wh
        const result = run(
            {
                start: 0,
                end: HOUR,
                step: HOUR,
                limit: 2000,
                aggregate: 'integral',
                integralUnit: 3600,
                integralInterpolation: 'none',
                removeBorderValues: true,
            },
            [
                { ts: 0, val: 10 },
                { ts: HOUR / 2, val: 30 },
            ],
        );
        assert.deepStrictEqual(result, [{ ts: HOUR / 2, val: 20 }]);
    });

    it('draws a ramp between the data points with linear interpolation', () => {
        // 10 -> 30 over the first half hour (trapezoid: 20 * 0.5 = 10)
        // plus 30 held over the second half hour (15) => 25 Wh
        const result = run(
            {
                start: 0,
                end: HOUR,
                step: HOUR,
                limit: 2000,
                aggregate: 'integral',
                integralUnit: 3600,
                integralInterpolation: 'linear',
                removeBorderValues: true,
            },
            [
                { ts: 0, val: 10 },
                { ts: HOUR / 2, val: 30 },
            ],
        );
        assert.deepStrictEqual(result, [{ ts: HOUR / 2, val: 25 }]);
    });

    it('sums the whole range for integralTotal', () => {
        const result = run(
            {
                start: 0,
                end: 2 * HOUR,
                step: 2 * HOUR,
                limit: 2000,
                aggregate: 'integralTotal',
                removeBorderValues: true,
            },
            [
                { ts: 0, val: 10 },
                { ts: HOUR, val: 10 },
                { ts: 2 * HOUR, val: 10 },
            ],
        );
        assert.deepStrictEqual(result, [{ ts: 2 * HOUR, val: 20 }], '10 units over 2 hours');
    });

    it('extrapolates the last value to the end for integralTotal', () => {
        const result = run(
            {
                start: 0,
                end: 2 * HOUR,
                step: 2 * HOUR,
                limit: 2000,
                aggregate: 'integralTotal',
                removeBorderValues: true,
            },
            [{ ts: 0, val: 10 }],
        );
        assert.deepStrictEqual(result, [{ ts: 2 * HOUR, val: 20 }], 'the last known value is held until the end');
    });
});

describe('aggregation over smart intervals', () => {
    it('integrates every calendar interval on its own', () => {
        const timeIntervals = [
            { start: 0, end: HOUR },
            { start: HOUR, end: 2 * HOUR },
        ];
        const options = initAggregate(
            {
                start: 0,
                end: 2 * HOUR,
                step: HOUR,
                limit: 2000,
                aggregate: 'integral',
                integralUnit: 3600,
                removeBorderValues: true,
            },
            'test.0.value',
            timeIntervals,
        );
        aggregation(options, [
            { ts: -HOUR, val: 10 }, // the value valid at the beginning
            { ts: HOUR, val: 10 },
            { ts: 2 * HOUR, val: 10 },
        ]);
        finishAggregation(options);

        assert.strictEqual(options.result!.length, 2);
        assert.strictEqual(options.result![0].ts, HOUR / 2, 'the midpoint of the first interval');
        assert.strictEqual(options.result![1].ts, HOUR + HOUR / 2, 'the midpoint of the second interval');
        // a constant of 10 over a full hour, minus the 1 ms that is cut off at the interval border
        for (const point of options.result!) {
            assert.ok(Math.abs(point.val! - 10) < 0.001, `expected ~10, got ${point.val}`);
        }
    });

    it('always reports the integral of a smart interval in value x hours', () => {
        // In contrast to the fixed-step integral, the smart intervals do NOT apply `integralUnit`.
        const timeIntervals = [{ start: 0, end: HOUR }];
        const options = initAggregate(
            {
                start: 0,
                end: HOUR,
                limit: 2000,
                aggregate: 'integral',
                integralUnit: 60, // would multiply the fixed-step result by 60
                removeBorderValues: true,
            },
            'test.0.value',
            timeIntervals,
        );
        aggregation(options, [
            { ts: -1000, val: 10 },
            { ts: HOUR, val: 10 },
        ]);
        finishAggregation(options);

        assert.strictEqual(options.result!.length, 1);
        assert.ok(Math.abs(options.result![0].val! - 10) < 0.001, `expected ~10, got ${options.result![0].val}`);
    });
});
