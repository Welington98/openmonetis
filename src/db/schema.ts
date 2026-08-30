import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull(),
	image: text("image"),
	createdAt: timestamp("createdAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	updatedAt: timestamp("updatedAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
});

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("accountId").notNull(),
		providerId: text("providerId").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("accessToken"),
		refreshToken: text("refreshToken"),
		idToken: text("idToken"),
		accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
			mode: "date",
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
			mode: "date",
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("createdAt", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		updatedAt: timestamp("updatedAt", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
	},
	(table) => ({
		userIdIdx: index("account_user_id_idx").on(table.userId),
	}),
);

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expiresAt", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("createdAt", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		updatedAt: timestamp("updatedAt", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => ({
		userIdIdx: index("session_user_id_idx").on(table.userId),
	}),
);

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	createdAt: timestamp("createdAt", {
		mode: "date",
		withTimezone: true,
	}),
	updatedAt: timestamp("updatedAt", {
		mode: "date",
		withTimezone: true,
	}),
});

// ===================== PASSKEY (WebAuthn) =====================

export const passkey = pgTable(
	"passkey",
	{
		id: text("id").primaryKey(),
		name: text("name"),
		publicKey: text("publicKey").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credentialID").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("deviceType").notNull(),
		backedUp: boolean("backedUp").notNull(),
		transports: text("transports"),
		aaguid: text("aaguid"),
		createdAt: timestamp("createdAt", {
			mode: "date",
			withTimezone: true,
		}),
	},
	(table) => ({
		userIdIdx: index("passkey_user_id_idx").on(table.userId),
	}),
);

export const userPreferences = pgTable("preferencias_usuario", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	userId: text("user_id")
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: "cascade" }),
	statementNoteAsColumn: boolean("extrato_note_as_column")
		.notNull()
		.default(false),
	transactionsColumnOrder: jsonb("lancamentos_column_order").$type<
		string[] | null
	>(),
	attachmentMaxSizeMb: integer("attachment_max_size_mb").notNull().default(50),
	showTransactionSummary: boolean("mostrar_resumo_lancamento")
		.notNull()
		.default(true),
	groupTransactionsByDate: boolean("agrupar_lancamentos_por_data")
		.notNull()
		.default(true),
	hideAnticipatedInstallments: boolean("ocultar_parcelas_antecipadas")
		.notNull()
		.default(false),
	// "manual" = só reaproveita categoria já usada antes para descrição
	// parecida; "ai" = também chama IA pra sugerir quando não há histórico.
	statementCategorizationMode: text("modo_categorizacao_extrato")
		.notNull()
		.default("manual"),
	dashboardWidgets: jsonb("dashboard_widgets").$type<{
		order: string[];
		hidden: string[];
		myAccountsShowExcluded?: boolean;
	}>(),
	createdAt: timestamp("created_at", {
		mode: "date",
		withTimezone: true,
	})
		.notNull()
		.default(sql`now()`),
	updatedAt: timestamp("updated_at", {
		mode: "date",
		withTimezone: true,
	})
		.notNull()
		.default(sql`now()`),
});

// ===================== PUBLIC TABLES =====================

export const financialAccounts = pgTable(
	"contas",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		name: text("nome").notNull(),
		accountType: text("tipo_conta").notNull(),
		note: text("anotacao"),
		status: text("status").notNull(),
		logo: text("logo").notNull(),
		initialBalance: numeric("saldo_inicial", { precision: 12, scale: 2 })
			.notNull()
			.default("0"),
		excludeFromBalance: boolean("excluir_do_saldo").notNull().default(false),
		excludeInitialBalanceFromIncome: boolean("excluir_saldo_inicial_receitas")
			.notNull()
			.default(false),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		bankConnectionId: uuid("conexao_bancaria_id").references(
			(): AnyPgColumn => bankConnections.id,
			{ onDelete: "set null" },
		),
		// Id da conta no Pluggy (dentro da conexão acima) vinculada a esta conta
		// local — permite saber, ao sincronizar, em qual conta local cada
		// transação do extrato deveria cair por padrão.
		pluggyAccountId: text("pluggy_conta_id"),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		pluggyAccountIdUnique: uniqueIndex("contas_pluggy_conta_id_key").on(
			table.pluggyAccountId,
		),
	}),
);

export const categories = pgTable(
	"categorias",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		name: text("nome").notNull(),
		type: text("tipo").notNull(),
		icon: text("icone"),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => ({
		userIdTypeIdx: index("categorias_user_id_type_idx").on(
			table.userId,
			table.type,
		),
	}),
);

export const payers = pgTable(
	"pagadores",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		name: text("nome").notNull(),
		email: text("email"),
		avatarUrl: text("avatar_url"),
		status: text("status").notNull(),
		note: text("anotacao"),
		role: text("role"),
		isAutoSend: boolean("is_auto_send").notNull().default(false),
		shareCode: text("share_code").notNull(),
		lastMailAt: timestamp("last_mail", {
			mode: "date",
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => ({
		uniqueShareCode: uniqueIndex("pagadores_share_code_key").on(
			table.shareCode,
		),
	}),
);

export const payerShares = pgTable(
	"compartilhamentos_pagador",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		payerId: uuid("pagador_id")
			.notNull()
			.references(() => payers.id, { onDelete: "cascade" }),
		sharedWithUserId: text("shared_with_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		permission: text("permission").notNull().default("read"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		uniquePayerShare: uniqueIndex("compartilhamentos_pagador_unique").on(
			table.payerId,
			table.sharedWithUserId,
		),
		sharedWithUserIdIdx: index(
			"compartilhamentos_pagador_shared_with_user_id_idx",
		).on(table.sharedWithUserId),
		createdByUserIdIdx: index(
			"compartilhamentos_pagador_created_by_user_id_idx",
		).on(table.createdByUserId),
	}),
);

export const cards = pgTable(
	"cartoes",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		name: text("nome").notNull(),
		closingDay: text("dt_fechamento").notNull(),
		dueDay: text("dt_vencimento").notNull(),
		note: text("anotacao"),
		limit: numeric("limite", { precision: 10, scale: 2 })
			.notNull()
			.default("0"),
		brand: text("bandeira"),
		logo: text("logo"),
		status: text("status").notNull(),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accountId: uuid("conta_id")
			.notNull()
			.references(() => financialAccounts.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		bankConnectionId: uuid("conexao_bancaria_id").references(
			(): AnyPgColumn => bankConnections.id,
			{ onDelete: "set null" },
		),
		// Id da conta (tipo CREDIT) no Pluggy vinculada a este cartão local —
		// mesmo papel de `financialAccounts.pluggyAccountId`, mas pro lado dos
		// cartões de crédito.
		pluggyAccountId: text("pluggy_conta_id"),
		// Controla se o vencimento de fatura deste cartão deve ser espelhado
		// como evento na agenda "OpenMonetis" do Google Agenda do usuário.
		syncToGoogleCalendar: boolean("sync_google_agenda").notNull().default(true),
	},
	(table) => ({
		accountIdIdx: index("cartoes_conta_id_idx").on(table.accountId),
		pluggyAccountIdUnique: uniqueIndex("cartoes_pluggy_conta_id_key").on(
			table.pluggyAccountId,
		),
	}),
);

export const invoices = pgTable(
	"faturas",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		paymentStatus: text("status_pagamento"),
		period: text("periodo"),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		cardId: uuid("cartao_id").references(() => cards.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	},
	(table) => ({
		userIdPeriodIdx: index("faturas_user_id_period_idx").on(
			table.userId,
			table.period,
		),
		cardIdPeriodIdx: index("faturas_cartao_id_period_idx").on(
			table.cardId,
			table.period,
		),
		userIdCardIdPeriodUnique: uniqueIndex(
			"faturas_user_id_cartao_id_periodo_key",
		).on(table.userId, table.cardId, table.period),
	}),
);

export const budgets = pgTable(
	"orcamentos",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		amount: numeric("valor", { precision: 10, scale: 2 }).notNull(),
		period: text("periodo").notNull(),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		categoryId: uuid("categoria_id").references(() => categories.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	},
	(table) => ({
		userIdPeriodIdx: index("orcamentos_user_id_period_idx").on(
			table.userId,
			table.period,
		),
		userIdCategoryIdPeriodUnique: uniqueIndex(
			"orcamentos_user_id_categoria_id_periodo_key",
		).on(table.userId, table.categoryId, table.period),
		categoryIdIdx: index("orcamentos_categoria_id_idx").on(table.categoryId),
	}),
);

export const savingsGoals = pgTable(
	"metas",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		description: text("descricao").notNull(),
		targetAmount: numeric("valor_alvo", { precision: 12, scale: 2 }).notNull(),
		startDate: date("data_inicio", { mode: "date" }).notNull(),
		targetDate: date("data_alvo", { mode: "date" }).notNull(),
		destinationAccountId: uuid("conta_destino_id")
			.notNull()
			.references(() => financialAccounts.id, { onDelete: "cascade" }),
		startingBalance: numeric("saldo_inicial", {
			precision: 12,
			scale: 2,
		}).notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdIdx: index("metas_user_id_idx").on(table.userId),
		destinationAccountIdIdx: index("metas_conta_destino_id_idx").on(
			table.destinationAccountId,
		),
	}),
);

export const notes = pgTable(
	"anotacoes",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		title: text("titulo"),
		description: text("descricao"),
		type: text("tipo").notNull().default("nota"), // "nota" ou "tarefa"
		tasks: text("tasks"), // JSON stringificado com array de tarefas
		archived: boolean("arquivada").notNull().default(false),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => ({
		userIdIdx: index("anotacoes_user_id_idx").on(table.userId),
	}),
);

export const savedInsights = pgTable(
	"insights_salvos",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		period: text("period").notNull(),
		modelId: text("model_id").notNull(),
		data: text("data").notNull(), // JSON stringificado com as análises
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userPeriodIdx: uniqueIndex("insights_salvos_user_period_idx").on(
			table.userId,
			table.period,
		),
	}),
);

export const diaryEntries = pgTable(
	"diario_registros",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		entryDate: date("data", { mode: "date" }).notNull(),
		hadExpense: boolean("houve_gasto").notNull(),
		amount: numeric("valor_gasto", { precision: 12, scale: 2 }),
		// 'alimentacao' | 'transporte' | 'lazer' | 'contas' | 'outro' | null
		category: text("categoria"),
		// 'planejado' | 'impulsivo' | 'necessario' | null
		classification: text("classificacao"),
		note: text("nota"),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdEntryDateUnique: uniqueIndex("diario_registros_user_id_data_key").on(
			table.userId,
			table.entryDate,
		),
	}),
);

export const diaryStreaks = pgTable("diario_sequencias", {
	id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
	userId: text("user_id")
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: "cascade" }),
	currentStreak: integer("streak_atual").notNull().default(0),
	longestStreak: integer("streak_maximo").notNull().default(0),
	lastEntryDate: date("ultima_data", { mode: "date" }),
	reminderEnabled: boolean("lembrete_ativo").notNull().default(true),
	// Formato "HH:mm", validado via zod na camada de action.
	reminderTime: text("horario_lembrete").notNull().default("20:00"),
	// Limite único global de gasto por dia; null = sem limite (usa o fallback
	// de média móvel + orçamento mensal no cálculo de status do calendário).
	dailyBudgetAmount: numeric("orcamento_diario", { precision: 12, scale: 2 }),
	createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const diaryAchievements = pgTable(
	"diario_conquistas",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 'streak_7' | 'streak_30' | 'streak_100' | 'month_no_budget_overrun'
		badgeKey: text("chave_conquista").notNull(),
		// "YYYY-MM" para o badge mensal; string vazia (sentinela não-nulo) para
		// badges de streak — period nullable quebraria o índice único, já que
		// NULL != NULL no Postgres permitiria duplicatas do mesmo badge.
		period: text("periodo").notNull().default(""),
		earnedAt: timestamp("conquistado_em", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		meta: jsonb("meta").$type<Record<string, unknown> | null>(),
	},
	(table) => ({
		userIdBadgeKeyPeriodUnique: uniqueIndex(
			"diario_conquistas_user_id_chave_periodo_key",
		).on(table.userId, table.badgeKey, table.period),
		userIdIdx: index("diario_conquistas_user_id_idx").on(table.userId),
	}),
);

// ===================== OPENMONETIS COMPANION =====================

export const apiTokens = pgTable(
	"tokens_api",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(), // Ex: "Meu Samsung Galaxy"
		tokenHash: text("token_hash").notNull(), // SHA-256 do token
		tokenPrefix: text("token_prefix").notNull(), // Primeiros 8 chars (display)
		lastUsedAt: timestamp("last_used_at", { mode: "date", withTimezone: true }),
		lastUsedIp: text("last_used_ip"),
		expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
		revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		tokenHashIdx: uniqueIndex("tokens_api_token_hash_idx").on(table.tokenHash),
	}),
);

export const inboxItems = pgTable(
	"pre_lancamentos",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		// Informações da fonte
		sourceApp: text("source_app").notNull(), // Ex: "com.nu.production"
		sourceAppName: text("source_app_name"), // Ex: "Nubank"

		// Dados originais da notificação
		originalTitle: text("original_title"),
		originalText: text("original_text").notNull(),
		notificationTimestamp: timestamp("notification_timestamp", {
			mode: "date",
			withTimezone: true,
		}).notNull(),

		// Tipo do item: "notification" (Companion Android) ou "receipt_pdf" (upload de comprovante)
		itemType: text("tipo_item").notNull().default("notification"),

		// Dados parseados (editáveis pelo usuário antes de lançar)
		parsedName: text("parsed_name"), // Nome do estabelecimento
		parsedAmount: numeric("parsed_amount", { precision: 12, scale: 2 }),
		parsedDate: date("parsed_date", { mode: "date" }),

		// Anexo do comprovante em PDF, quando item_type = "receipt_pdf"
		attachmentId: uuid("anexo_id").references(() => attachments.id, {
			onDelete: "set null",
		}),

		// Status de processamento
		status: text("status").notNull().default("pending"), // pending, processed, discarded

		// Referência ao lançamento criado (se processado)
		transactionId: uuid("lancamento_id").references(() => transactions.id, {
			onDelete: "set null",
		}),

		// Metadados de processamento
		processedAt: timestamp("processed_at", {
			mode: "date",
			withTimezone: true,
		}),
		discardedAt: timestamp("discarded_at", {
			mode: "date",
			withTimezone: true,
		}),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdStatusIdx: index("pre_lancamentos_user_id_status_idx").on(
			table.userId,
			table.status,
		),
		userIdCreatedAtIdx: index("pre_lancamentos_user_id_created_at_idx").on(
			table.userId,
			table.createdAt,
		),
		transactionIdIdx: index("pre_lancamentos_lancamento_id_idx").on(
			table.transactionId,
		),
	}),
);

export const dashboardNotificationStates = pgTable(
	"dashboard_notification_states",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		notificationKey: text("notification_key").notNull(),
		fingerprint: text("fingerprint").notNull(),
		readAt: timestamp("read_at", {
			mode: "date",
			withTimezone: true,
		}),
		archivedAt: timestamp("archived_at", {
			mode: "date",
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdNotificationKeyUnique: uniqueIndex(
			"dashboard_notification_states_user_id_key_unique",
		).on(table.userId, table.notificationKey),
	}),
);

export const installmentAnticipations = pgTable(
	"antecipacoes_parcelas",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		seriesId: uuid("series_id").notNull(),
		anticipationPeriod: text("periodo_antecipacao").notNull(),
		anticipationDate: date("data_antecipacao", { mode: "date" }).notNull(),
		anticipatedInstallmentIds: jsonb("parcelas_antecipadas")
			.notNull()
			.$type<string[]>(),
		totalAmount: numeric("valor_total", { precision: 12, scale: 2 }).notNull(),
		installmentCount: smallint("qtde_parcelas").notNull(),
		discount: numeric("desconto", { precision: 12, scale: 2 })
			.notNull()
			.default("0"),
		transactionId: uuid("lancamento_id")
			.notNull()
			.references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
		payerId: uuid("pagador_id").references(() => payers.id, {
			onDelete: "cascade",
		}),
		categoryId: uuid("categoria_id").references(() => categories.id, {
			onDelete: "cascade",
		}),
		note: text("anotacao"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdIdx: index("antecipacoes_parcelas_user_id_idx").on(table.userId),
		transactionIdIdx: index("antecipacoes_parcelas_lancamento_id_idx").on(
			table.transactionId,
		),
		payerIdIdx: index("antecipacoes_parcelas_pagador_id_idx").on(table.payerId),
		categoryIdIdx: index("antecipacoes_parcelas_categoria_id_idx").on(
			table.categoryId,
		),
	}),
);

// ===================== TRANSACTIONS =====================

export const transactions = pgTable(
	"lancamentos",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		condition: text("condicao").notNull(),
		name: text("nome").notNull(),
		paymentMethod: text("forma_pagamento").notNull(),
		note: text("anotacao"),
		amount: numeric("valor", { precision: 12, scale: 2 }).notNull(),
		purchaseDate: date("data_compra", { mode: "date" }).notNull(),
		transactionType: text("tipo_transacao").notNull(),
		installmentCount: smallint("qtde_parcela"),
		period: text("periodo").notNull(),
		currentInstallment: smallint("parcela_atual"),
		recurrenceCount: integer("qtde_recorrencia"),
		dueDate: date("data_vencimento", { mode: "date" }),
		boletoPaymentDate: date("dt_pagamento_boleto", { mode: "date" }),
		isSettled: boolean("realizado").default(false),
		isDivided: boolean("dividido").default(false),
		isAnticipated: boolean("antecipado").default(false),
		// Controla se este lançamento (boleto/parcela) deve ser espelhado como
		// evento na agenda "OpenMonetis" do Google Agenda do usuário, quando a
		// integração estiver conectada. Ver `googleCalendarSyncedEvents`.
		syncToGoogleCalendar: boolean("sync_google_agenda").notNull().default(true),
		anticipationId: uuid("antecipacao_id").references(
			(): AnyPgColumn => installmentAnticipations.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		cardId: uuid("cartao_id").references(() => cards.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
		accountId: uuid("conta_id").references(() => financialAccounts.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
		categoryId: uuid("categoria_id").references(() => categories.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
		payerId: uuid("pagador_id").references(() => payers.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
		seriesId: uuid("series_id"),
		splitGroupId: uuid("split_group_id"),
		transferId: uuid("transfer_id"),
		ofxFitId: text("ofx_fit_id"),
		ofxImportFingerprint: text("ofx_import_fingerprint"),
		importBatchId: text("import_batch_id"),
	},
	(table) => ({
		// Índice composto mais importante: userId + period (usado em quase todas as queries do dashboard)
		userIdPeriodIdx: index("lancamentos_user_id_period_idx").on(
			table.userId,
			table.period,
		),
		// Índice composto userId + period + transactionType (cobre maioria das queries do dashboard)
		userIdPeriodTypeIdx: index("lancamentos_user_id_period_type_idx").on(
			table.userId,
			table.period,
			table.transactionType,
		),
		// Índice para queries por pagador + period (invoice/breakdown queries)
		payerIdPeriodIdx: index("lancamentos_pagador_id_period_idx").on(
			table.payerId,
			table.period,
		),
		// Índice composto para o filtro quente do dashboard: userId + payerId + period
		userIdPayerIdPeriodIdx: index(
			"lancamentos_user_id_pagador_id_period_idx",
		).on(table.userId, table.payerId, table.period),
		// Índice para queries ordenadas por data de compra
		userIdPurchaseDateIdx: index("lancamentos_user_id_purchase_date_idx").on(
			table.userId,
			table.purchaseDate,
		),
		// Índice para buscar parcelas de uma série
		seriesIdIdx: index("lancamentos_series_id_idx").on(table.seriesId),
		// Índice para buscar shares de um split (userId + splitGroupId)
		userIdSplitGroupIdIdx: index("lancamentos_user_id_split_group_id_idx").on(
			table.userId,
			table.splitGroupId,
		),
		// Índice para buscar transferências relacionadas
		transferIdIdx: index("lancamentos_transfer_id_idx").on(table.transferId),
		// Índice para filtrar por condição (aberto, realizado, cancelado)
		userIdConditionIdx: index("lancamentos_user_id_condition_idx").on(
			table.userId,
			table.condition,
		),
		// Índice para queries de cartão específico
		cardIdPeriodIdx: index("lancamentos_cartao_id_period_idx").on(
			table.cardId,
			table.period,
		),
		// FK indexes: evitam seq scan em deletes/updates nas tabelas pai
		accountIdIdx: index("lancamentos_conta_id_idx").on(table.accountId),
		categoryIdIdx: index("lancamentos_categoria_id_idx").on(table.categoryId),
		anticipationIdIdx: index("lancamentos_antecipacao_id_idx").on(
			table.anticipationId,
		),
		// Dedup OFX: identifica a transação completa sem assumir FITID único
		ofxImportFingerprintUserIdIdx: uniqueIndex(
			"lancamentos_ofx_import_fingerprint_user_id_idx",
		)
			.on(table.userId, table.ofxImportFingerprint)
			.where(sql`ofx_import_fingerprint IS NOT NULL`),
	}),
);

// ===================== SINCRONIZAÇÃO BANCÁRIA (OPEN FINANCE / PLUGGY) =====================

export const bankConnections = pgTable(
	"conexoes_bancarias",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		pluggyItemId: text("pluggy_item_id").notNull(),
		connectorName: text("connector_name").notNull(),
		// Apelido opcional definido pelo usuário — exibido no lugar de
		// `connectorName` quando presente. `connectorName` nunca é sobrescrito
		// pelo apelido: continua vindo puro do Pluggy a cada reconexão.
		nickname: text("apelido"),
		status: text("status").notNull().default("updating"),
		lastSyncedAt: timestamp("last_synced_at", {
			mode: "date",
			withTimezone: true,
		}),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		pluggyItemIdUnique: uniqueIndex("conexoes_bancarias_pluggy_item_id_key").on(
			table.pluggyItemId,
		),
		userIdIdx: index("conexoes_bancarias_user_id_idx").on(table.userId),
	}),
);

export const statementLines = pgTable(
	"linhas_extrato",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		bankConnectionId: uuid("conexao_bancaria_id")
			.notNull()
			.references(() => bankConnections.id, { onDelete: "cascade" }),
		// Id da conta no Pluggy de onde veio esta transação (dentro da conexão
		// acima) — usado para resolver a conta local vinculada (ver
		// `financialAccounts.pluggyAccountId`) e pré-selecionar o destino do
		// lançamento na revisão. Nullable: linhas sincronizadas antes deste
		// campo existir não têm como ser retroativamente preenchidas.
		pluggyAccountId: text("pluggy_conta_id"),
		// "BANK" | "CREDIT" — tipo da conta no Pluggy que originou esta linha.
		// Decide se a revisão mostra seletor de conta ou de cartão, mesmo antes
		// de a conexão ter algo vinculado localmente (quando não dá pra
		// descobrir isso só pelo pluggyAccountId). Nullable pelo mesmo motivo
		// do campo acima.
		pluggyAccountType: text("pluggy_conta_tipo"),
		date: date("data", { mode: "date" }).notNull(),
		description: text("descricao").notNull(),
		amount: numeric("valor", { precision: 12, scale: 2 }).notNull(),
		type: text("tipo").notNull(), // "despesa" | "receita"
		externalId: text("external_id").notNull(), // id da transação no Pluggy
		status: text("status").notNull().default("unmatched"), // unmatched | matched | ignored
		// Categoria sugerida (mapeamento por descrição ou IA) — só sugestão,
		// usuário sempre confirma antes de virar lançamento.
		categoryId: uuid("categoria_id").references(() => categories.id, {
			onDelete: "set null",
		}),
		// "mapping" | "ai" | null — de onde veio a sugestão de `categoryId`.
		categorySource: text("origem_categoria"),
		matchedTransactionId: uuid("lancamento_correspondente_id").references(
			() => transactions.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdStatusIdx: index("linhas_extrato_user_id_status_idx").on(
			table.userId,
			table.status,
		),
		bankConnectionIdIdx: index("linhas_extrato_conexao_bancaria_id_idx").on(
			table.bankConnectionId,
		),
		externalIdUnique: uniqueIndex("linhas_extrato_external_id_key").on(
			table.externalId,
		),
		matchedTransactionIdUnique: uniqueIndex(
			"linhas_extrato_lancamento_correspondente_id_key",
		).on(table.matchedTransactionId),
	}),
);

export const bankConnectionsRelations = relations(
	bankConnections,
	({ one, many }) => ({
		user: one(user, {
			fields: [bankConnections.userId],
			references: [user.id],
		}),
		statementLines: many(statementLines),
		financialAccounts: many(financialAccounts),
		cards: many(cards),
	}),
);

export const statementLinesRelations = relations(statementLines, ({ one }) => ({
	user: one(user, {
		fields: [statementLines.userId],
		references: [user.id],
	}),
	bankConnection: one(bankConnections, {
		fields: [statementLines.bankConnectionId],
		references: [bankConnections.id],
	}),
	category: one(categories, {
		fields: [statementLines.categoryId],
		references: [categories.id],
	}),
	matchedTransaction: one(transactions, {
		fields: [statementLines.matchedTransactionId],
		references: [transactions.id],
	}),
}));

export type BankConnection = typeof bankConnections.$inferSelect;
export type NewBankConnection = typeof bankConnections.$inferInsert;
export type StatementLine = typeof statementLines.$inferSelect;
export type NewStatementLine = typeof statementLines.$inferInsert;

// ===================== INTEGRAÇÃO GOOGLE AGENDA =====================

export const googleCalendarConnections = pgTable(
	"conexoes_google_agenda",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token").notNull(),
		refreshToken: text("refresh_token").notNull(),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		// Id da agenda secundária dedicada ("OpenMonetis") criada no Google
		// Agenda do usuário no momento da conexão — nunca escrevemos na agenda
		// principal dele.
		googleCalendarId: text("google_calendar_id").notNull(),
		status: text("status").notNull().default("active"),
		isActive: boolean("is_active").notNull().default(true),
		lastSyncedAt: timestamp("last_synced_at", {
			mode: "date",
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdUnique: uniqueIndex("conexoes_google_agenda_user_id_key").on(
			table.userId,
		),
	}),
);

export const googleCalendarSyncedEvents = pgTable(
	"eventos_google_agenda",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		connectionId: uuid("conexao_id")
			.notNull()
			.references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// "boleto" | "card" | "installment"
		entityType: text("tipo_entidade").notNull(),
		// Id do lançamento (boleto/installment) ou do cartão (card).
		entityId: uuid("entidade_id").notNull(),
		// Necessário porque vencimento de fatura de cartão e agrupamento de
		// parcela são recalculados por período (YYYY-MM), não são um valor fixo.
		period: text("periodo").notNull(),
		googleEventId: text("google_event_id").notNull(),
		// Hash do conteúdo relevante (título, data, valor) — evita PATCH
		// desnecessário no Google quando nada mudou.
		contentHash: text("content_hash").notNull(),
		lastSyncedAt: timestamp("last_synced_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		entityUnique: uniqueIndex("eventos_google_agenda_entidade_key").on(
			table.connectionId,
			table.entityType,
			table.entityId,
			table.period,
		),
		connectionIdIdx: index("eventos_google_agenda_conexao_id_idx").on(
			table.connectionId,
		),
	}),
);

export const googleCalendarConnectionsRelations = relations(
	googleCalendarConnections,
	({ one, many }) => ({
		user: one(user, {
			fields: [googleCalendarConnections.userId],
			references: [user.id],
		}),
		syncedEvents: many(googleCalendarSyncedEvents),
	}),
);

export const googleCalendarSyncedEventsRelations = relations(
	googleCalendarSyncedEvents,
	({ one }) => ({
		connection: one(googleCalendarConnections, {
			fields: [googleCalendarSyncedEvents.connectionId],
			references: [googleCalendarConnections.id],
		}),
		user: one(user, {
			fields: [googleCalendarSyncedEvents.userId],
			references: [user.id],
		}),
	}),
);

export type GoogleCalendarConnection =
	typeof googleCalendarConnections.$inferSelect;
export type NewGoogleCalendarConnection =
	typeof googleCalendarConnections.$inferInsert;
export type GoogleCalendarSyncedEvent =
	typeof googleCalendarSyncedEvents.$inferSelect;
export type NewGoogleCalendarSyncedEvent =
	typeof googleCalendarSyncedEvents.$inferInsert;

export const userRelations = relations(user, ({ many, one }) => ({
	accounts: many(account),
	sessions: many(session),
	notes: many(notes),
	cards: many(cards),
	categories: many(categories),
	financialAccounts: many(financialAccounts),
	invoices: many(invoices),
	transactions: many(transactions),
	budgets: many(budgets),
	savingsGoals: many(savingsGoals),
	payers: many(payers),
	installmentAnticipations: many(installmentAnticipations),
	apiTokens: many(apiTokens),
	inboxItems: many(inboxItems),
	establishmentLogos: many(establishmentLogos),
	bankConnections: many(bankConnections),
	statementLines: many(statementLines),
	diaryEntries: many(diaryEntries),
	diaryAchievements: many(diaryAchievements),
	googleCalendarConnections: many(googleCalendarConnections),
	googleCalendarSyncedEvents: many(googleCalendarSyncedEvents),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const financialAccountsRelations = relations(
	financialAccounts,
	({ one, many }) => ({
		user: one(user, {
			fields: [financialAccounts.userId],
			references: [user.id],
		}),
		bankConnection: one(bankConnections, {
			fields: [financialAccounts.bankConnectionId],
			references: [bankConnections.id],
		}),
		cards: many(cards),
		transactions: many(transactions),
		savingsGoals: many(savingsGoals),
	}),
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	user: one(user, {
		fields: [categories.userId],
		references: [user.id],
	}),
	transactions: many(transactions),
	budgets: many(budgets),
}));

export const payersRelations = relations(payers, ({ one, many }) => ({
	user: one(user, {
		fields: [payers.userId],
		references: [user.id],
	}),
	transactions: many(transactions),
	shares: many(payerShares),
}));

export const payerSharesRelations = relations(payerShares, ({ one }) => ({
	payer: one(payers, {
		fields: [payerShares.payerId],
		references: [payers.id],
	}),
	sharedWithUser: one(user, {
		fields: [payerShares.sharedWithUserId],
		references: [user.id],
	}),
	createdByUser: one(user, {
		fields: [payerShares.createdByUserId],
		references: [user.id],
	}),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
	user: one(user, {
		fields: [cards.userId],
		references: [user.id],
	}),
	financialAccount: one(financialAccounts, {
		fields: [cards.accountId],
		references: [financialAccounts.id],
	}),
	bankConnection: one(bankConnections, {
		fields: [cards.bankConnectionId],
		references: [bankConnections.id],
	}),
	invoices: many(invoices),
	transactions: many(transactions),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
	user: one(user, {
		fields: [invoices.userId],
		references: [user.id],
	}),
	card: one(cards, {
		fields: [invoices.cardId],
		references: [cards.id],
	}),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
	user: one(user, {
		fields: [budgets.userId],
		references: [user.id],
	}),
	category: one(categories, {
		fields: [budgets.categoryId],
		references: [categories.id],
	}),
}));

export const savingsGoalsRelations = relations(savingsGoals, ({ one }) => ({
	user: one(user, {
		fields: [savingsGoals.userId],
		references: [user.id],
	}),
	destinationAccount: one(financialAccounts, {
		fields: [savingsGoals.destinationAccountId],
		references: [financialAccounts.id],
	}),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
	user: one(user, {
		fields: [notes.userId],
		references: [user.id],
	}),
	noteAttachments: many(noteAttachments),
}));

export const savedInsightsRelations = relations(savedInsights, ({ one }) => ({
	user: one(user, {
		fields: [savedInsights.userId],
		references: [user.id],
	}),
}));

export const diaryEntriesRelations = relations(diaryEntries, ({ one }) => ({
	user: one(user, {
		fields: [diaryEntries.userId],
		references: [user.id],
	}),
}));

export const diaryAchievementsRelations = relations(
	diaryAchievements,
	({ one }) => ({
		user: one(user, {
			fields: [diaryAchievements.userId],
			references: [user.id],
		}),
	}),
);

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
	user: one(user, {
		fields: [apiTokens.userId],
		references: [user.id],
	}),
}));

export const inboxItemsRelations = relations(inboxItems, ({ one }) => ({
	user: one(user, {
		fields: [inboxItems.userId],
		references: [user.id],
	}),
	transaction: one(transactions, {
		fields: [inboxItems.transactionId],
		references: [transactions.id],
	}),
}));

export const transactionsRelations = relations(
	transactions,
	({ one, many }) => ({
		user: one(user, {
			fields: [transactions.userId],
			references: [user.id],
		}),
		card: one(cards, {
			fields: [transactions.cardId],
			references: [cards.id],
		}),
		financialAccount: one(financialAccounts, {
			fields: [transactions.accountId],
			references: [financialAccounts.id],
		}),
		category: one(categories, {
			fields: [transactions.categoryId],
			references: [categories.id],
		}),
		payer: one(payers, {
			fields: [transactions.payerId],
			references: [payers.id],
		}),
		anticipation: one(installmentAnticipations, {
			fields: [transactions.anticipationId],
			references: [installmentAnticipations.id],
		}),
		transactionAttachments: many(transactionAttachments),
	}),
);

export const installmentAnticipationsRelations = relations(
	installmentAnticipations,
	({ one, many }) => ({
		user: one(user, {
			fields: [installmentAnticipations.userId],
			references: [user.id],
		}),
		transaction: one(transactions, {
			fields: [installmentAnticipations.transactionId],
			references: [transactions.id],
		}),
		payer: one(payers, {
			fields: [installmentAnticipations.payerId],
			references: [payers.id],
		}),
		category: one(categories, {
			fields: [installmentAnticipations.categoryId],
			references: [categories.id],
		}),
	}),
);

// ===================== ATTACHMENTS =====================

export const attachments = pgTable(
	"anexos",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		fileKey: text("chave_arquivo").notNull().unique(),
		fileName: text("nome_arquivo").notNull(),
		fileSize: integer("tamanho_bytes").notNull(),
		mimeType: text("mime_type").notNull(),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdIdx: index("anexos_user_id_idx").on(table.userId),
	}),
);

export const transactionAttachments = pgTable(
	"lancamento_anexos",
	{
		transactionId: uuid("lancamento_id")
			.notNull()
			.references(() => transactions.id, { onDelete: "cascade" }),
		attachmentId: uuid("anexo_id")
			.notNull()
			.references(() => attachments.id, { onDelete: "cascade" }),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.transactionId, table.attachmentId] }),
		attachmentIdIdx: index("lancamento_anexos_anexo_id_idx").on(
			table.attachmentId,
		),
	}),
);

export const noteAttachments = pgTable(
	"anotacao_anexos",
	{
		noteId: uuid("anotacao_id")
			.notNull()
			.references(() => notes.id, { onDelete: "cascade" }),
		attachmentId: uuid("anexo_id")
			.notNull()
			.references(() => attachments.id, { onDelete: "cascade" }),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.noteId, table.attachmentId] }),
		attachmentIdIdx: index("anotacao_anexos_anexo_id_idx").on(
			table.attachmentId,
		),
	}),
);

export const importCategoryMappings = pgTable(
	"import_category_mappings",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		descriptionKey: text("description_key").notNull(),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => categories.id, { onDelete: "cascade" }),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.userId, table.descriptionKey] }),
		categoryIdIdx: index("import_category_mappings_category_id_idx").on(
			table.categoryId,
		),
	}),
);

export const establishmentLogos = pgTable(
	"establishment_logos",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		nameKey: text("name_key").notNull(),
		domain: text("domain").notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.userId, table.nameKey] }),
	}),
);

export type EstablishmentLogo = typeof establishmentLogos.$inferSelect;

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Account = typeof account.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type PayerShare = typeof payerShares.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Payer = typeof payers.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type SavedInsight = typeof savedInsights.$inferSelect;
export type DiaryEntry = typeof diaryEntries.$inferSelect;
export type NewDiaryEntry = typeof diaryEntries.$inferInsert;
export type DiaryStreak = typeof diaryStreaks.$inferSelect;
export type NewDiaryStreak = typeof diaryStreaks.$inferInsert;
export type DiaryAchievement = typeof diaryAchievements.$inferSelect;
export type NewDiaryAchievement = typeof diaryAchievements.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InstallmentAnticipation =
	typeof installmentAnticipations.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type InboxItem = typeof inboxItems.$inferSelect;
export type NewInboxItem = typeof inboxItems.$inferInsert;
export type ImportCategoryMapping = typeof importCategoryMappings.$inferSelect;

export const attachmentsRelations = relations(attachments, ({ one, many }) => ({
	user: one(user, {
		fields: [attachments.userId],
		references: [user.id],
	}),
	transactionAttachments: many(transactionAttachments),
	noteAttachments: many(noteAttachments),
}));

export const transactionAttachmentsRelations = relations(
	transactionAttachments,
	({ one }) => ({
		transaction: one(transactions, {
			fields: [transactionAttachments.transactionId],
			references: [transactions.id],
		}),
		attachment: one(attachments, {
			fields: [transactionAttachments.attachmentId],
			references: [attachments.id],
		}),
	}),
);

export const noteAttachmentsRelations = relations(
	noteAttachments,
	({ one }) => ({
		note: one(notes, {
			fields: [noteAttachments.noteId],
			references: [notes.id],
		}),
		attachment: one(attachments, {
			fields: [noteAttachments.attachmentId],
			references: [attachments.id],
		}),
	}),
);

export type Attachment = typeof attachments.$inferSelect;
export type TransactionAttachment = typeof transactionAttachments.$inferSelect;
export type NoteAttachment = typeof noteAttachments.$inferSelect;

export const establishmentLogosRelations = relations(
	establishmentLogos,
	({ one }) => ({
		user: one(user, {
			fields: [establishmentLogos.userId],
			references: [user.id],
		}),
	}),
);
