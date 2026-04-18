// test-rate-limit-bypass.js
const WebSocket = require('ws');
const crypto = require('crypto');

// Replace with your local nostream instance URL
const RELAY_URL = 'ws://localhost:8008';

// Number of concurrent connections/messages to fire at exactly the same time
const CONCURRENT_REQUESTS = 10;

async function testRateLimitBypass() {
    console.log(`Connecting to ${RELAY_URL}...`);

    // Create connections
    const sockets = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }).map(() => {
            return new Promise((resolve) => {
                const ws = new WebSocket(RELAY_URL);
                ws.on('open', () => resolve(ws));
                ws.on('error', (err) => console.error('WS Error:', err.message));
            });
        })
    );

    console.log(`${sockets.length} connections established. Preparing concurrent payload...`);

    let acceptedCount = 0;
    let rejectedCount = 0;

    // Listen for responses
    sockets.forEach((ws, index) => {
        ws.on('message', (data) => {
            const msg = data.toString();
            // In Nostr, rate limits usually respond with OK, [eventId], false, "rate-limited: ..."
            // or CLOSED, [subId], "rate-limited: ..."
            // Nostream specifically sends: ["NOTICE", "rate limited"] or "rate-limited"
            if (msg.includes('rate-limited') || msg.includes('rate limited')) {
                rejectedCount++;
            } else {
                acceptedCount++;
            }

            if (acceptedCount + rejectedCount === CONCURRENT_REQUESTS) {
                console.log('\n--- Test Results ---');
                console.log(`Total Requests Sent: ${CONCURRENT_REQUESTS}`);
                console.log(`Accepted: ${acceptedCount}`);
                console.log(`Rate Limited (Rejected): ${rejectedCount}`);
                console.log('--------------------');

                if (acceptedCount > 6) {
                    console.log('⚠️ BYPASS SUCCESSFUL: More requests were accepted than the configured rate limit (5) allowed.');
                } else {
                    console.log('✅ MITIGATED: The rate limiter successfully blocked duplicate requests in the same millisecond.');
                }
                process.exit(0);
            }
        });
    });

    // Generate a dummy REQ to trigger rate limiting
    const dummyReq = JSON.stringify(['REQ', crypto.randomBytes(4).toString('hex'), { limit: 1 }]);

    console.log('Firing parallel requests in the exact same millisecond...');

    // Execute all sends simultaneously
    await Promise.all(sockets.map(ws => {
        return new Promise((resolve) => {
            ws.send(dummyReq, resolve);
        });
    }));
}

testRateLimitBypass().catch(console.error);