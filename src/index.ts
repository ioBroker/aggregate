export {
    calcDiff,
    initAggregate,
    aggregation,
    finishAggregation,
    finishAggregationForIntegral,
    finishAggregationForIntegralEx,
    finishAggregationPercentile,
    beautify,
    sendResponse,
    sendResponseCounter,
    sortByTs,
} from './aggregate';

export { HSmartDate, getSmartIntervals } from './time';

export type {
    AggregateMethod,
    DataEntry,
    GetHistoryOptions,
    GetHistoryOptionsExtended,
    GetStatistics,
    InternalHistoryOptions,
    IobDataEntry,
    ProcessingEntry,
    SmartDate,
    TimeInterval,
} from './types';
