"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";

export type DailyBudgetView = "hoje" | "projecao";

const VIEW_PARAM = "view";

/**
 * Alterna entre "Hoje" (cota de gasto do dia, reseta todo mês) e "Projeção"
 * (saldo de caixa real projetado, nunca reseta) na mesma página — as duas
 * eram páginas/itens de menu separados, mas descrevem o mesmo orçamento por
 * dois ângulos diferentes, então viraram abas de uma página só.
 *
 * Cada aba busca seus próprios dados no servidor (ver `page.tsx`) — este
 * componente só troca o parâmetro `view` da URL, sem estado próprio de
 * conteúdo, pra cada visão continuar tendo o Suspense/skeleton independente
 * que já tinha antes da junção.
 */
export function DailyBudgetViewTabs({ view }: { view: DailyBudgetView }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const handleChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (value === "hoje") {
			params.delete(VIEW_PARAM);
		} else {
			params.set(VIEW_PARAM, value);
		}
		const query = params.toString();

		startTransition(() => {
			router.replace(query ? `${pathname}?${query}` : pathname, {
				scroll: false,
			});
		});
	};

	return (
		<Tabs value={view} onValueChange={handleChange}>
			<TabsList>
				<TabsTrigger value="hoje" disabled={isPending}>
					Hoje
				</TabsTrigger>
				<TabsTrigger value="projecao" disabled={isPending}>
					Projeção
				</TabsTrigger>
			</TabsList>
			{/* Sem conteúdo aqui de propósito — quem renderiza é a page.tsx, server-driven pelo `view` da URL. */}
			<TabsContent value="hoje" />
			<TabsContent value="projecao" />
		</Tabs>
	);
}
