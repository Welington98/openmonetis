"use client";

import { RiBankLine } from "@remixicon/react";
import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	createConnectTokenAction,
	saveBankConnectionAction,
} from "@/features/bank-sync/actions";
import { Button } from "@/shared/components/ui/button";

// Versão travada na última confirmada na documentação oficial do Pluggy Connect.
// Verifique https://docs.pluggy.ai/docs/environments-and-configurations por atualizações.
const PLUGGY_CONNECT_SCRIPT_URL =
	"https://cdn.pluggy.ai/pluggy-connect/v2.3.1/pluggy-connect.js";

type PluggyConnectItemData = { item: { id: string } };

type PluggyConnectInstance = { init: () => void };

declare global {
	interface Window {
		PluggyConnect?: new (options: {
			connectToken: string;
			includeSandbox?: boolean;
			updateItem?: string;
			onSuccess: (data: PluggyConnectItemData) => void;
			onError?: (error: unknown) => void;
			onClose?: () => void;
		}) => PluggyConnectInstance;
	}
}

interface ConnectBankButtonProps {
	pluggyConfigured: boolean;
	updateItemId?: string;
	onConnected?: () => void;
}

export function ConnectBankButton({
	pluggyConfigured,
	updateItemId,
	onConnected,
}: ConnectBankButtonProps) {
	const [scriptReady, setScriptReady] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const isOpeningRef = useRef(false);

	const handleConnect = useCallback(async () => {
		if (isOpeningRef.current) return;
		isOpeningRef.current = true;
		setIsLoading(true);

		try {
			const tokenResult = await createConnectTokenAction(updateItemId);
			if (!tokenResult.success || !tokenResult.data) {
				toast.error(
					!tokenResult.success ? tokenResult.error : "Falha ao gerar token.",
				);
				return;
			}

			if (!window.PluggyConnect) {
				toast.error("Widget do Pluggy ainda não carregou. Tente novamente.");
				return;
			}

			const { accessToken, sandbox } = tokenResult.data;

			const connect = new window.PluggyConnect({
				connectToken: accessToken,
				includeSandbox: sandbox,
				updateItem: updateItemId,
				onSuccess: async ({ item }) => {
					const saveResult = await saveBankConnectionAction({
						pluggyItemId: item.id,
					});
					if (saveResult.success) {
						toast.success(saveResult.message);
						onConnected?.();
					} else {
						toast.error(saveResult.error);
					}
				},
				onError: (error) => {
					console.error("[pluggy-connect]", error);
					toast.error("Não foi possível conectar ao banco. Tente novamente.");
				},
			});

			connect.init();
		} finally {
			isOpeningRef.current = false;
			setIsLoading(false);
		}
	}, [updateItemId, onConnected]);

	if (!pluggyConfigured) {
		return (
			<Button
				variant="outline"
				disabled
				title="Configure PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET"
			>
				<RiBankLine className="size-4" />
				Sincronização bancária indisponível
			</Button>
		);
	}

	return (
		<>
			<Script
				src={PLUGGY_CONNECT_SCRIPT_URL}
				strategy="afterInteractive"
				onReady={() => setScriptReady(true)}
			/>
			<Button onClick={handleConnect} disabled={!scriptReady || isLoading}>
				<RiBankLine className="size-4" />
				{updateItemId ? "Reconectar" : "Conectar banco"}
			</Button>
		</>
	);
}
