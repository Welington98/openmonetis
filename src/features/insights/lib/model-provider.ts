import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { minimax } from "vercel-minimax-ai-provider";
import { AVAILABLE_MODELS } from "../constants";

const OPENROUTER_MODEL_REGEX = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:-]+$/;

type ResolveInsightsModelResult =
	| { success: true; model: LanguageModel }
	| { success: false; error: string };

const AUTO_DETECT_MODEL_BY_PROVIDER = {
	openai: "gpt-5.5",
	anthropic: "claude-haiku-4-5-20251001",
	google: "gemini-3-flash-preview",
	deepseek: "deepseek-chat",
	minimax: "MiniMax-M2",
} as const;

const AUTO_DETECT_ENV_VAR: Record<
	keyof typeof AUTO_DETECT_MODEL_BY_PROVIDER,
	string
> = {
	openai: "OPENAI_API_KEY",
	anthropic: "ANTHROPIC_API_KEY",
	google: "GOOGLE_GENERATIVE_AI_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	minimax: "MINIMAX_API_KEY",
};

/**
 * Escolhe automaticamente o primeiro provedor de IA com chave configurada no
 * servidor (ordem: openai > anthropic > google > deepseek > minimax). Usado
 * por features que precisam de um modelo padrão sem depender de escolha do
 * usuário (ex: categorização automática no bank-sync). Retorna null se
 * nenhuma chave estiver configurada.
 */
export function resolveDefaultAvailableModel(): {
	modelId: string;
	provider: keyof typeof AUTO_DETECT_MODEL_BY_PROVIDER;
} | null {
	for (const provider of Object.keys(AUTO_DETECT_MODEL_BY_PROVIDER) as Array<
		keyof typeof AUTO_DETECT_MODEL_BY_PROVIDER
	>) {
		if (process.env[AUTO_DETECT_ENV_VAR[provider]]) {
			return { modelId: AUTO_DETECT_MODEL_BY_PROVIDER[provider], provider };
		}
	}
	return null;
}

function stripProviderPrefix(
	modelId: string,
	provider: "openrouter" | "ollama",
) {
	return modelId.startsWith(`${provider}:`)
		? modelId.slice(`${provider}:`.length).trim()
		: modelId.trim();
}

export function resolveInsightsModel(
	modelId: string,
): ResolveInsightsModelResult {
	const normalizedModelId = modelId.trim();
	const selectedModel = AVAILABLE_MODELS.find(
		(m) => m.id === normalizedModelId,
	);
	const isOpenRouterModel =
		normalizedModelId.startsWith("openrouter:") ||
		(!selectedModel && OPENROUTER_MODEL_REGEX.test(normalizedModelId));
	const isOllamaModel = normalizedModelId.startsWith("ollama:");

	if (!selectedModel && !isOpenRouterModel && !isOllamaModel) {
		return {
			success: false,
			error: "Modelo inválido.",
		};
	}

	if (isOpenRouterModel) {
		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			return {
				success: false,
				error:
					"OPENROUTER_API_KEY não configurada. Adicione a chave no arquivo .env",
			};
		}

		const openrouterModelId = stripProviderPrefix(
			normalizedModelId,
			"openrouter",
		);

		if (!openrouterModelId) {
			return {
				success: false,
				error: "Informe um modelo válido do OpenRouter.",
			};
		}

		const openrouter = createOpenRouter({ apiKey });
		return { success: true, model: openrouter.chat(openrouterModelId) };
	}

	if (isOllamaModel || selectedModel?.provider === "ollama") {
		const ollamaModelId = stripProviderPrefix(normalizedModelId, "ollama");
		if (!ollamaModelId) {
			return {
				success: false,
				error: "Informe um modelo válido do Ollama.",
			};
		}

		const ollama = createOpenAICompatible({
			name: "ollama",
			baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
			apiKey: process.env.OLLAMA_API_KEY || "ollama",
			supportsStructuredOutputs: false,
		});

		return { success: true, model: ollama.chatModel(ollamaModelId) };
	}

	if (selectedModel?.provider === "openai") {
		return { success: true, model: openai(normalizedModelId) };
	}

	if (selectedModel?.provider === "anthropic") {
		return { success: true, model: anthropic(normalizedModelId) };
	}

	if (selectedModel?.provider === "google") {
		return { success: true, model: google(normalizedModelId) };
	}

	if (selectedModel?.provider === "minimax") {
		return { success: true, model: minimax(normalizedModelId) };
	}

	if (selectedModel?.provider === "deepseek") {
		return { success: true, model: deepseek(normalizedModelId) };
	}

	return {
		success: false,
		error: "Provider de modelo não suportado.",
	};
}
