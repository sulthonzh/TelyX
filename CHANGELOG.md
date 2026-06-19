# Changelog

## [1.1.0] — 2026-06-19

### Breaking Changes
- Removed `axios` dependency — now uses native `fetch` (Node 18+)
- Removed `jest` / `ts-jest` devDependencies — project uses `node:test`
- Removed `eslint`, `@typescript-eslint/*`, `rimraf` devDependencies

### Fixed
- Flush timer `.unref()` so background telemetry doesn't block process exit
- `recordFailure()` now creates trackable events with `success=false` for accurate error rate analytics

### Added
- `getBatch()` method to inspect current unsent telemetry data
- Comparison table in README vs OpenTelemetry, Langfuse, Datadog
- 3 real-world examples: production chatbot, multi-provider cost tracking, Express API
- `exports` field in package.json for clean ESM/CJS consumption
- Retry queue for failed batches (max 10, exponential backoff)
- Input sanitization for PII protection (string truncation, object masking)
- Anomaly detection for response times and error rates

### Removed
- `axios` dependency (zero external dependencies now)
- `jest`, `ts-jest`, `@types/jest` devDependencies
- `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` devDependencies
- `rimraf` devDependency (uses `rm -rf` in clean script)

## [1.0.0] — 2026-06-08

Initial release.
