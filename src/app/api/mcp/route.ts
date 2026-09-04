import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerFinanceTools } from "@/features/mcp/server";
import { verifyOpmApiToken } from "@/shared/lib/auth/api-token";

const handler = createMcpHandler(
	(server) => {
		registerFinanceTools(server);
	},
	{
		serverInfo: { name: "openmonetis", version: "1.0.0" },
	},
);

/**
 * Autentica a chamada MCP com o mesmo token pessoal `opm_xxx` gerado em
 * Configurações → Tokens de API (usado hoje pelo app companion do inbox).
 * O userId resolvido aqui é a única fonte de escopo dos dados nas tools —
 * nunca vem de argumentos da chamada.
 */
async function verifyToken(
	req: Request,
	bearerToken?: string,
): Promise<AuthInfo | undefined> {
	if (!bearerToken) return undefined;

	const clientIp =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		null;

	const result = await verifyOpmApiToken(bearerToken, clientIp);
	if (!result) return undefined;

	return {
		token: bearerToken,
		clientId: result.userId,
		scopes: ["finance:read"],
		extra: { userId: result.userId },
	};
}

const authHandler = withMcpAuth(handler, verifyToken, {
	required: true,
	requiredScopes: ["finance:read"],
});

export { authHandler as GET, authHandler as POST };
