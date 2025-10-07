#!/usr/bin/env node
// WebSocket latency benchmark script
const WebSocket = require("ws");

async function benchmarkLatency() {
  const ws = new WebSocket("ws://localhost:4000/ws");
  const iterations = 10;
  const latencies = [];

  return new Promise((resolve, reject) => {
    ws.on("open", () => {
      console.log("Connected to WebSocket server");

      let count = 0;
      const runTest = () => {
        if (count >= iterations) {
          const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          console.log(`Average latency: ${avg.toFixed(2)}ms`);
          console.log(`Max latency: ${Math.max(...latencies).toFixed(2)}ms`);
          console.log(`Min latency: ${Math.min(...latencies).toFixed(2)}ms`);
          ws.close();
          resolve(avg);
          return;
        }

        const start = Date.now();
        ws.send(JSON.stringify({ type: "ping", timestamp: start }));

        const onMessage = (data) => {
          const end = Date.now();
          const latency = end - start;
          latencies.push(latency);
          console.log(`Test ${count + 1}: ${latency}ms`);
          count++;
          ws.removeListener("message", onMessage);
          setTimeout(runTest, 100); // Wait 100ms between tests
        };

        ws.on("message", onMessage);
      };

      runTest();
    });

    ws.on("error", reject);
  });
}

if (require.main === module) {
  benchmarkLatency()
    .then((avg) => {
      if (avg > 300) {
        console.error("❌ Average latency exceeds 300ms threshold");
        process.exit(1);
      } else {
        console.log("✅ Latency test passed");
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("❌ Benchmark failed:", err.message);
      process.exit(1);
    });
}
