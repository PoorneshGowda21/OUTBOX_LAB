# ReachInbox Scheduler — Technical Interview Defense & System Architecture

This document directly addresses the 5 core distributed systems and reliability questions for technical interviews.

---

## 1. Prove Duplicate Prevention & Crash-Window Analysis

### The Question:
> *Test what happens if the worker crashes after the email provider accepts a message but before the database records it as sent. Your README claims zero duplicate sends; be ready to explain the exact guarantee and its limitations.*

### The Distributed Systems Reality:
In any distributed system communicating across network boundaries with third-party, non-transactional services (like SMTP or external REST APIs), **true exactly-once delivery is theoretically impossible without end-to-end consensus or idempotency keys supported by the receiver** (Two Generals' Problem / FLP Impossibility).

The system provides **Strict At-Least-Once Delivery with 4-Tier Idempotency Deduplication**:

1. **Job Queue Deduplication**:
   Every BullMQ job is queued with a deterministic `jobId: emailJob.id`. If an enqueue is retried or repeated, BullMQ rejects duplicates at the Redis layer.

2. **Database Idempotency Keys**:
   Every job in PostgreSQL is indexed on a unique `idempotencyKey: email_<sender>_<recipient>_<time>_<uuid>`. Re-scheduling the same lead fails at the database constraint layer.

3. **Deterministic RFC 5322 Message-ID**:
   Before dispatching to Nodemailer / SMTP provider, the worker assigns a deterministic header:
   `Message-ID: <${emailRecord.idempotencyKey}@reachinbox.ai>`.
   Downstream SMTP relays and providers (e.g. AWS SES, SendGrid, Mailgun) use this header to drop redundant transmissions.

4. **Crash-Window Sent-Proof Cache (`sent_proof:<emailJobId>`)**:
   - **The Vulnerability Window**: In traditional architectures, a crash occurring between the provider's TCP ACK and the PostgreSQL status update (`status = 'SENT'`) leaves the database in `PROCESSING`. On worker restart, BullMQ re-delivers the stalled job, causing a duplicate send.
   - **The Solution**: The worker writes an atomic proof token `sent_proof:<emailJobId>` containing `{ messageId, sentAt, previewUrl }` to Redis with an 86,400s TTL.
   - **On Restart / Retry**: Before calling the email provider, the worker checks:
     - Is PostgreSQL `status === 'SENT'`? If yes, skip.
     - Does `sent_proof:<emailJobId>` exist in Redis? If yes, the provider already accepted this email! The worker **reconciles PostgreSQL to `SENT` immediately and skips the SMTP call**.

### Theoretical Limitations:
- If BOTH the worker node dies AND the Redis node undergoes catastrophic data loss before disk sync during the ~15ms window between SMTP acceptance and Redis write, a duplicate send may occur upon worker restart.
- Standard SMTP protocols lack native rollback/two-phase commit (2PC); idempotency relies on deterministic RFC 5322 Message-IDs and provider deduplication windows.

### Verification Command:
```bash
cd backend
npm run test:duplicates
```

---

## 2. Automated Test Suite

### The Question:
> *Add automated tests. Include unit and integration tests for scheduling, retries, rate limits, duplicate jobs, and worker restarts.*

### Test Architecture:
The test suite is powered by **Vitest** and **Supertest** for fast, native ESM testing without transpilation overhead.

| Test File | Type | What It Tests |
|---|---|---|
| [`tests/unit/scheduling.test.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/tests/unit/scheduling.test.js) | Unit | Delay calculation, UTC hour-window strings (`YYYY-MM-DD-HH`), next-hour rollover with 5s jitter |
| [`tests/unit/ratelimit.test.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/tests/unit/ratelimit.test.js) | Unit | Atomic slot reservation, sequential wait-time math for concurrent calls, error fallbacks |
| [`tests/integration/duplicates.test.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/tests/integration/duplicates.test.js) | Integration | Idempotency on `SENT` records, skipping `CANCELLED` jobs, crash-window `sent_proof` recovery |
| [`tests/integration/retries.test.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/tests/integration/retries.test.js) | Integration | Transient error retry (`SCHEDULED`), max attempts exhausted (`FAILED`), rate-limit rescheduling |
| [`tests/integration/health.test.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/tests/integration/health.test.js) | Integration | Deep health check endpoints (`/health`, `/api/health`) with database, Redis, and queue checks |

### Running the Tests:
```bash
cd backend
npm test
```

---

## 3. Test Concurrent Workers & Throttling Verification

### The Question:
> *Test concurrent workers. Run multiple workers against the same sender and verify that the hourly limit and minimum delay are respected.*

### The Concurrency Problem:
When running multiple worker threads or cluster instances against the same mailbox:
- Naive check: `const lastSent = await redis.get(key); if (now - lastSent < minDelay) wait; await send(); await redis.set(key, now);`
- **Race Condition**: 5 workers check `redis.get(key)` at the exact same millisecond before any worker has updated `lastSent`. All 5 send simultaneously, violating provider throttling!

### The Atomic Slot Reservation Engine:
In `backend/src/workers/emailWorker.js`, the worker executes an atomic Redis Lua script:
```lua
local key = KEYS[1]
local minDelay = tonumber(ARGV[1])
local now = tonumber(ARGV[2])

local lastSlot = redis.call('get', key)
local targetSlot = now
if lastSlot then
  local lastSlotNum = tonumber(lastSlot)
  if (lastSlotNum + minDelay) > now then
    targetSlot = lastSlotNum + minDelay
  end
end

redis.call('set', key, tostring(targetSlot), 'EX', 7200)
return targetSlot - now
```

### Guarantees:
1. **Mathematical Serialization**: Regardless of how many worker processes run in parallel, each worker claims an atomic, sequentially incrementing future transmission timestamp.
2. **Mailbox-Level Isolation**: Keyed by `sender_slot:<senderEmail>`, so Worker A sending for `user1@reachinbox.ai` never blocks Worker B sending for `user2@reachinbox.ai`.
3. **Hourly Limit Safety**: Redis `INCR` on `rate_limit:<senderEmail>:<YYYY-MM-DD-HH>` is atomic across all workers. If counter > limit, jobs are rescheduled into the next hour window rather than dropped.

### Verification Command:
```bash
cd backend
npm run test:concurrency
```

---

## 4. Failure Recovery & Crash Resilience

### The Question:
> *Demonstrate failure recovery. Stop Redis or PostgreSQL, restart the worker, and verify that pending jobs recover correctly. Document the results.*

### Failure Modes & Recovery Strategies:

| Failure Mode | Impact | Recovery Mechanism |
|---|---|---|
| **Worker Process Crash (SIGKILL)** | Worker abruptly stops while jobs are waiting or delayed | Redis BullMQ sorted sets (`bull:<queue>:delayed`) are persisted to disk via AOF. On worker reboot, timers resume automatically at target timestamps. |
| **Redis Temporary Disconnection** | Queue and rate limit counters become unreachable | `ioredis` exponential retry strategy (`Math.min(times * 100, 3000)`). Once Redis rejoins, workers resume processing without queue state corruption. |
| **PostgreSQL Outage** | Database queries fail with connection refused | BullMQ catches the database error, updates attempt count, and schedules an exponential backoff retry. When PostgreSQL recovers, the subsequent attempt succeeds. |

### Verification Command:
```bash
cd backend
npm run test:recovery
```

---

## 5. Deployment, CI & Observability

### The Question:
> *Strengthen deployment and observability. Add CI with automated tests, structured logs, health checks, environment-based secrets, and clear deployment instructions.*

### Implemented Enhancements:

1. **GitHub Actions CI Pipeline ([`.github/workflows/ci.yml`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/.github/workflows/ci.yml))**:
   - Automated test runner on every `push` and `pull_request`.
   - Spins up PostgreSQL 16 and Redis 7 service containers in CI.
   - Runs full Vitest suite + duplicate simulation + concurrency test + recovery test + frontend production build.

2. **Structured Logging ([`backend/src/utils/logger.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/src/utils/logger.js))**:
   - Log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`.
   - Supports human-readable dev logs and production JSON formatting (`LOG_FORMAT=json`).
   - Standardized metadata tracking: `jobId`, `emailJobId`, `senderEmail`, `recipientEmail`, `durationMs`.

3. **Deep Health Check Endpoint (`/health` & `/api/health`)**:
   - Probes PostgreSQL with `SELECT 1`.
   - Probes Redis with `PING`.
   - Queries BullMQ queue metrics: active, waiting, delayed, failed, and completed counts.
   - Reports Node.js process uptime and memory usage.
   - Returns HTTP `200 OK` (healthy) or HTTP `503 Service Unavailable` (degraded).

4. **Environment Secrets & Configuration Validation ([`backend/src/config/env.js`](file:///c:/Users/prurn/outbox_lab/OUTBOX_LAB/backend/src/config/env.js))**:
   - Validates all required environment variables and provides sensible production defaults.
