import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

const isGH = process.env.GH === "true";
const base = isGH ? "/nallely-midi/" : "/";
console.log(`** Building for base: ${base}`);

export default defineConfig(({ mode }) => {
  const analyzeMode = mode === "analyze";
  const plugins = [
    react(),
    compression({
      algorithms: ["gzip"],
      threshold: 1024,
      logLevel: "info",
    }),
  ];

  if (analyzeMode) {
    plugins.push(visualizer({ open: true, gzipSize: true }));
  }

  return {
    base,
    build: {
      outDir: "dist",
      sourcemap: !isGH,
      target: "esnext",
    },
    plugins,
  };
});
