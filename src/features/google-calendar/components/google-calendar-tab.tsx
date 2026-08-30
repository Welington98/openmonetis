"use client";

import {
	RiCalendarCheckLine,
	RiGoogleFill,
	RiLoader4Line,
	RiRefreshLine,
} from "@remixicon/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
	disconnectGoogleCalendarAction,
	triggerManualGoogleCalendarSyncAction,
} from "@/features/google-calendar/actions";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

type GoogleCalendarTabProps = {
	configured: boolean;
	isConnected: boolean;
	lastSyncedAt: Date | null;
};

export function GoogleCalendarTab({
	configured,
	isConnected,
	lastSyncedAt,
}: GoogleCalendarTabProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		const status = searchParams.get("googleCalendar");
		if (!status) return;

		if (status === "success") {
			toast.success("Google Agenda conectado com sucesso.");
		} else if (status === "error") {
			toast.error(
				"Não foi possível conectar ao Google Agenda. Tente novamente.",
			);
		}

		const params = new URLSearchParams(searchParams.toString());
		params.delete("googleCalendar");
		const query = params.toString();
		router.replace(query ? `/settings?${query}` : "/settings", {
			scroll: false,
		});
	}, [searchParams, router]);

	const handleDisconnect = () => {
		startTransition(async () => {
			const result = await disconnectGoogleCalendarAction();
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleSync = () => {
		startTransition(async () => {
			const result = await triggerManualGoogleCalendarSyncAction();
			if (!result.success || !result.data) {
				toast.error(!result.success ? result.error : "Falha ao sincronizar.");
				return;
			}
			const { created, updated, deleted } = result.data;
			toast.success(
				`Sincronizado: ${created} criado(s), ${updated} atualizado(s), ${deleted} removido(s).`,
			);
		});
	};

	if (!configured) {
		return (
			<p className="text-sm text-muted-foreground">
				Integração indisponível: configure GOOGLE_CLIENT_ID e
				GOOGLE_CLIENT_SECRET no servidor para habilitá-la.
			</p>
		);
	}

	if (!isConnected) {
		return (
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Conecte sua conta Google para que vencimentos de boleto, faturas de
					cartão e parcelas apareçam automaticamente em uma agenda dedicada
					("OpenMonetis") no seu Google Agenda. O OpenMonetis nunca lê nem
					modifica sua agenda pessoal.
				</p>
				<Button asChild>
					<a href="/api/integrations/google-calendar/connect">
						<RiGoogleFill className="size-4" />
						Conectar Google Agenda
					</a>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge
					variant="outline"
					className="gap-1 border-success/30 text-success"
				>
					<RiCalendarCheckLine className="size-3.5" />
					Conectado
				</Badge>
				<span className="text-xs text-muted-foreground">
					{lastSyncedAt
						? `Última sincronização: ${lastSyncedAt.toLocaleString("pt-BR")}`
						: "Ainda não sincronizado — a próxima execução periódica cuida disso."}
				</span>
			</div>
			<p className="text-sm text-muted-foreground">
				Os eventos são atualizados automaticamente por sincronização periódica.
				Você pode ligar/desligar a sincronização por lançamento ou cartão
				diretamente no calendário financeiro.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" onClick={handleSync} disabled={isPending}>
					{isPending ? (
						<RiLoader4Line className="size-4 animate-spin" />
					) : (
						<RiRefreshLine className="size-4" />
					)}
					Sincronizar agora
				</Button>
				<Button
					variant="destructive"
					onClick={handleDisconnect}
					disabled={isPending}
				>
					Desconectar
				</Button>
			</div>
		</div>
	);
}
