# Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ## **WORK IN PROGRESS**
-->
## **WORK IN PROGRESS**
- (@DutchmanNL) Fixed every aggregate returning `null` for boolean states: they arrive as real `true`/`false`,
  and `parseFloat(true)` is `NaN`, so a boolean series was discarded as if it were all gaps. Booleans now take
  part in the arithmetic as `1`/`0` (thanks to @theshengfui, ioBroker/ioBroker.sql#360)

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
