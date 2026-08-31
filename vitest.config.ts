import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Runner escopado à lógica pura de cada feature (funções dentro de lib/,
 * sem DB, sem Next.js, sem React Testing Library) — ver __tests__ em cada
 * pasta lib/ dentro de src/features.
 */
export default defineConfig({
	test: {
		include: ["src/features/**/lib/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
