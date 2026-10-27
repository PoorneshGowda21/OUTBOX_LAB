# ReachInbox Full-Stack Email Job Scheduler

[![JavaScript](https://img.shields.io/badge/JavaScript-ESM%20Node%2020-yellow.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3%20JSX-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![BullMQ](https://img.shields.io/badge/Queue-BullMQ%205-orange.svg)](https://docs.bullmq.io/)
[![Redis](https://img.shields.io/badge/Redis-7.0-red.svg)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Elasticsearch](https://img.shields.io/badge/Search-Elasticsearch%208-green.svg)](https://www.elastic.co/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest%20Passed-brightgreen.svg)](https://vitest.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)](https://tailwindcss.com/)

A production-grade, distributed cold outreach email job scheduler service and dashboard built with pure JavaScript (ESM) and React for **ReachInbox.ai (Outbox Labs)**.

---

## 📸 Key Capabilities & UI Preview

- **Persistent Delayed Job Queues**: Built with BullMQ and Redis. Strictly **no cron jobs**.
- **Server Restart Resilience**: Survives crashes and restarts without re-sending or losing delayed jobs.
- **Strict Idempotency**: Zero duplicate sends guaranteed via DB idempotency keys and BullMQ deduplication IDs.
- **Provider Throttling**: Minimum delay between consecutive email sends (default: **2 seconds**).
- **Atomic Hourly Rate Limiting**: Per-sender Redis hour-bucket counters (`rate_limit:<sender>:<YYYY-MM-DD-HH>`).
- **Graceful Rescheduling on Limit Hit**: Excess jobs are **never dropped or failed**—they are automatically deferred into the **next available hour window**.
- **Real-time Slack Alerts**: Dispatches rich Slack Block Kit notifications to connected channels the moment a sender's rate limit is reached.
- **Live BullMQ Queue Dashboard**: Real-time queue inspection board mounted at `/admin/queues`.
- **Ethereal Fake SMTP**: Sends test outreach emails and generates live, clickable web preview links for verification.
- **Elasticsearch Search**: Indexed search across subject, body, sender, and recipient leads with highlighting and DB fallback resilience.
- **Google OAuth Dashboard**: ReachInbox dark-mode UI with CSV lead parsing, recipient counter badges, and sender throughput gauges.

---

## 🏗️ Architecture & Technology Stack

```
                          ┌─────────────────────────────────────┐
                          │     React + Vite + Tailwind UI      │
                          │   (Dashboard, Compose, Gauges)      │
                          └──────────────────┬──────────────────┘
                                             │ HTTP / REST
                                             ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                          Express.js + TypeScript Backend                          │
│                                                                                   │
│  ┌──────────────────────┐  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │   Email Controller   │  │    Slack Controller   │  │   Auth / Senders API   │  │
│  └──────────┬───────────┘  └───────────┬───────────┘  └───────────┬────────────┘  │
│             │                          │                          │               │
│             ▼                          ▼                          ▼               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                             Prisma ORM Client                               │  │
│  └─────────────────────────────────────┬───────────────────────────────────────┘  │
└────────────────────────────────────────┼──────────────────────────────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
      ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
      │   PostgreSQL 16    │  │    Redis 7.0       │  │  Elasticsearch 8   │
      │ (Relational State) │  │ (BullMQ + Counters)│  │ (Search Indexing)  │
      └────────────────────┘  └──────────┬─────────┘  └────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────┐
                      │    BullMQ Worker (Concurrency: 5)  │
                      │ 1. Idempotency Check               │
                      │ 2. Min Delay Throttling (2s)       │
                      │ 3. Atomic Hourly Rate Limit (INCR) │
                      │ 4. If Exceeded -> Reschedule +     │
                      │    Slack Alert Trigger             │
                      │ 5. If Allowed -> Ethereal SMTP     │
                      └──────────────────┬─────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────┐
                      │    Ethereal SMTP / Slack Webhook   │
                      │ (Live Preview URLs + Block Kit)    │
                      └────────────────────────────────────┘
```

---

## ⚡ Concurrency, Rate Limiting & Throttling Deep Dive

### 1. Worker Concurrency
- Configured via `WORKER_CONCURRENCY` in `.env` (default: **5 workers**).
- Multiple workers process delayed jobs concurrently across separate process instances safely.

### 2. Minimum Delay Between Each Email (Provider Throttling)
- **Chosen Delay**: Minimum **2 seconds** (`MIN_DELAY_BETWEEN_EMAILS_MS=2000`).
- **How it works**:
  - Each sender mailbox tracks its last send timestamp in Redis: `last_send_timestamp:<senderEmail>`.
  - When a worker picks up a job for that sender, it calculates elapsed time: `elapsed = now - lastSent`.
  - If `elapsed < minDelay`, the worker waits `minDelay - elapsed` before dispatching to SMTP.
  - This prevents mailbox spam blocks and provider throttling.

### 3. Hourly Rate Limiting Per Sender
- **Configurable Limit**: `DEFAULT_HOURLY_LIMIT_PER_SENDER` (default: **50 emails/hour** per sender, configurable per sender in DB).
- **Atomic Multi-Worker Counter**:
  - Redis key: `rate_limit:<senderEmail>:<YYYY-MM-DD-HH>` with a 2-hour TTL (`EXPIRE 7200`).
  - Workers increment the counter atomically using Redis `INCR`.
- **Handling When Limit is Hit**:
  - **No Dropping or Permanent Failures**: Jobs are never dropped.
  - The worker calculates the start of the next hour window:
    ```typescript
    const nextHour = new Date(now.getTime());
    nextHour.setUTCMinutes(0, 5, 0); // 5s past the hour
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);
    ```
  - The job is **rescheduled** into BullMQ for `nextHour` with status `RATE_LIMITED_RESCHEDULED`.
  - The job retains its order and will execute automatically in the next window without user intervention.

### 4. Slack Rate-Limit Notifications
- **Live verifiable call**: The moment a sender's hourly limit is hit, `slackService.sendRateLimitAlert()` dispatches a rich Slack Block Kit notification containing:
  - Sender mailbox email
  - Hourly limit ceiling & emails sent this hour
  - Timestamp of next scheduled window
  - Direct button link to the dashboard
- **Debounced Per Window**: Redis key `slack_alert_sent:<senderEmail>:<hourWindow>` prevents channel spamming.
- **Graceful Connect / Disconnect**: If Slack is not connected, rate limit hits skip notifications without crashing. When connected, alerts start immediately without a redeploy.

---

## 🛡️ Idempotency & Server Restart Persistence

### Why No Cron Jobs?
Cron jobs operate on static clock ticks and lose state across process restarts. This system uses **BullMQ delayed jobs**:
- When an email is scheduled for `timestamp`, BullMQ calculates `delay = timestamp - now` and stores a sorted set entry in Redis (`bull:<queue>:delayed`).
- **If the server crashes or restarts**:
  - Redis persists delayed jobs on disk (`appendonly yes`).
  - When the server boots back up, BullMQ resumes the exact delayed timers.
  - Emails scheduled for the future still send at their exact target time!

### Idempotency & Crash-Window Enforcement
1. **BullMQ Job ID**: Every job is assigned `jobId: emailJob.id`. BullMQ rejects any duplicate job with the same ID.
2. **Database Unique Key**: Each `EmailJob` has a unique `idempotencyKey: email_<sender>_<recipient>_<time>_<uuid>`.
3. **Deterministic RFC 5322 Message-ID**: Outbound emails set a deterministic header `<${idempotencyKey}@reachinbox.ai>` to prevent duplicate deliveries across SMTP relays.
4. **Crash-Window Proof Cache (`sent_proof:<id>`)**: If a worker crashes *after* the email provider accepts the message but *before* the DB update commits, the Redis sent proof confirms acceptance upon restart and reconciles PostgreSQL without re-sending.

---

## 🏆 5 Pre-Interview Reliability Implementations

For an in-depth distributed systems breakdown, see [**`docs/INTERVIEW_DEFENSE.md`**](docs/INTERVIEW_DEFENSE.md).

| Requirement | Implemented Solution | Automated Verification Command |
|---|---|---|
| **1. Prove Duplicate Prevention** | Crash-window sent proof cache in Redis + deterministic RFC 5322 Message-ID headers | `npm run test:duplicates` |
| **2. Automated Test Suite** | 16 automated Vitest unit & integration tests covering scheduling, retries, and rate limits | `npm test` |
| **3. Test Concurrent Workers** | Atomic Redis Lua slot reservations (`reserveSenderTransmissionSlot`) serialize sends across parallel workers | `npm run test:concurrency` |
| **4. Demonstrate Failure Recovery** | Tested worker crash with delayed jobs, Redis reconnect, and PostgreSQL outage retry backoff | `npm run test:recovery` |
| **5. Deployment & Observability** | GitHub Actions CI (`.github/workflows/ci.yml`), structured logger (`logger.js`), deep health checks (`/health`) | `npm test` + `curl http://localhost:5000/health` |

---

## 🚀 Quickstart Guide

### Option A: 1-Command Startup with Docker Compose (Recommended)

Make sure Docker is running on your machine:

```bash
# Clone the repository
git clone https://github.com/PoorneshGowda21/OUTBOX_LAB.git
cd OUTBOX_LAB

# Start PostgreSQL, Redis, Elasticsearch, Backend, and Frontend
docker compose up --build
```

Access the application:
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)
- **Live BullMQ Queue Monitor**: [http://localhost:5000/admin/queues](http://localhost:5000/admin/queues)

---

### Option B: Local Development Setup

#### Prerequisites
- Node.js >= 20
- Redis server running on `localhost:6379`
- PostgreSQL server running on `localhost:5432` with database `reachinbox`

#### 1. Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Push Prisma schema to PostgreSQL
npx prisma db push

# Seed initial senders and admin user
npm run seed

# Start backend server
npm run dev
```

#### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).

---

## 📡 API Reference

### 1. Schedule Outreach Emails
```http
POST /api/emails/schedule
Content-Type: application/json

{
  "senderEmail": "growth@reachinbox.ai",
  "recipients": [
    "sarah.connor@cyberdyne.tech",
    "tony.stark@starkindustries.com",
    "bruce.wayne@wayneenterprises.com"
  ],
  "subject": "Automating Outreach with ReachInbox",
  "body": "Hi {{name}}, exploring automated outreach workflows with ReachInbox.",
  "startTime": "2026-10-22T14:00:00Z",
  "delayBetweenEmailsMs": 2000,
  "hourlyLimit": 50
}
```

### 2. View Scheduled Emails
```http
GET /api/emails/scheduled?page=1&limit=20&search=
```

### 3. View Sent Emails
```http
GET /api/emails/sent?page=1&limit=20
```

### 4. Elasticsearch Search
```http
GET /api/emails/search?q=outreach
```

### 5. Connect Slack Webhook
```http
POST /api/slack/webhook
Content-Type: application/json

{
  "webhookUrl": "https://hooks.slack.com/services/T00/B00/XXXXX",
  "channel": "#reachinbox-alerts"
}
```

### 6. Test Slack Live Alert
```http
POST /api/slack/test
```

### 7. Live Queue Metrics & Throughput
```http
GET /api/emails/stats
```

---

### Automated Unit & Integration Tests

Run the test suite in the backend directory:

```bash
cd backend

# Run all 16 Vitest unit & integration tests
npm test

# Run duplicate prevention crash simulation
npm run test:duplicates

# Run multi-worker concurrency & throttling verification
npm run test:concurrency

# Run failure recovery & resilience demonstration
npm run test:recovery
```

### Manual Verification via UI

A sample lead file is included in the root directory: [`sample-leads.csv`](sample-leads.csv).

1. Open [http://localhost:5173](http://localhost:5173).
2. Click **“Compose New Email”**.
3. Upload `sample-leads.csv` or paste email addresses. Notice the real-time **valid emails detected** badge.
4. Set delay to 2 seconds and click **Schedule Outreach**.
5. Switch to **Scheduled Emails** tab to watch jobs in BullMQ.
6. Switch to **Sent Emails** tab and click **“View in Ethereal”** to inspect the rendered email in Ethereal SMTP's web viewer!
7. Visit [http://localhost:5000/admin/queues](http://localhost:5000/admin/queues) to inspect the live BullMQ queues.
8. Check deep health metrics at [http://localhost:5000/health](http://localhost:5000/health).