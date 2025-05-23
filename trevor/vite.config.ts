import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const command = process.env.npm_lifecycle_event;

const sourcemap = command !== "deploy:gh";
const base = command === "deploy:gh" ? "/nallely-midi/" : "/";

export default defineConfig({
	base,
	build: {
		outDir: "dist",
		sourcemap: sourcemap,
	},
	plugins: [react()],
});
