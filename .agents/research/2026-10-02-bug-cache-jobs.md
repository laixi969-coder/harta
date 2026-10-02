# Cache / background jobs / publication state audit

Scope: `lib/workspace.mjs`, `lib/research.mjs`, `lib/keyword-basis-cache.mjs` and regression tests. All reproduction below is isolated API/module testing, not browser evidence. No production customer records were modified. Existing uncommitted edits were preserved.

## Confirmed findings and fixes

| Severity | Reproduction | Root cause | Fix / evidence |
| --- | --- | --- | --- |
| High | Start content jobs for many different customers/accounts while generators remain pending | Only per-customer `running` existed; HTTP completed before generation, so HTTP concurrency alone cannot cap background work | `workspace.mjs:126`: actual pending jobs capped at 2/account, 8/process; 429 + retryAfter; completion and rejection release. Capacity rejection before new-customer persistence avoids duplicate retry creation. |
| High | Expire a customer job, sweep, retry repeatedly without settling old promises | UI stale-job cleanup releases per-customer lock while upstream may still be running | Separate `activeJobs` retains resource reservations until actual promise settlement; timeout/retry regression proves no bypass and stale results cannot overwrite new jobs. |
| High | Generator rejects while workspace storage is unwritable | Error-status persistence itself rejects the detached async function | Final catch prevents unhandled rejection/server termination, emits fixed non-sensitive log text, and always releases resource capacity. Disk-failure regression added. |
| Medium | Publish a post, edit its body, inspect title/cover/body status | `editLine` only changed text; previous publication state remained attached to new content | Actual edits reset the entire post's published fields to selected and clear publishedAt. No-op saves and other posts retain status. |
| Medium | A prior manual edit differs from original; automatic repair returns the original sentence | `fixPack` skipped writing when repair equaled original, leaving the old override active | Remove stale override when reverting; reset publication state for actual automatic edits. |
| Medium | Change search API credential, LLM model or channel while business is unchanged | Research fingerprint tracked only key presence and ignored actual LLM selection | Fingerprint now hashes effective search credentials and selected model/channel/credential; administrative sync timestamps do not invalidate. No plaintext secret is exposed. |
| Medium | Several matching snapshots exist across packs/drops; mutate a reused nested source | First array match could select older research; shallow clone aliases historical nested objects | Choose latest valid snapshot; deep clone; expired/future timestamps rejected. Regression covers boundaries. |
| Medium | Cache 32 large keyword analyses | Entry-count bound gave no byte-size bound | LRU additionally caps serialized result payload at 16 MiB; oversized values are returned without caching; expired entries reclaimed on lookup. 32 entries/60-second TTL remain. |
| Low | Inject negative maxEntries into cache factory, or mutate the builder's returned object after cache insert | Invalid eviction configuration could loop; cache retained mutable builder reference | Validate capacities and TTL; clone on insert/return. |

## Verification

`npx vitest run lib/workspace-capacity.test.mjs lib/workspace.test.mjs lib/research.test.mjs lib/keyword-basis-cache.test.mjs`: 4 files, 59 tests passed. `git diff --check` clean. Existing same-customer concurrency, stale-task retry, late completion, preservation of unrelated edits, independent account workspace behavior remain covered.

Pass accounting: initial scan found concurrency and cache issues; integration rescan added publication state and original-text restoration; next rescan added failure-of-error-persistence guard. Last two targeted re-reads/test gates found no further high/medium regression. One test fixture initially used a diagnosis pack for a daily-only publication API; corrected its tier before green rerun (not an implementation failure).

## Limits / handoff

- Limits are per Node process; multiple workers need a shared queue/limiter. The separate security agent's synchronous expensive-request pool and this background pool are independent: each allows 8 globally, so combined process maximum is 16 admitted operations, with nested upstream calls possible.
- A permanently unresolved upstream promise retains its capacity rather than pretending it stopped. Existing network timeouts normally settle it; this change does not introduce cancellation into every provider client.
- Cache byte bound measures encoded payload, not exact V8 heap overhead. It bounds retained cache payload, not the transient cost of computing a large allowed keyword batch.
- Research remains scoped to the supplied customer's persisted history. Keyword basis is a deterministic memoization over every builder input; cached outputs are isolated copies. No new cross-user research cache was introduced.
- Shared-link token misses scan workspaces; the security agent was asked to apply a dedicated `/p/` request limit.
- Main agent owns browser walkthrough, UX evidence, final integrated suite, report, commit and push.
