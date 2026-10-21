import type { Instrumentation } from "next";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startTelemetry } = await import("./instrumentation-node");
		startTelemetry();
	}
}

export const onRequestError: Instrumentation.onRequestError = async (
	error,
	request,
	context,
) => {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;

	const { reportRequestError } = await import(
		"@/shared/lib/telemetry/request-error"
	);
	reportRequestError(error, request, context);
};
