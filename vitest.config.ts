import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Runner escopado à lógica pura da feature "diary" — sem DB, sem Next.js,
 * sem React Testing Library. Ver src/features/diary/lib/__tests__.
 */
export default defineConfig({
	test: {
		include: ["src/features/diary/lib/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
