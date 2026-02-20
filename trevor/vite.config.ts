import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { compression } from "vite-plugin-compression2";

const isGH = process.env.GH === "true";
const base = isGH ? "/nallely-midi/" : "/";
console.log(`** Building for base: ${base}`);

export default defineConfig({
	base,
	build: {
		outDir: "dist",
		sourcemap: !isGH,
	},
	plugins: [
		react(),
		compression({
			algorithms: ["brotli", "gzip"],
			threshold: 1024,
			logLevel: "info",
		}),
	],
});
