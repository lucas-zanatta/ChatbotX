import { defineConfig } from "tsdown"

export default defineConfig({
  format: ["esm"],
  entry: [
    "src/chat/worker.ts",
    "src/integration/worker.ts",
    "src/ai-agent/worker.ts",
    "src/default/worker.ts",
    "src/trigger/worker.ts",
    "src/webhook/worker.ts",
    "src/sequence-scheduler/worker.ts",
    "src/sequence-scheduler/worker-producer.ts",
    "src/sequence-scheduler/worker-consumer.ts",
    "src/schedule/worker.ts",
    "src/events/worker.ts",
  ],
  dts: false,
  shims: true,
  deps: {
    skipNodeModulesBundle: false,
    // https://github.com/egoist/tsdown/issues/619
    alwaysBundle: [/(.*)/],
    // jsdom calls require.resolve('./xhr-sync-worker.js') at module load in
    // XMLHttpRequest-impl.js — the same top-level require.resolve pattern that
    // broke pdf-parse-new. There is no clean subpath to import, so jsdom and
    // its peer @mozilla/readability must stay external and be shipped in
    // node_modules alongside dist (see Dockerfile).
    // canvas is jsdom's optional native dep (try/catch require) — also external
    // so the try-catch gracefully sets Canvas = null at runtime.
    neverBundle: ["react", "jsdom", "@mozilla/readability", "canvas"],
  },
  clean: true,
  // target: 'node20',
  platform: "node",
  minify: false,
  unbundle: false,
  // splitting: false,
  sourcemap: false,
  treeshake: true,
})
