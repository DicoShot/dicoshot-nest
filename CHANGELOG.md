# Changelog

## Unreleased

### Changed

- **`retry` is now enabled by default** (2 retries, 500ms exponential backoff). Set `retry: false` to restore the previous behavior.
- Only network errors, `429` and `5xx` are retried. Other `4xx` responses fail immediately.
- `Retry-After` accepts only numeric seconds (decimals allowed) and is capped at 30 seconds; other values fall back to the backoff.
- The final delivery error now includes the status code and the first 200 characters of Discord's response body (never the webhook URL).

### Fixed

- `@DicoshotNotify` no longer fails an already-successful request when a resolver or `sendCustom` throws.
- Notifications are trimmed to Discord's embed limits instead of being rejected with `400`.
