# @iobroker/aggregate

Shared data aggregation for the ioBroker history adapters.

`ioBroker.history`, `ioBroker.sql` and `ioBroker.influxdb` all answer the same `getHistory` message and
therefore all need the same bucket logic, the same border handling and the same integral calculation.
Until now every adapter carried its own copy of `aggregate.ts` with the comment
_"THIS file should be identical with SQL and history adapter's one"_ — which, of course, they were not.

This package is that file, extracted, typed and covered by unit tests.

## Installation

```bash
npm install @iobroker/aggregate
```

## Usage

The aggregation runs in three steps: initialize the state, feed the raw data points into it, finish it.

```ts
import { initAggregate, aggregation, finishAggregation } from '@iobroker/aggregate';
import type { IobDataEntry } from '@iobroker/aggregate';

const rawData: IobDataEntry[] = await readFromDatabase();

const options = initAggregate({
    start: Date.now() - 86400000,
    end: Date.now(),
    count: 500,
    limit: 2000,
    aggregate: 'average',
});

aggregation(options, rawData);
finishAggregation(options);

console.log(options.result);
```

Most adapters do not need the three steps at all, because `sendResponse` does everything including the
answer on the message bus:

```ts
import { sendResponse } from '@iobroker/aggregate';

adapter.on('message', msg => {
    if (msg.command === 'getHistory') {
        const startTime = Date.now();
        const options = { ...msg.message.options, id: msg.message.id };
        readFromDatabase(options)
            .then(data => sendResponse(adapter, msg, options.id, options, data, startTime))
            .catch(e => sendResponse(adapter, msg, options.id, options, e.toString(), startTime));
    }
});
```

## Aggregation methods

| Method           | Result per interval                                                             |
|------------------|---------------------------------------------------------------------------------|
| `none`           | the raw values, only cut to the requested range                                 |
| `onchange`       | the raw values, drawn as a step chart                                           |
| `minmax`         | start, min, max and end of the interval, in chronological order                 |
| `min`            | the smallest value                                                              |
| `max`            | the largest value                                                               |
| `average`        | the arithmetic mean, rounded to two decimals                                    |
| `total`          | the sum of all values                                                           |
| `count`          | the number of values                                                            |
| `percentile`     | the value at the requested percentile (`percentile`: 0..100, default 50)        |
| `quantile`       | the value at the requested quantile (`quantile`: 0..1, default 0.5)             |
| `integral`       | the integral per interval, divided by `integralUnit` seconds (default 60)       |
| `integralTotal`  | one single integral over the whole range, in _value × hours_                    |

`integral` supports two interpolations: `none` (default, the value is held until the next data point)
and `linear` (a straight line is drawn between two data points).

> **Note:** `integralUnit` is applied to the fixed-step integral and to `intervalBorders`. If smart intervals are
> handed to `initAggregate`, the integral is always returned in _value × hours_, exactly like `integralTotal`.

## Smart intervals

Statistics per hour, per day or per month cannot use a fixed step, because a real day has 23, 24 or 25
hours and a real month has 28 to 31 days. `getSmartIntervals` builds the calendar-aligned intervals,
which can be handed to `initAggregate` instead of a step:

```ts
import { getSmartIntervals, initAggregate, aggregation, finishAggregation } from '@iobroker/aggregate';

// every day of March 2026, including the 23 hours long one
const intervals = getSmartIntervals(
    { year: 2026, month: 3, date: 1, timeZone: 1 },
    'day',
    { year: 2026, month: 4, date: 1, timeZone: 1 },
);

const options = initAggregate(
    { start: intervals[0].start, end: intervals[intervals.length - 1].end, aggregate: 'integral' },
    'javascript.0.consumption',
    intervals,
);
```

The daylight saving time is resolved via the **local** time zone of the process, `timeZone` only gives
the offset of the standard (winter) time in hours — `1` for Germany.

## Interval borders

A client of `getHistory` usually wants the intervals of **its own** time zone, e.g. a chart with one bar per
local day. `count` or `step` split the range into equally long intervals, so every interval after a switch of the
daylight saving time ends an hour away from the midnight, and a value written at 23:59:59 lands in the next day.
Instead, the client can send the borders of the intervals itself:

```ts
sendTo('sql.0', 'getHistory', {
    id: 'javascript.0.consumption',
    options: {
        // the local midnights of 19.10. to 28.10.2026, the 25th has 25 hours
        intervalBorders: [/* 19.10. 00:00 */ 1792357200000, /* ... */ /* 28.10. 00:00 */ 1793138400000],
        aggregate: 'total',
        // still sent, so an adapter that does not know the borders answers with the old fixed step
        start: 1792357200000,
        end: 1793138400000,
        count: 9,
    },
});
```

`n + 1` strictly ascending borders give `n` intervals `[borders[i], borders[i + 1])`, and `start` and `end` are
taken from the first and the last border. Every result carries the middle of its interval as timestamp. Borders
that are not valid or that give more intervals than `limit` are ignored, and the fixed step is used.

The adapters copy the options of the message field by field, so they must take the borders over, ideally with
`parseIntervalBorders` and before they query the database for `start` and `end`:

```ts
const intervalBorders = parseIntervalBorders(msg.message.options.intervalBorders, options.limit);
if (intervalBorders) {
    options.intervalBorders = intervalBorders;
    options.start = intervalBorders[0];
    options.end = intervalBorders[intervalBorders.length - 1];
}
```

Data that was pre-aggregated by the database (`preAggregated`) is passed through untouched, so the borders have
no effect there.

## API

| Export                      | Description                                                                 |
|-----------------------------|-----------------------------------------------------------------------------|
| `initAggregate`             | builds the aggregation state out of the `getHistory` options                |
| `aggregation`               | sorts the raw data points into the buckets                                  |
| `finishAggregation`         | calculates the result of every bucket and beautifies it                     |
| `beautify`                  | cuts to the range, handles nulls, adds border values, rounds, adds the ID   |
| `sendResponse`              | the complete `getHistory` answer including the aggregation                  |
| `sendResponseCounter`       | the `getCounter` answer: the sum of all increases of a counter              |
| `calcDiff`                  | the trapezoid between two data points, in _value × hours_                   |
| `sortByTs`                  | sort comparator for `IobDataEntry`                                          |
| `parseIntervalBorders`      | validates the `intervalBorders` of a `getHistory` request                   |
| `getSmartIntervals`         | calendar-aligned intervals per hour, day or month                           |
| `HSmartDate`                | a date that can be advanced hour by hour over DST and month borders         |

The types (`GetHistoryOptions`, `InternalHistoryOptions`, `IobDataEntry`, `TimeInterval`, `SmartDate`, …)
are exported as well and are also available from the subpath `@iobroker/aggregate/types`.

## Development

```bash
npm ci
npm run build          # compile to build/
npm run check          # lint + type check + tests
npm test               # unit tests only
npm run test:coverage  # unit tests with a coverage report
```

The unit tests pin `process.env.TZ` to `Europe/Berlin`, because the smart intervals depend on the local
time zone.

## License

MIT — Copyright (c) 2019-2026 bluefox <dogafox@gmail.com>
