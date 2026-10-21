/**
 * OpenTelemetry é opt-in: só liga quando algum endpoint OTLP está configurado
 * (padrão `OTEL_EXPORTER_OTLP_ENDPOINT` ou variantes por sinal) e
 * `OTEL_SDK_DISABLED` não é `true`. Sem endpoint, nada é inicializado.
 */
export function isTelemetryEnabled(env: NodeJS.ProcessEnv = process.env) {
	if (env.OTEL_SDK_DISABLED === "true") return false;

	return Boolean(
		env.OTEL_EXPORTER_OTLP_ENDPOINT ||
			env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
			env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
			env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
	);
}

export const TELEMETRY_SCOPE = "openmonetis";
