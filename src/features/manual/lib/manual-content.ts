export type ManualGroup =
	| "Primeiros passos"
	| "Dia a dia"
	| "Cartões e dívidas"
	| "Planejamento"
	| "Organização"
	| "Relatórios"
	| "Integrações"
	| "Ajuda";

export type ManualSection = {
	id: string;
	group: ManualGroup;
	title: string;
	summary: string;
	/** Passos numerados, na ordem em que o usuário faz. */
	steps?: readonly string[];
	/** Pontos de atenção, regras e dicas. */
	notes?: readonly string[];
	/** Rota do app relacionada (vira o botão "Abrir"). */
	href?: string;
	/** Palavras extras para a busca. */
	keywords?: string;
};

export const MANUAL_GROUPS: readonly ManualGroup[] = [
	"Primeiros passos",
	"Dia a dia",
	"Cartões e dívidas",
	"Planejamento",
	"Organização",
	"Relatórios",
	"Integrações",
	"Ajuda",
];

export const MANUAL_SECTIONS: readonly ManualSection[] = [
	{
		id: "comece-por-aqui",
		group: "Primeiros passos",
		title: "Comece por aqui: 5 passos",
		summary:
			"O OpenMonetis funciona melhor com uma rotina curta e constante. Faça esta configuração uma vez e depois só mantenha os registros em dia.",
		steps: [
			"Cadastre suas contas em Finanças → Contas, com o saldo de hoje como saldo inicial (negativo se estiver no limite).",
			"Cadastre seus cartões em Finanças → Cartões, com limite, dia de fechamento e dia de vencimento.",
			"Lance suas receitas e suas contas fixas como lançamentos recorrentes, nas datas certas, escolhendo o centro de custo Fixa (os centros Fixa, Variável e Economia já vêm criados).",
			"Defina o seu diário em Orçamento diário → engrenagem. Use a Previsão de diário para chegar ao valor.",
			"Faça a rotina: todo dia lance o gasto, toda semana confira o saldo com o banco, todo mês revise as contas fixas.",
		],
		notes: [
			"Em caso de dúvida sobre um termo, veja a seção Conceitos básicos.",
			"Cada tela tem um ícone (i) com uma explicação curta do que está sendo mostrado.",
		],
		keywords: "começar iniciar configurar primeiro uso início tutorial",
	},
	{
		id: "conceitos",
		group: "Primeiros passos",
		title: "Conceitos básicos",
		summary: "Os termos que aparecem em todo o sistema.",
		notes: [
			"Período: o mês de referência no formato AAAA-MM (por exemplo 2026-11). O seletor de mês no topo das telas muda o período.",
			"Tipo de lançamento: Receita (entra dinheiro), Despesa (sai dinheiro) ou Transferência (move dinheiro entre as suas contas, sem ser receita nem despesa).",
			"Condição: À vista (uma vez), Parcelado (várias parcelas) ou Fixa (se repete todo mês).",
			"Pago ou Em aberto: um lançamento só mexe no saldo da conta depois de marcado como pago ou recebido. Pendentes aparecem em Contas a pagar/receber.",
			"Centro de custo: Fixa (conta com vencimento, que você não escolhe), Variável (gasto do dia a dia) ou Economia (dinheiro guardado, só para relatórios).",
			"Atenção ao nome: a condição Fixa significa repetição mensal; o centro de custo Fixa significa conta obrigatória. São duas escolhas diferentes.",
			"Pessoa (pagador): quem fez o gasto. O orçamento diário considera só o seu pagador (o administrador).",
		],
		keywords: "glossário definições termos período condição status",
	},
	{
		id: "lancamentos",
		group: "Dia a dia",
		title: "Lançamentos",
		summary:
			"É onde você registra tudo o que entra e sai. Cada lançamento tem data, valor, categoria, conta ou cartão, forma de pagamento e centro de custo.",
		href: "/transactions",
		steps: [
			"Toque em adicionar lançamento (o botão + no celular).",
			"Escolha o tipo: Receita, Despesa ou Transferência.",
			"Informe valor, data, categoria e a conta (ou o cartão, se foi no crédito).",
			"Escolha o centro de custo: Fixa para contas com vencimento, Variável para o dia a dia.",
			"Marque como pago ou recebido quando o dinheiro de fato sair ou entrar.",
		],
		notes: [
			"Formas de pagamento: cartão de crédito, cartão de débito, Pix, dinheiro, boleto, pré-pago (VR/VA) e transferência bancária.",
			"Parcelado: informe o número de parcelas. Dá para antecipar parcelas depois, com cálculo de desconto.",
			"Fixa (recorrente): escolha por quantos meses repetir. Sem prazo definido repete por 60 meses; para encerrar, apague as próximas ocorrências.",
			"Despesas exigem centro de custo. Lançamento sem centro de custo é tratado como variável.",
			"Dá para filtrar por data, valor, categoria, conta e situação (pago ou não), fazer ações em lote, adicionar vários de uma vez e exportar em PDF ou Excel.",
			"Divisão entre pessoas e estorno também estão disponíveis nos detalhes do lançamento.",
		],
		keywords:
			"criar editar receita despesa transferência parcelado recorrente filtro lote exportar estorno",
	},
	{
		id: "importar",
		group: "Dia a dia",
		title: "Importar extratos",
		summary:
			"Traga o extrato do banco em OFX ou planilha (XLS/XLSX) para não digitar tudo.",
		href: "/transactions/import",
		steps: [
			"Abra Lançamentos → Importar e envie o arquivo.",
			"Revise as linhas: o sistema sugere categoria e evita duplicatas.",
			"Complete o que faltar (categoria, conta ou cartão e centro de custo) e importe.",
		],
		notes: [
			"Linhas de despesa sem centro de custo ficam incompletas e não são importadas até você completar.",
		],
		keywords: "ofx xls xlsx planilha extrato arquivo",
	},
	{
		id: "contas",
		group: "Dia a dia",
		title: "Contas",
		summary:
			"Suas contas correntes, carteiras e contas pré-pagas, com saldo atual e extrato.",
		href: "/accounts",
		steps: [
			"Crie a conta com nome, tipo e saldo inicial.",
			"Abra a conta para ver o extrato com filtro de datas.",
			"Se o saldo do sistema não bate com o do banco, use a Conciliação bancária.",
		],
		notes: [
			"Saldo inicial devedor (negativo) é aceito, útil para conta no limite do cheque especial.",
			"Excluir do saldo: marque essa opção para contas que não devem entrar nos totais nem no orçamento diário (por exemplo, uma conta só para acompanhar contas de terceiros).",
			"O saldo da conta só considera lançamentos realizados (pagos ou recebidos).",
		],
		keywords: "saldo inicial extrato banco carteira excluir do saldo",
	},
	{
		id: "payables",
		group: "Dia a dia",
		title: "Contas a pagar e a receber",
		summary:
			"A lista de tudo que está pendente: boletos, despesas agendadas, faturas de cartão em aberto e valores a receber.",
		href: "/payables",
		notes: [
			"Ao pagar ou receber, marque o lançamento como pago. Ele passa a contar no saldo.",
			"Contas recorrentes aparecem uma vez por mês, com o vencimento de cada uma.",
		],
		keywords: "boletos pendentes vencimento agendadas",
	},
	{
		id: "inbox",
		group: "Dia a dia",
		title: "Pré-lançamentos (Companion)",
		summary:
			"O app Android OpenMonetis Companion lê as notificações do banco e envia cada uma como pré-lançamento, para você revisar.",
		href: "/inbox",
		steps: [
			"Instale o Companion no celular e conecte com um token (Ajustes → Companion).",
			"Abra Pré-lançamentos e revise cada item.",
			"Processe para virar lançamento, ou descarte.",
		],
		notes: [
			"Notificações duplicadas, compras recusadas e Pix entre as suas próprias contas devem ser descartados ou lançados como transferência.",
			"Deixar muitos itens pendentes atrasa a conciliação. Trate a caixa de entrada toda semana.",
		],
		keywords: "companion android notificações pix descartar processar",
	},
	{
		id: "diario-financeiro",
		group: "Dia a dia",
		title: "Diário financeiro",
		summary:
			"Um check-in rápido do dia: quanto você gastou, em qual categoria e se foi planejado, impulsivo ou necessário.",
		href: "/diary",
		notes: [
			"Há lembrete diário (horário configurável), sequência de dias e conquistas.",
			"Serve de hábito: o importante é registrar todo dia, mesmo quando o valor for zero.",
		],
		keywords:
			"check-in sequência streak conquistas lembrete hábito gastei hoje",
	},
	{
		id: "cartoes",
		group: "Cartões e dívidas",
		title: "Cartões e faturas",
		summary:
			"Cada cartão tem limite, dia de fechamento, dia de vencimento e uma fatura por mês.",
		href: "/cards",
		steps: [
			"Cadastre o cartão com limite, fechamento e vencimento (os dias do app do banco).",
			"Lance cada compra escolhendo o cartão. O sistema coloca a compra na fatura certa.",
			"Abra a fatura do mês para conferir as compras e pagar.",
			"Ao pagar a fatura, o sistema cria o pagamento automaticamente, na conta que você escolher.",
		],
		notes: [
			"A fatura leva o mês do vencimento. Com fechamento no dia 03 e vencimento no dia 10, uma compra feita em 19/10 entra na fatura que vence em novembro.",
			"Não crie lançamento manual de pagamento de fatura: o pagamento automático já é ignorado nos totais, para a despesa não contar duas vezes.",
			"Pagamento parcial e parcelamento de fatura geram lançamentos automáticos para a fatura seguinte.",
			"Se o limite em uso passa do limite do cartão, o app mostra o disponível zerado. Confira se o limite cadastrado é o do app do banco.",
			"Parcelas de compras já feitas entram nas faturas dos meses seguintes. Cadastre-as para o futuro ficar correto.",
		],
		keywords:
			"fatura fechamento vencimento limite parcelamento pagamento crédito",
	},
	{
		id: "daily-budget",
		group: "Planejamento",
		title: "Orçamento diário",
		summary:
			'Responde a pergunta "quanto posso gastar hoje?". Tem duas abas: Hoje (a cota do dia) e Projeção (o saldo dia a dia por até 12 meses).',
		href: "/daily-budget",
		steps: [
			"Mantenha saldos, contas fixas, receitas e faturas em dia.",
			"Abra a engrenagem e escolha o modo: Automático ou Personalizado.",
			"No modo Personalizado, informe um limite diário ou calcule pela Previsão de diário.",
			"Durante o mês, lance os gastos variáveis. O painel mostra o quanto ainda cabe hoje.",
		],
		notes: [
			"Modo Automático: diário = dinheiro livre ÷ dias restantes do mês. Dinheiro livre = saldo das contas + receitas que ainda entram − despesas que ainda saem (fora do cartão) − faturas de cartão do mês ainda não pagas − meta de economia − reserva de segurança.",
			"O valor nunca fica negativo: se o dinheiro livre estiver negativo, o diário mostra R$ 0,00 e o mês aparece em déficit.",
			"Modo Personalizado: usa o seu limite fixo por dia e avisa se esse limite multiplicado pelos dias restantes passar do disponível.",
			"A configuração vale para o mês atual. No mês seguinte, confira o modo e o limite.",
			"Gastar menos hoje aumenta a cota de amanhã, porque o cálculo é refeito com o saldo real a cada dia.",
			"Fixa x Variável: todo gasto que ainda vai sair reduz o dinheiro livre. A diferença é que o variável também consome a cota de hoje, e a fixa não (pagar a luz hoje não estoura o dia).",
			"Despesas de outras pessoas e contas marcadas como excluir do saldo ficam fora do cálculo.",
		],
		keywords:
			"cota diária gastar hoje projeção déficit limite personalizado automático meta economia reserva",
	},
	{
		id: "previsao-diario",
		group: "Planejamento",
		title: "Previsão de diário",
		summary:
			"Calcula o limite diário a partir dos gastos variáveis que você espera ter no mês (o método do Breno).",
		href: "/daily-budget",
		steps: [
			"Em Orçamento diário, abra a engrenagem.",
			"Em Previsão de diário, adicione cada gasto variável esperado: nome e valor mensal (por exemplo Mercado 700, Combustível 450).",
			"Veja o total mensal, os dias do mês e o diário previsto (por exemplo 1.650 ÷ 30 = R$ 55,00).",
			"Toque em Usar como limite diário e salve.",
		],
		notes: [
			"Liste só gastos variáveis. Contas com vencimento (escola, financiamento, luz) são fixas e já estão descontadas do dinheiro livre.",
			"A lista é guardada e vale para todos os meses até você editar.",
			"Revise a lista todo mês, comparando com o que você realmente gastou.",
		],
		keywords:
			"breno diário planejado variável total mensal dividido por 30 dias",
	},
	{
		id: "centros-de-custo",
		group: "Planejamento",
		title: "Fixa, variável e economia: como classificar",
		summary:
			"A classificação diz ao orçamento diário como tratar cada lançamento.",
		notes: [
			"Fixa: tudo que tem vencimento e você não decide na hora. Escola, financiamento, Habitação, energia, água, internet, planos, empréstimos, parcelas.",
			"Variável: o gasto do dia a dia. Mercado, farmácia, combustível, padaria, lanche, Pix para pessoas, compras do cartão.",
			"Economia: dinheiro que você guarda. É só um rótulo para relatórios e não entra no diário. Para o diário respeitar uma economia, use a meta de economia nas configurações.",
			"Compra no cartão: classifique pelo que ela é. Mercado no cartão é Variável e consome a cota do dia da compra. Parcela antiga ou assinatura é Fixa.",
			"A fatura do cartão não se classifica. O dinheiro dela é reservado no mês do vencimento, e o pagamento é automático.",
			"Sem centro de custo, o lançamento conta como Variável. Classifique as contas fixas para elas não consumirem a cota do dia.",
		],
		keywords: "classificar fixo variável economia cartão centro de custo",
	},
	{
		id: "budgets",
		group: "Planejamento",
		title: "Orçamentos por categoria",
		summary:
			"Defina um limite de gasto para cada categoria no mês e acompanhe quanto já foi usado.",
		href: "/budgets",
		steps: [
			"Abra Orçamentos e escolha o mês.",
			"Crie o orçamento de uma categoria com o valor limite.",
			"Acompanhe a porcentagem consumida durante o mês.",
		],
		notes: [
			"Cuidado: quando existe orçamento no mês, o orçamento diário trata o total dos orçamentos como o plano do mês inteiro, já incluindo as contas fixas, e usa o menor entre esse valor e o seu dinheiro real. Para o método da Previsão de diário, não cadastre só as categorias variáveis aqui.",
		],
		keywords: "limite categoria teto gasto mensal",
	},
	{
		id: "savings-goals",
		group: "Planejamento",
		title: "Metas de economia",
		summary:
			"Um objetivo de acúmulo: quanto guardar até uma data, em uma conta específica.",
		href: "/savings-goals",
		steps: [
			"Crie a meta com valor alvo, data alvo e conta de destino.",
			"Guarde dinheiro nessa conta. O progresso é a diferença entre o saldo atual e o saldo de quando a meta foi criada.",
			"Acompanhe o progresso e o aporte mensal sugerido.",
		],
		keywords: "reserva de emergência guardar poupar objetivo aporte",
	},
	{
		id: "bank-sync",
		group: "Integrações",
		title: "Sincronização e conciliação bancária",
		summary:
			"Compare o saldo do sistema com o do banco e traga as linhas do extrato para revisão.",
		href: "/reconciliation",
		steps: [
			"Em Conciliação bancária, veja cada conta: saldo do sistema, saldo do banco e a diferença.",
			"Trate as linhas pendentes: criar o lançamento, casar com um existente ou ignorar.",
			"Repita toda semana até a diferença chegar a zero.",
		],
		notes: [
			"A conexão automática com bancos (Open Finance via Pluggy) é opcional e configurada por quem instala o sistema. Sem ela, use o Companion, a importação de extratos ou o lançamento manual.",
			"A sincronização fica em Finanças → Sincronização bancária.",
		],
		keywords:
			"pluggy open finance saldo banco diferença extrato linhas pendentes",
	},
	{
		id: "balance-sheet",
		group: "Relatórios",
		title: "Balanço patrimonial",
		summary:
			"Ativo (o que você tem), passivo (o que você deve) e patrimônio líquido.",
		href: "/reports/balance-sheet",
		keywords: "ativo passivo patrimônio líquido dívida",
	},
	{
		id: "reports",
		group: "Relatórios",
		title: "Relatórios e insights",
		summary: "Visões prontas dos seus dados, por período.",
		notes: [
			"Tendências: evolução dos gastos por categoria.",
			"Uso de cartões: resumo de gastos por cartão, uso do limite e maiores compras.",
			"Análise de parcelas: parcelas em aberto e quanto resta pagar.",
			"Estabelecimentos: onde você mais gasta.",
			"Insights: análises geradas por IA (precisa de uma chave de IA configurada por quem instala).",
			"O painel principal (Dashboard) tem widgets que você pode escolher e reordenar.",
		],
		href: "/reports/category-trends",
		keywords:
			"tendências uso de cartões parcelas estabelecimentos insights ia dashboard",
	},
	{
		id: "payers",
		group: "Organização",
		title: "Pessoas e contas de terceiros",
		summary:
			"Cadastre quem divide ou faz despesas com você e controle o que é de cada um.",
		href: "/payers",
		notes: [
			"Pessoas podem ter permissão de administrador ou de visualização, e há código de compartilhamento.",
			"O orçamento diário considera só o pagador administrador. Despesas de outras pessoas ficam fora.",
			"Contas que outra pessoa paga (por exemplo, parcelas que o cônjuge paga com o salário dele): crie uma conta com Excluir do saldo, lance uma receita pendente com o valor repassado e as despesas pendentes, e marque tudo como pago quando a pessoa pagar. O saldo dessa conta volta a zero e não afeta o seu diário.",
		],
		keywords: "pagador terceiros cônjuge dividir compartilhar permissão",
	},
	{
		id: "categories",
		group: "Organização",
		title: "Categorias, anotações, anexos e calendário",
		summary: "Ferramentas para organizar e consultar.",
		notes: [
			"Categorias: agrupam os lançamentos por tipo de gasto ou de receita. Crie as suas em Organização → Categorias.",
			"Anotações: notas de texto e listas com checkbox, com arquivamento.",
			"Anexos: comprovantes e documentos ligados a lançamentos (precisa de armazenamento S3 configurado por quem instala).",
			"Calendário: todos os lançamentos do mês em um calendário.",
		],
		href: "/categories",
		keywords: "anotações tarefas comprovantes calendário categorias",
	},
	{
		id: "settings",
		group: "Integrações",
		title: "Ajustes, Companion e Servidor MCP",
		summary: "Preferências, notificações e integrações.",
		href: "/settings",
		notes: [
			"Preferências: tema claro/escuro, privacidade (oculta valores na tela, também em Ferramentas), ordem das colunas e outras opções.",
			"Notificações push: avisos de faturas e boletos vencendo e de orçamentos estourados.",
			"Tokens de API: o mesmo token serve para o Companion e para o Servidor MCP.",
			"Servidor MCP: deixa um assistente de IA (Claude Code ou Claude Desktop) consultar seus dados e fazer registros limitados, sem pagar fatura nem mexer em contas.",
			"Instalar como app (PWA): use o menu do navegador, Instalar aplicativo.",
			"Calculadora e modo privacidade ficam em Ferramentas, na barra superior.",
		],
		keywords: "token api mcp pwa instalar notificações privacidade tema",
	},
	{
		id: "rotina",
		group: "Ajuda",
		title: "Rotina recomendada",
		summary: "O mínimo para o sistema ficar confiável.",
		notes: [
			"Todo dia (30 segundos): lance os gastos variáveis do dia, ou faça o check-in do Diário financeiro.",
			"Toda semana: trate os Pré-lançamentos e concilie os saldos com o banco.",
			"Todo mês: confira as contas fixas, revise a Previsão de diário e verifique se as faturas futuras estão cadastradas.",
			"Quando algo extraordinário acontecer (compra grande, receita extra), lance no dia e veja o efeito na aba Projeção.",
		],
		keywords: "hábito semanal mensal diário checklist",
	},
	{
		id: "problemas",
		group: "Ajuda",
		title: "Perguntas e problemas comuns",
		summary: "Respostas rápidas.",
		notes: [
			"O diário mostra R$ 0,00. O dinheiro livre do mês está negativo. Confira o saldo das contas, as faturas e as despesas futuras; se estiver tudo certo, o mês realmente está em déficit.",
			"O saldo não bate com o banco. Abra Conciliação bancária, trate as linhas pendentes e os pré-lançamentos duplicados.",
			"Uma conta fixa está consumindo a cota do dia. Ela está sem centro de custo ou como Variável. Edite para Fixa.",
			"A compra do cartão não aparece na fatura que eu esperava. Confira o dia de fechamento do cartão: compras depois do fechamento vão para a fatura seguinte.",
			"A despesa ficou duplicada. Provavelmente você lançou o pagamento da fatura à mão. Apague: o pagamento é automático.",
			"O orçamento diário ficou estranho depois de cadastrar orçamentos. Veja o aviso na seção Orçamentos por categoria.",
		],
		keywords: "erro dúvida faq duplicado saldo zero",
	},
];
