import type { SelectOption as TransactionSelectOption } from "@/features/transactions/components/types";

export type InboxStatus = "pending" | "processed" | "discarded";

export type InboxItemType = "notification" | "receipt_pdf";

export interface InboxItem {
	id: string;
	itemType: string;
	sourceApp: string;
	sourceAppName: string | null;
	originalTitle: string | null;
	originalText: string;
	notificationTimestamp: Date;
	parsedName: string | null;
	parsedAmount: string | null;
	parsedDate: Date | string | null;
	attachmentId: string | null;
	status: string;
	transactionId: string | null;
	processedAt: Date | null;
	discardedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export type InboxStatusCounts = Record<InboxStatus, number>;

export type InboxPaginationState = {
	page: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
};

// Re-export the lancamentos SelectOption for use in inbox components
export type SelectOption = TransactionSelectOption;
