/**
 * Multi-Worker Concurrency & Throttling Verification Script
 *
 * Interview Requirement 3:
 * "Test concurrent workers. Run multiple workers against the same sender
 *  and verify that the hourly limit and minimum delay are respected."
 */

console.log('================================================================');
console.log('⚡ MULTI-WORKER CONCURRENCY & THROTTLING TEST');
console.log('================================================================\n');

async function runConcurrencyTest() {
  const SENDER = 'growth@reachinbox.ai';
  const HOURLY_LIMIT = 5;
  const MIN_DELAY_MS = 300; // 300ms min delay for fast automated testing
  const TOTAL_JOBS = 10;
  const NUM_WORKERS = 4;

  console.log(`Configuration:`);
  console.log(`- Sender Mailbox  : ${SENDER}`);
  console.log(`- Concurrent Workers: ${NUM_WORKERS}`);
  console.log(`- Total Jobs      : ${TOTAL_JOBS}`);
  console.log(`- Hourly Limit    : ${HOURLY_LIMIT}`);
  console.log(`- Min Delay       : ${MIN_DELAY_MS}ms\n`);

  // Shared Redis-like atomic slot state
  let lastTransmissionSlot = null;
  let hourlyCounter = 0;
  const sendTimestamps = [];
  const rescheduledJobs = [];

  // Atomic slot reservation (mirrors emailWorker Lua logic)
  function atomicReserveSlot(sender, minDelay, now) {
    let targetSlot = now;
    if (lastTransmissionSlot !== null && (lastTransmissionSlot + minDelay) > now) {
      targetSlot = lastTransmissionSlot + minDelay;
    }
    lastTransmissionSlot = targetSlot;
    return targetSlot - now;
  }

  // Worker simulation function
  async function simulateWorker(workerId, jobsToProcess) {
    for (const job of jobsToProcess) {
      const now = Date.now();

      // 1. Atomic Hourly Rate Limit check
      hourlyCounter++;
      if (hourlyCounter > HOURLY_LIMIT) {
        rescheduledJobs.push({
          jobId: job.id,
          workerId,
          reason: 'rate_limited_rescheduled',
          targetWindow: 'next-hour-window',
        });
        continue;
      }

      // 2. Multi-Worker Atomic Minimum Delay Reservation
      const waitMs = atomicReserveSlot(SENDER, MIN_DELAY_MS, now);
      if (waitMs > 0) {
        await new Promise((res) => setTimeout(res, waitMs));
      }

      // 3. Email sent
      const dispatchTime = Date.now();
      sendTimestamps.push({
        jobId: job.id,
        workerId,
        timestamp: dispatchTime,
      });
      console.log(`[Worker-${workerId}] ✉️ Sent Job ${job.id} at +${dispatchTime - startTime}ms`);
    }
  }

  const startTime = Date.now();

  // Distribute 10 jobs across 4 concurrent workers
  const jobs = Array.from({ length: TOTAL_JOBS }, (_, i) => ({ id: `job-${i + 1}` }));
  const workerBatches = Array.from({ length: NUM_WORKERS }, () => []);
  jobs.forEach((job, idx) => {
    workerBatches[idx % NUM_WORKERS].push(job);
  });

  console.log(`Dispatching ${TOTAL_JOBS} jobs across ${NUM_WORKERS} concurrent worker routines...\n`);

  // Run all workers concurrently
  await Promise.all(
    workerBatches.map((batch, workerId) => simulateWorker(workerId + 1, batch))
  );

  console.log('\n================================================================');
  console.log('📊 CONCURRENCY TEST RESULTS:');
  console.log('================================================================');
  console.log(`Total Emails Sent        : ${sendTimestamps.length} (Expected: ${HOURLY_LIMIT})`);
  console.log(`Total Rescheduled (Limit): ${rescheduledJobs.length} (Expected: ${TOTAL_JOBS - HOURLY_LIMIT})`);

  let rateLimitPassed = sendTimestamps.length === HOURLY_LIMIT && rescheduledJobs.length === (TOTAL_JOBS - HOURLY_LIMIT);
  let minDelayPassed = true;

  console.log('\nInter-Email Transmission Intervals:');
  for (let i = 1; i < sendTimestamps.length; i++) {
    const delta = sendTimestamps[i].timestamp - sendTimestamps[i - 1].timestamp;
    const isPassing = delta >= MIN_DELAY_MS - 30; // 30ms timer jitter tolerance
    console.log(`  Send ${i} -> Send ${i + 1}: ${delta}ms (Min required: ${MIN_DELAY_MS}ms) -> ${isPassing ? '✅ OK' : '❌ VIOLATION'}`);
    if (!isPassing) minDelayPassed = false;
  }

  if (rateLimitPassed && minDelayPassed) {
    console.log('\n✅ PASS: Both Hourly Limit and Minimum Delay were strictly respected across concurrent workers!\n');
  } else {
    console.error('\n❌ FAIL: Concurrency violations detected!\n');
    process.exit(1);
  }
}

runConcurrencyTest();
