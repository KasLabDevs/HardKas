# Coverage Normalization Notes

1. Fixed Double Counting: Commands are now mapped 1:1 against the discovery set by keeping the "highest order" execution state (Success > Failed > Help > Skipped).
2. Fixed npm alias bug: The Auto-runner was incorrectly invoking 'npx telemetry tail' instead of 'npx hardkas telemetry tail', which caused random npm packages to be fetched and inflated the failed command count.
3. SDK Mini App: Implemented a robust Node script that successfully instantiates `Hardkas.create` via the SDK facade and calls the methods required for App E.