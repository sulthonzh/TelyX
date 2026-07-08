# Changelog

## [Unreleased] — 2026-07-09

### Fixed
- Reject `NaN` as `sampleRate` (passed range check due to NaN comparison semantics)
- ESLint `@typescript-eslint/no-this-alias` error in `Telyx.ts` (replaced `const self = this` with arrow functions)

### Added
- 63 branch coverage tests covering TelyxMiddleware (HTTP, database, cache, AI middleware branches), Telyx core (config validation, sanitizeInput, track proxy, destroy/flush, retry queue), and TelyxAnalytics edge cases
- Branch coverage improved from 73.53% → 85.2% overall
- `STATUS.md` with full exceptional checklist audit

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
