import { logs, metrics, SeverityNumber, trace } from "@opentelemetry/api";
import { TELEMETRY_SCOPE } from "./config";

type RequestInfo = { path: string; method: string };
type ErrorContext = {
	routerKind: string;
	routePath: string;
	routeType: string;
	renderSource?: string;
	revalidateReason?: string;
};

/**
 * Chamado por `onRequestError` do Next: registra a exceção no span ativo, emite
 * um log estruturado e incrementa o contador de erros por rota.
 */
export function reportRequestError(
	error: unknown,
	request: RequestInfo,
	context: ErrorContext,
) {
	const err = error instanceof Error ? error : new Error(String(error));
	const digest =
		typeof error === "object" && error !== null && "digest" in error
			? String((error as { digest: unknown }).digest)
			: undefined;

	const span = trace.getActiveSpan();
	span?.recordException(err);

	const attributes = {
		"http.request.method": request.method,
		"http.route": context.routePath,
		"next.route_type": context.routeType,
		"next.router_kind": context.routerKind,
	};

	logs.getLogger(TELEMETRY_SCOPE).emit({
		severityNumber: SeverityNumber.ERROR,
		severityText: "ERROR",
		body: `Erro na requisição ${request.method} ${context.routePath}`,
		attributes: {
			...attributes,
			"exception.type": err.name,
			"exception.message": err.message,
			...(err.stack ? { "exception.stacktrace": err.stack } : {}),
			...(digest ? { "next.error_digest": digest } : {}),
		},
	});

	metrics
		.getMeter(TELEMETRY_SCOPE)
		.createCounter("openmonetis.request.errors", {
			description: "Erros não tratados em requisições do servidor",
			unit: "{error}",
		})
		.add(1, attributes);
}
