import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { isTelemetryEnabled } from "@/shared/lib/telemetry/config";
import { bridgeConsoleToOtel } from "@/shared/lib/telemetry/console-bridge";

declare global {
	var __openmonetisTelemetryStarted: boolean | undefined;
}

/**
 * Inicializa traces, métricas e logs via OTLP/HTTP. Configuração de endpoint,
 * headers e protocolo segue as variáveis padrão `OTEL_EXPORTER_OTLP_*`.
 */
export function startTelemetry() {
	if (!isTelemetryEnabled() || globalThis.__openmonetisTelemetryStarted) return;
	globalThis.__openmonetisTelemetryStarted = true;

	const sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "openmonetis",
			[ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "unknown",
		}),
		traceExporter: new OTLPTraceExporter(),
		metricReaders: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter(),
				exportIntervalMillis: Number(
					process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60_000,
				),
			}),
		],
		logRecordProcessors: [
			new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
		],
		instrumentations: [
			new HttpInstrumentation(),
			new PgInstrumentation(),
			new RuntimeNodeInstrumentation(),
		],
	});

	sdk.start();
	new HostMetrics({ name: "openmonetis-host" }).start();
	bridgeConsoleToOtel();

	const shutdown = () => {
		sdk.shutdown().catch(() => undefined);
	};
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}
