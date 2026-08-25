import assert from 'node:assert';
import { sendResponse, sendResponseCounter } from '../src/index';
import type { GetHistoryOptions, IobDataEntry } from '../src/index';

interface SentMessage {
    from: string;
    command: string;
    payload: any;
}

function createAdapter(): { adapter: any; sent: SentMessage[]; errors: string[] } {
    const sent: SentMessage[] = [];
    const errors: string[] = [];
    const adapter = {
        log: {
            error: (text: string): void => {
                errors.push(text);
            },
            warn: (): void => {},
            info: (): void => {},
            debug: (): void => {},
        },
        sendTo: (from: string, command: string, payload: any): void => {
            sent.push({ from, command, payload });
        },
    };
    return { adapter, sent, errors };
}

const msg = {
    from: 'system.adapter.admin.0',
    command: 'getHistory',
    callback: { message: {}, id: 1, ack: false, time: 0 },
} as any;

describe('sendResponse', () => {
    it('forwards an error and logs it', () => {
        const { adapter, sent, errors } = createAdapter();
        sendResponse(adapter, msg, 'test.0.value', { sessionId: 7 }, 'DB is gone', Date.now());
        assert.deepStrictEqual(errors, ['DB is gone']);
        assert.deepStrictEqual(sent[0].payload, { result: [], step: 0, error: 'DB is gone', sessionId: 7 });
        assert.strictEqual(sent[0].from, msg.from);
        assert.strictEqual(sent[0].command, msg.command);
    });

    it('answers with an empty result if there is no data', () => {
        const { adapter, sent } = createAdapter();
        sendResponse(adapter, msg, 'test.0.value', { sessionId: 7 }, [], Date.now());
        assert.deepStrictEqual(sent[0].payload, { result: [], step: null, sessionId: 7 });
    });

    it('passes the raw values through for aggregate=none', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 100, val: 1 },
            { ts: 500, val: 2 },
            { ts: 900, val: 3 },
        ];
        const options: GetHistoryOptions = {
            start: 100,
            end: 1000,
            step: 100,
            limit: 2000,
            aggregate: 'none',
            sessionId: 7,
        };
        sendResponse(adapter, msg, 'test.0.value', options, data, Date.now());
        assert.deepStrictEqual(sent[0].payload.result, [
            { ts: 100, val: 1 },
            { ts: 500, val: 2 },
            { ts: 900, val: 3 },
        ]);
        assert.strictEqual(sent[0].payload.step, 0, 'raw values have no step');
    });

    it('converts the numeric ack of the databases into a boolean', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 100, val: 1, ack: 1 },
            { ts: 500, val: 2, ack: 0 },
        ];
        sendResponse(
            adapter,
            msg,
            'test.0.value',
            { start: 100, end: 1000, step: 100, limit: 2000, aggregate: 'none', ack: true },
            data,
            Date.now(),
        );
        assert.deepStrictEqual(
            sent[0].payload.result.map((e: IobDataEntry) => e.ack),
            [true, false],
        );
    });

    it('aggregates the values and reports the used step', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 1010, val: 10 },
            { ts: 1020, val: 20 },
            { ts: 1150, val: 5 },
        ];
        const options: GetHistoryOptions = {
            start: 1000,
            end: 2000,
            step: 100,
            limit: 2000,
            aggregate: 'average',
            removeBorderValues: true,
            sessionId: 7,
        };
        sendResponse(adapter, msg, 'test.0.value', options, data, Date.now());
        assert.deepStrictEqual(sent[0].payload, {
            result: [
                { ts: 1050, val: 15 },
                { ts: 1150, val: 5 },
            ],
            step: 100,
            sessionId: 7,
        });
    });

    it('falls back to the first timestamp if no start was requested', () => {
        const { adapter, sent } = createAdapter();
        const options: GetHistoryOptions = { end: 2000, step: 100, limit: 2000, aggregate: 'average' };
        sendResponse(adapter, msg, 'test.0.value', options, [{ ts: 1010, val: 10 }], Date.now());
        assert.strictEqual(options.start, 1010);
        assert.strictEqual(sent[0].payload.result.length > 0, true);
    });

    it('cuts the oldest values if only a count without a start was requested', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 100, val: 1 },
            { ts: 200, val: 2 },
            { ts: 300, val: 3 },
        ];
        sendResponse(adapter, msg, 'test.0.value', { end: 1000, step: 100, limit: 2000, count: 2 }, data, Date.now());
        assert.deepStrictEqual(
            sent[0].payload.result.map((e: IobDataEntry) => e.ts),
            [200, 300],
        );
    });
});

describe('sendResponseCounter', () => {
    it('forwards an error and logs it', () => {
        const { adapter, sent, errors } = createAdapter();
        sendResponseCounter(adapter, msg, { sessionId: 7 }, 'DB is gone');
        assert.deepStrictEqual(errors, ['DB is gone']);
        assert.deepStrictEqual(sent[0].payload, { result: [], error: 'DB is gone', sessionId: 7 });
    });

    it('answers with 0 if there are less than two values', () => {
        const { adapter, sent } = createAdapter();
        sendResponseCounter(adapter, msg, { start: 0, end: 100, sessionId: 7 }, [{ ts: 10, val: 5 }]);
        assert.deepStrictEqual(sent[0].payload, { result: 0, step: null, sessionId: 7 });
    });

    it('sums up the increases of a counter that was reset in between', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 0, val: 100 },
            { ts: 10, val: 200 }, // +100
            { ts: 40, val: 500 }, // +300
            { ts: 50, val: 0 }, // reset
            { ts: 90, val: 400 }, // +400
            { ts: 100, val: 0 }, // reset
            { ts: 110, val: 100 }, // +100
        ];
        sendResponseCounter(adapter, msg, { start: 0, end: 110, sessionId: 7 }, data);
        assert.deepStrictEqual(sent[0].payload, { result: 900, sessionId: 7 });
    });

    it('interpolates the counter onto the requested start', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 0, val: 0 },
            { ts: 100, val: 100 },
            { ts: 200, val: 200 },
        ];
        // at ts 50 the counter is 50, so from 50 to 200 it grew by 150
        sendResponseCounter(adapter, msg, { start: 50, end: 200, sessionId: 7 }, data);
        assert.deepStrictEqual(sent[0].payload, { result: 150, sessionId: 7 });
    });

    it('interpolates the counter onto the requested end', () => {
        const { adapter, sent } = createAdapter();
        const data: IobDataEntry[] = [
            { ts: 0, val: 0 },
            { ts: 100, val: 100 },
            { ts: 200, val: 200 },
        ];
        // at ts 150 the counter is 150
        sendResponseCounter(adapter, msg, { start: 0, end: 150, sessionId: 7 }, data);
        assert.deepStrictEqual(sent[0].payload, { result: 150, sessionId: 7 });
    });
});
