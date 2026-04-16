
function originalLookup(providers: string[], rows: any[]) {
  return providers.map((provider) => {
    const row = rows.find((x) => x.provider === provider);
    if (!row) return { provider, status: "disconnected" };
    return { provider, status: row.status, updated_at: row.updated_at };
  });
}

function optimizedLookup(providers: string[], rows: any[]) {
  const rowMap = new Map(rows.map(row => [row.provider, row]));
  return providers.map((provider) => {
    const row = rowMap.get(provider);
    if (!row) return { provider, status: "disconnected" };
    return { provider, status: row.status, updated_at: row.updated_at };
  });
}

function runBenchmark(N: number, M: number, iterations: number) {
  const providers = Array.from({ length: N }, (_, i) => `provider_${i}`);
  const rows = Array.from({ length: M }, (_, i) => ({
    provider: `provider_${i}`,
    status: "connected",
    updated_at: new Date().toISOString(),
  }));

  console.log(`Benchmarking with N=${N} (providers), M=${M} (rows), ${iterations} iterations`);

  // Warm up
  for (let i = 0; i < 100; i++) {
    originalLookup(providers, rows);
    optimizedLookup(providers, rows);
  }

  const startOriginal = performance.now();
  for (let i = 0; i < iterations; i++) {
    originalLookup(providers, rows);
  }
  const endOriginal = performance.now();
  console.log(`Original O(N*M) took: ${(endOriginal - startOriginal).toFixed(4)}ms`);

  const startOptimized = performance.now();
  for (let i = 0; i < iterations; i++) {
    optimizedLookup(providers, rows);
  }
  const endOptimized = performance.now();
  console.log(`Optimized O(N+M) took: ${(endOptimized - startOptimized).toFixed(4)}ms`);

  const improvement = ((endOriginal - startOriginal) - (endOptimized - startOptimized)) / (endOriginal - startOriginal) * 100;
  console.log(`Improvement: ${improvement.toFixed(2)}%`);
}

console.log("--- Small Scale (Current Reality) ---");
runBenchmark(3, 3, 100000);

console.log("\n--- Medium Scale ---");
runBenchmark(100, 100, 1000);

console.log("\n--- Large Scale ---");
runBenchmark(1000, 1000, 100);
