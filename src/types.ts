/**
 * Shared types for the ioBroker history/sql/influxdb adapters.
 *
 * These types describe the `getHistory` request/response contract and the
 * internal state used while aggregating data points.
 */

/**
 * A calendar date used to describe the borders of "smart" intervals.
 *
 * In contrast to a plain timestamp, a smart date is resolved with respect to
 * the real length of months and to daylight saving time, so that e.g. a
 * "month" interval really covers 28/29/30/31 days.
 */
export type SmartDate = {
    /** Day of month: 1 .. 31 */
    date: number;
    /** Month: 1 .. 12 */
    month: number;
    /** Year: 1970 .. 2300 */
    year: number;
    /** If `true`, the time is calculated as "start of this hour/day/month" minus 1 ms */
    end?: boolean;
    /** Time zone offset in hours of the standard (winter) time. Default is 1 (Germany) */
    timeZone?: number;
};

/** Generic data entry with a timestamp and arbitrary numeric values */
export interface DataEntry {
    ts: number;

    [valueName: string]: number;
}

/** One data point as it is stored and returned by the history adapters */
export interface IobDataEntry {
    /** Value. `null` means "no value" (e.g. the state was deleted or the adapter was stopped) */
    val: number | null;
    /** Timestamp in ms */
    ts: number;
    /** Last change timestamp in ms */
    lc?: number;
    /** Human-readable time. Only added if requested */
    time?: string;
    /** State ID. Only added if `addId` was requested */
    id?: string;
    ack?: boolean | 0 | 1;
    user?: string;
    /** Comment */
    c?: string;
    from?: string;
    /** Quality code */
    q?: number;
    /** `true` if this value was interpolated and not really stored */
    i?: boolean;
}

/** Aggregation method */
export type AggregateMethod =
    | 'onchange'
    | 'minmax'
    | 'min'
    | 'max'
    | 'average'
    | 'total'
    | 'count'
    | 'none'
    | 'percentile'
    | 'quantile'
    | 'integral'
    | 'integralTotal';

/** Options of the `getHistory` message */
export interface GetHistoryOptions {
    instance?: string;

    /** Start time in ms */
    start?: number;
    /** End time in ms. If not defined, it is "now" */
    end?: number;
    /** Step in ms of intervals. Used in aggregate (max, min, average, total, ...) */
    step?: number;

    /** Start of smart intervals. It calculates the statistics according to real month length */
    smartStart?: SmartDate;
    /** Type of smart intervals */
    smartType?: 'hour' | 'day' | 'month';
    /** End of smart intervals. It calculates the statistics according to real month length. If not defined, the end is "now" */
    smartEnd?: SmartDate;

    /** number of values if aggregate is 'onchange' or number of intervals if other aggregate method. Count will be ignored if step is set, else default is 500 if not set */
    count?: number;
    /** if `from` field should be included in answer */
    from?: boolean;
    /** if `ack` field should be included in answer */
    ack?: boolean;
    /** if `q` field should be included in answer */
    q?: boolean;
    /** if `id` field should be included in answer */
    addId?: boolean;
    /** do not return more entries than limit */
    limit?: number;
    /** round result to number of digits after decimal point */
    round?: number | undefined;
    /** if null values should be included (false), replaced by last not null value (true) or replaced with 0 (0) */
    ignoreNull?: boolean | 0;
    /** This number will be returned in answer, so the client can assign the request for it */
    sessionId?: number;
    /** aggregate method (Default: 'average') */
    aggregate?: AggregateMethod;
    /** Returned data is normally sorted ascending by date, this option lets you return the newest instead of the oldest values if the number of returned points is limited */
    returnNewestEntries?: boolean;
    /** By default, the additional border values are returned to optimize charting. Set this option to true if this is not wanted (e.g. for script data processing) */
    removeBorderValues?: boolean;
    /** when using aggregate method `percentile` defines the percentile level (0..100)(defaults to 50) */
    percentile?: number;
    /** when using aggregate method `quantile` defines the quantile level (0..1)(defaults to 0.5) */
    quantile?: number;
    /** when using aggregate method `integral` defines the unit in seconds (defaults to 60s). e.g. to get integral in hours for Wh or such, set to 3600. */
    integralUnit?: number;
    /** when using aggregate method `integral` defines the interpolation method (defaults to `none`). */
    integralInterpolation?: 'none' | 'linear';
    /** This means, that the data was pre-aggregated when stored (e.g. by influxdb) */
    preAggregated?: boolean;
}

/** One interval of the aggregation */
export interface TimeInterval {
    start: number;
    end: number;
    /** ISO string of `start`. Only filled in debug mode */
    startS?: string;
    /** ISO string of `end`. Only filled in debug mode */
    endS?: string;
}

/** Options of the `getStatistics` message */
export interface GetStatistics {
    timeType: 'hour' | 'day' | 'month';
    startDate: SmartDate;
    endDate?: SmartDate;
    /** Object ID */
    id?: string;
    /** Winter time zone in hours. For Germany, it is +1 */
    timeZone?: number;
}

/** `GetHistoryOptions` extended by the fields the adapters add internally */
export interface GetHistoryOptionsExtended extends GetHistoryOptions {
    uuid?: string;
    id?: string;
    path?: string;

    time?: boolean;
    humanTime?: boolean;

    endS?: string;
    startS?: string;

    pretty?: boolean;

    logDebug?: boolean;
}

/** One aggregation slot with the running min/max/start/end values */
export interface ProcessingEntry {
    val: { ts: number | null; val: number | null };
    max: { ts: number | null; val: number | null };
    min: { ts: number | null; val: number | null };
    start: { ts: number | null; val: number | null };
    end: { ts: number | null; val: number | null };
}

/**
 * The working state of one aggregation run.
 *
 * It is created by {@link initAggregate}, filled by {@link aggregation} and
 * converted into `result` by {@link finishAggregation}.
 */
export interface InternalHistoryOptions extends GetHistoryOptions {
    id?: string;
    logDebug?: boolean;
    log?: (text: string) => void;
    processing?: ProcessingEntry[];

    result?: IobDataEntry[];

    overallLength?: number;
    maxIndex?: number;
    averageCount?: number[];
    quantileDataPoints?: number[][];
    integralDataPoints?: IobDataEntry[][];
    totalIntegralDataPoints?: IobDataEntry[];

    timeIntervals?: TimeInterval[];
    currentTimeInterval?: number;
}
