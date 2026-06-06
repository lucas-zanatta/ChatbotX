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
    // canvas is an optional native dep of jsdom (try/catch require). Bundling it
    // fails because native binaries can't be inlined; keeping it external lets
    // jsdom's try-catch fall through and set Canvas = null at runtime.
    neverBundle: ["react", "canvas"],
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
