import { build } from "esbuild";

// npm ci runs prepare before the store invokes vici build directly.
await build({
  entryPoints: ["src/pwa-worker.ts"],
  outfile: "assets/pwa-worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  minify: false,
  banner: { js: "// Generated from src/pwa-worker.ts by scripts/build-worker.mjs. Do not edit." },
});
