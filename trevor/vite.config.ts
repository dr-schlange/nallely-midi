import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isGH = process.env.GH === "true";
const base = isGH ? "/nallely-midi/" : "/";
console.log(`** Building for base: ${base}`);

export default defineConfig({
	base,
	build: {
		outDir: "dist",
		sourcemap: !isGH,
	},
	plugins: [react()],
});
