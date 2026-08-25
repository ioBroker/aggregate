// The smart intervals resolve daylight saving time via the *local* time zone of the process.
// Pin it, so the expectations below are reproducible on every machine and on the CI.
process.env.TZ = 'Europe/Berlin';

// Don't silently swallow unhandled rejections
process.on('unhandledRejection', e => {
    throw e;
});
