import { format } from "node:util";
import { type Attributes, logs, SeverityNumber } from "@opentelemetry/api";
import { TELEMETRY_SCOPE } from "./config";

type ConsoleMethod = "debug" | "log" | "info" | "warn" | "error";

const SEVERITY: Record<
	ConsoleMethod,
	{ number: SeverityNumber; text: string }
> = {
	debug: { number: SeverityNumber.DEBUG, text: "DEBUG" },
	log: { number: SeverityNumber.INFO, text: "INFO" },
	info: { number: SeverityNumber.INFO, text: "INFO" },
	warn: { number: SeverityNumber.WARN, text: "WARN" },
	error: { number: SeverityNumber.ERROR, text: "ERROR" },
};

/**
 * Encaminha `console.*` do servidor para o pipeline de logs do OpenTelemetry,
 * mantendo a saída original no stdout/stderr. Assim os ~60 `console.error` do
 * código passam a chegar no backend de logs (já correlacionados ao trace/span
 * ativo) sem precisar trocar cada chamada.
 */
export function bridgeConsoleToOtel() {
	const logger = logs.getLogger(TELEMETRY_SCOPE);

	for (const method of Object.keys(SEVERITY) as ConsoleMethod[]) {
		const original = console[method].bind(console);
		const severity = SEVERITY[method];

		console[method] = (...args: unknown[]) => {
			original(...args);

			try {
				const attributes: Attributes = { "log.source": `console.${method}` };
				const error = args.find((arg) => arg instanceof Error);
				if (error) {
					attributes["exception.type"] = error.name;
					attributes["exception.message"] = error.message;
					if (error.stack) attributes["exception.stacktrace"] = error.stack;
				}

				logger.emit({
					severityNumber: severity.number,
					severityText: severity.text,
					body: format(...args),
					attributes,
				});
			} catch {
				// Telemetria nunca deve quebrar o log original.
			}
		};
	}
}
