import { RiDeleteBinLine } from "@remixicon/react";
import Image from "next/image";
import { Button } from "@/shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { resolveLogoSrc } from "@/shared/lib/logo";
import type { InboxItem, InboxStatus } from "./types";

const DEFAULT_INBOX_APP_LOGO = "/avatars/default_icon.png";

function findMatchingLogo(
	sourceAppName: string | null,
	appLogoMap: Record<string, string>,
): string | null {
	if (!sourceAppName) return null;
	const appName = sourceAppName.toLowerCase();
	if (appLogoMap[appName]) return resolveLogoSrc(appLogoMap[appName]);
	for (const [name, logo] of Object.entries(appLogoMap)) {
		if (name.includes(appName) || appName.includes(name)) {
			return resolveLogoSrc(logo);
		}
	}
	return null;
}

type InboxBulkActionsProps = {
	status: InboxStatus;
	items: InboxItem[];
	activeApp: string | null;
	appFilterOptions: string[];
	selectedIds: string[];
	allSelected: boolean;
	appLogoMap: Record<string, string>;
	onAppChange: (app: string) => void;
	onToggleSelectAll: () => void;
	onSelectionBulkRequest: (status: InboxStatus) => void;
	onBulkDeleteRequest: (status: "processed" | "discarded") => void;
};

export function InboxBulkActions({
	status,
	items,
	activeApp,
	appFilterOptions,
	selectedIds,
	allSelected,
	appLogoMap,
	onAppChange,
	onToggleSelectAll,
	onSelectionBulkRequest,
	onBulkDeleteRequest,
}: InboxBulkActionsProps) {
	const getAppLogo = (appName: string | null) =>
		findMatchingLogo(appName, appLogoMap) ?? DEFAULT_INBOX_APP_LOGO;

	const appFilter =
		appFilterOptions.length > 0 ? (
			<Select value={activeApp ?? "all"} onValueChange={onAppChange}>
				<SelectTrigger className="w-full sm:w-[190px]">
					<SelectValue>
						<span className="flex min-w-0 items-center gap-2">
							<div className="relative size-5 shrink-0 overflow-hidden rounded-full">
								<Image
									src={
										activeApp ? getAppLogo(activeApp) : DEFAULT_INBOX_APP_LOGO
									}
									alt=""
									fill
									sizes="20px"
									className="object-cover"
								/>
							</div>
							<span className="truncate">{activeApp ?? "Todos"}</span>
						</span>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">
						<span className="flex items-center gap-2">
							<div className="relative size-5 shrink-0 overflow-hidden rounded-full">
								<Image
									src={DEFAULT_INBOX_APP_LOGO}
									alt=""
									fill
									sizes="20px"
									className="object-cover"
								/>
							</div>
							<span>Todos</span>
						</span>
					</SelectItem>
					{appFilterOptions.map((app) => (
						<SelectItem key={app} value={app}>
							<span className="flex min-w-0 items-center gap-2">
								<div className="relative size-5 shrink-0 overflow-hidden rounded-full">
									<Image
										src={getAppLogo(app)}
										alt=""
										fill
										sizes="20px"
										className="object-cover"
									/>
								</div>
								<span className="truncate">{app}</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		) : null;

	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			{appFilter}
			{items.length > 0 ? (
				<div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
					<Button variant="outline" size="sm" onClick={onToggleSelectAll}>
						{allSelected ? "Cancelar seleção" : "Selecionar página"}
					</Button>
					{selectedIds.length > 0 && (
						<Button
							variant="destructive"
							size="sm"
							onClick={() => onSelectionBulkRequest(status)}
						>
							<RiDeleteBinLine className="mr-1.5 size-4" />
							{status === "pending"
								? `Descartar selecionados (${selectedIds.length})`
								: `Excluir selecionados (${selectedIds.length})`}
						</Button>
					)}
					{(status === "processed" || status === "discarded") && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => onBulkDeleteRequest(status)}
						>
							<RiDeleteBinLine className="mr-1.5 size-4" />
							{status === "processed"
								? "Limpar processados"
								: "Limpar descartados"}
						</Button>
					)}
				</div>
			) : null}
		</div>
	);
}
