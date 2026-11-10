import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Runner escopado à lógica pura de cada feature (funções dentro de lib/,
 * sem DB, sem Next.js, sem React Testing Library) — ver __tests__ em cada
 * pasta lib/ dentro de src/features.
 *
 * Os testes de integração (banco real) ficam em src/test/integration e são
 * executados por `vitest.integration.config.ts`, nunca por este runner.
 */
export default defineConfig({
	test: {
		include: [
			"src/features/**/lib/**/*.test.ts",
			"src/shared/lib/**/*.test.ts",
		],
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "lcov"],
			reportsDirectory: "coverage",
			// Piso medido ao introduzir o gate (sprint 1). O denominador é só o
			// que a suíte unitária carrega — não é cobertura do sistema inteiro.
			// Ajuste somente para cima: reduzir aqui exige justificativa no PR.
			thresholds: {
				lines: 54,
				statements: 53,
				branches: 37,
				functions: 38,
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
