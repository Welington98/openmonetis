export const INVOICE_PAYMENT_STATUS = {
	PENDING: "pendente",
	PAID: "pago",
	PARTIAL: "parcial",
	INSTALLED: "parcelado",
} as const;

export const INVOICE_STATUS_VALUES = Object.values(INVOICE_PAYMENT_STATUS);

export type InvoicePaymentStatus =
	(typeof INVOICE_PAYMENT_STATUS)[keyof typeof INVOICE_PAYMENT_STATUS];

export const INVOICE_STATUS_LABEL: Record<InvoicePaymentStatus, string> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "Em aberto",
	[INVOICE_PAYMENT_STATUS.PAID]: "Pago",
	[INVOICE_PAYMENT_STATUS.PARTIAL]: "Parcialmente pago",
	[INVOICE_PAYMENT_STATUS.INSTALLED]: "Parcelada",
};

export const INVOICE_STATUS_BADGE_VARIANT: Record<
	InvoicePaymentStatus,
	"default" | "secondary" | "success" | "info"
> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "info",
	[INVOICE_PAYMENT_STATUS.PAID]: "success",
	[INVOICE_PAYMENT_STATUS.PARTIAL]: "secondary",
	[INVOICE_PAYMENT_STATUS.INSTALLED]: "secondary",
};

export const INVOICE_STATUS_DESCRIPTION: Record<InvoicePaymentStatus, string> =
	{
		[INVOICE_PAYMENT_STATUS.PENDING]:
			"Esta fatura ainda não foi quitada. Você pode realizar o pagamento assim que revisar os lançamentos.",
		[INVOICE_PAYMENT_STATUS.PAID]:
			"Esta fatura está quitada. Caso tenha sido um engano, é possível desfazer o pagamento.",
		[INVOICE_PAYMENT_STATUS.PARTIAL]:
			"Parte da fatura foi paga. O restante virou um lançamento de saldo financiado na fatura do mês seguinte.",
		[INVOICE_PAYMENT_STATUS.INSTALLED]:
			"O saldo desta fatura foi parcelado e virou lançamentos nas próximas faturas deste cartão.",
	};

export const PERIOD_FORMAT_REGEX = /^\d{4}-\d{2}$/;
