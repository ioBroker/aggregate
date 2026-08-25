import assert from 'node:assert';
import { beautify } from '../src/index';
import type { InternalHistoryOptions, IobDataEntry } from '../src/index';

function options(overrides: Partial<InternalHistoryOptions>, result: IobDataEntry[]): InternalHistoryOptions {
    return { start: 100, end: 500, aggregate: 'average', result, ...overrides };
}

describe('beautify', () => {
    it('drops the points outside of the requested range', () => {
        const opt = options({ removeBorderValues: true }, [
            { ts: 50, val: 1 },
            { ts: 200, val: 2 },
            { ts: 600, val: 3 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [{ ts: 200, val: 2 }]);
    });

    it('rounds to the requested precision', () => {
        const opt = options({ removeBorderValues: true, round: 100 }, [{ ts: 200, val: 3.14159 }]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [{ ts: 200, val: 3.14 }]);
    });

    it('keeps null values by default', () => {
        const opt = options({ removeBorderValues: true }, [
            { ts: 200, val: null },
            { ts: 300, val: 2 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 200, val: null },
            { ts: 300, val: 2 },
        ]);
    });

    it('removes null values for ignoreNull=true', () => {
        const opt = options({ removeBorderValues: true, ignoreNull: true }, [
            { ts: 200, val: null },
            { ts: 300, val: 2 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [{ ts: 300, val: 2 }]);
    });

    it('replaces null values with 0 for ignoreNull=0', () => {
        const opt = options({ removeBorderValues: true, ignoreNull: 0 }, [
            { ts: 200, val: null },
            { ts: 300, val: 2 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 200, val: 0 },
            { ts: 300, val: 2 },
        ]);
    });

    it('accepts ignoreNull as a string, as it arrives over the message bus', () => {
        const opt = options({ removeBorderValues: true, ignoreNull: 'true' as unknown as boolean }, [
            { ts: 200, val: null },
            { ts: 300, val: 2 },
        ]);
        beautify(opt);
        assert.strictEqual(opt.ignoreNull, true);
        assert.deepStrictEqual(opt.result, [{ ts: 300, val: 2 }]);
    });

    it('interpolates the value at the start border', () => {
        // 0 at ts 0 and 10 at ts 200 => 5 at ts 100
        const opt = options({}, [
            { ts: 0, val: 0 },
            { ts: 200, val: 10 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 100, val: 5, i: true },
            { ts: 200, val: 10 },
        ]);
    });

    it('interpolates the value at the end border', () => {
        // 10 at ts 400 and 20 at ts 600 => 15 at ts 500
        const opt = options({}, [
            { ts: 400, val: 10 },
            { ts: 600, val: 20 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 100, val: null },
            { ts: 400, val: 10 },
            { ts: 500, val: 15, i: true },
        ]);
    });

    it('adds a null border if nothing is known before the start', () => {
        const opt = options({}, [
            { ts: 200, val: 10 },
            { ts: 500, val: 20 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 100, val: null },
            { ts: 200, val: 10 },
            { ts: 500, val: 20 },
        ]);
    });

    it('draws a step chart up to the end with the next known value', () => {
        // The point at 600 is outside of the range and is therefore removed, but it is still
        // used as the border value, so that the chart does not end in the middle of nowhere.
        const opt = options({ aggregate: 'onchange' }, [
            { ts: 200, val: 10 },
            { ts: 600, val: 20 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 100, val: null },
            { ts: 200, val: 10 },
            { ts: 500, val: 20 },
        ]);
    });

    it('does not touch the borders if they were switched off', () => {
        const opt = options({ removeBorderValues: true }, [{ ts: 200, val: 10 }]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [{ ts: 200, val: 10 }]);
    });

    it('adds the state ID on request', () => {
        const opt = options({ removeBorderValues: true, addId: true, id: 'test.0.value' }, [{ ts: 200, val: 10 }]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [{ ts: 200, val: 10, id: 'test.0.value' }]);
    });

    it('does not overwrite an already set ID', () => {
        const opt = options({ removeBorderValues: true, addId: true, id: 'test.0.value' }, [
            { ts: 200, val: 10, id: 'other.0.value' },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [{ ts: 200, val: 10, id: 'other.0.value' }]);
    });

    it('limits the raw values to the requested count', () => {
        const opt = options({ aggregate: 'none', count: 2 }, [
            { ts: 200, val: 1 },
            { ts: 300, val: 2 },
            { ts: 400, val: 3 },
        ]);
        beautify(opt);
        assert.deepStrictEqual(opt.result, [
            { ts: 300, val: 2 },
            { ts: 400, val: 3 },
        ]);
    });
});
