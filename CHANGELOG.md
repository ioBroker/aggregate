# Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ## **WORK IN PROGRESS**
-->
## **WORK IN PROGRESS**
- (@DutchmanNL) Fixed `average`, `total`, `min`, `max`, `minmax`, `percentile` and `quantile` returning `null` for
  boolean states: they arrive as real `true`/`false`, and `parseFloat(true)` is `NaN`, so a boolean series was
  discarded as if it were all gaps. Booleans now take part in the arithmetic as `1`/`0`
  (thanks to @theshengfui, ioBroker/ioBroker.sql#360)
- (@GermanBluefox) Fixed `integral` reporting `0` for boolean states: it reads its own values and did so with a bare
  `parseFloat`, so it was not covered by the fix above and a switch that was on all day reported no on-time at all
- (@GermanBluefox) Fixed `minmax` returning a mixture of booleans and numbers for a boolean series: `start` and `end`
  kept the raw value while `min` and `max` were already numbers. All four are now numbers, as `val: number | null`
  promises
- (@GermanBluefox) `calcDiff` and the integral interpolation no longer depend on JavaScript coercing `true` to `1`
  in an addition, so `integralTotal` is correct by construction instead of by accident

## 1.0.1 (2026-08-26)
- (@joltcoke) Fixed `average` and `total` returning `null` for every interval that contains a `null` value:
  `parseFloat(null)` is `NaN` and poisoned the sum of the whole interval (thanks to @joltcoke,
  ioBroker/ioBroker.sql#526). As the result was `NaN` and not `null`, `ignoreNull` could not act on it either
- (@joltcoke) Fixed `min` returning a wrong value if the interval contains a `null`, `minmax` losing the minimum
  if the interval starts with a `null`, and `percentile`/`quantile` counting a `null` as `0`

## 0.1.0 (2026-08-25)
- (@GermanBluefox) Initial release: the aggregation of `ioBroker.history`, `ioBroker.sql` and `ioBroker.influxdb`
  extracted into a shared library
- (@GermanBluefox) Added the smart intervals (`getSmartIntervals`, `HSmartDate`) for calendar-aligned statistics
- (@GermanBluefox) Added unit tests for the aggregation, the border handling and the smart intervals
