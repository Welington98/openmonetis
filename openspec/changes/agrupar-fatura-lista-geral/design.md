# Design

## Context

Ver `proposal.md - Why` para a motivação. Hoje:

- A lista geral (`TransactionsPage`, `src/features/transactions/components/page/transactions-page.tsx`) e a tela de fatura (`/cards/[cardId]/invoice/page.tsx`) reaproveitam o mesmo componente de tabela (`transactions-table.tsx`) e a mesma query genérica (`fetchTransactionsWithRelations`). A única diferença é o conjunto de filtros: a fatura filtra por `cardId` + `period`; a lista geral normalmente não filtra por cartão.
- O único agrupamento hoje existente é por data de compra, calculado em `transactions-table.tsx:236-252` (`groupedRows`, um `reduce` client-side sobre as linhas já carregadas), ligado ao preference `groupTransactionsByDate` (`userPreferences.groupTransactionsByDate`, `src/db/schema.ts:160`).
- Os filtros ativos da lista (categoria, estabelecimento/busca, pessoa, cartão/conta) já chegam estruturados em `TransactionSearchFilters` (`src/features/transactions/lib/page-helpers.ts:69-85`) e são convertidos em condições SQL por `buildTransactionWhere` (mesmo arquivo, linha 392).
- O total de uma fatura já é calculado com `sum(transactions.amount)` filtrado por `cardId` + `period` em `fetchInvoiceData` (`src/features/invoices/queries.ts:66-76`).
- A data de vencimento de uma fatura não é armazenada diretamente; é derivada do `dueDay` do cartão via `buildDateOnlyStringFromPeriodDay(period, dueDay)` (`src/shared/utils/financial-dates.ts:129`).

## Goals / Non-Goals

**Goals:**
- Resumir, na lista geral, todas as compras de um mesmo cartão + período em uma única linha com o valor total da fatura.
- Reaproveitar a tela de fatura já existente como destino de navegação, sem duplicar lógica de exibição de fatura.
- Definir uma regra única e objetiva de quando o agrupamento se aplica, baseada nos filtros já existentes.

**Non-Goals:**
- Não muda a tela de fatura do cartão (`/cards/[cardId]/invoice`) em si.
- Não introduz um agrupamento manual/definido pelo usuário (ex: "Viagem SP") — é só o agrupamento automático por cartão + período.
- Não agrupa lançamentos de outros tipos (despesa, receita, transferência) — só compras associadas a um `cardId`.

## Decisions

**1. O total resumido vem de uma agregação por `cardId` no servidor, não da soma das linhas visíveis na página.**
A lista geral é paginada no servidor (`isServerPaginated`, `transactions-table.tsx`), então as compras de um mesmo cartão/período podem ficar divididas entre páginas — somar só as linhas carregadas na página atual daria um total errado. Em vez disso, quando o agrupamento estiver elegível (decisão 2), a página busca, com a mesma agregação `sum(transactions.amount)` já usada em `fetchInvoiceData` (`invoices/queries.ts:66-76`), o total por `cardId` para os cartões com lançamentos no período — uma query adicional agrupada por cartão, não uma por linha.
*Alternativa considerada*: somar apenas as linhas carregadas na página atual, no cliente. Rejeitada por poder mostrar um total de fatura incorreto quando a paginação corta as compras de um cartão entre páginas — inaceitável em valores financeiros.

**2. Elegibilidade do agrupamento é calculada uma vez, a partir do objeto de filtros já montado pela página.**
`TransactionsPage`/`transactions-page.tsx` já tem acesso ao `TransactionSearchFilters` resolvido da URL antes de passar as linhas para a tabela. O agrupamento por fatura fica habilitado quando `categoryFilters`, `payerFilters` e `searchFilter` (usado para busca por estabelecimento) estão vazios. Filtros de período e de conta/cartão (`accountCardFilters`) não desabilitam o agrupamento — inclusive um filtro por um cartão específico continua elegível a agrupar (mostraria uma única linha resumida daquele cartão).
*Alternativa considerada*: calcular a elegibilidade dentro do próprio `transactions-table.tsx`, olhando as linhas renderizadas. Rejeitada porque o componente de tabela não sabe distinguir "não há compras de cartão nesta página" de "há um filtro de categoria ativo" sem receber os filtros explicitamente — a regra fica mais clara vindo de onde os filtros já existem.

**3. Linha resumida é uma pseudo-linha calculada no cliente, não uma linha adicional buscada do servidor.**
`transactions-table.tsx` já constrói `groupedRows` no cliente; o agrupamento por fatura segue o mesmo padrão: para cada `cardId` presente nas linhas carregadas (quando elegível), substituir as N linhas daquele cartão por uma pseudo-linha `{ kind: "invoice-summary", cardId, period, total, cardName, cardLogo }`, mantendo as demais linhas (despesa/receita/transferência/outros cartões) como estão.
*Alternativa considerada*: buscar a lista já agrupada do servidor (uma query com `GROUP BY cardId`). Rejeitada porque a lista precisa continuar paginando/ordenando lançamentos individuais de outros tipos na mesma página — agrupar no servidor exigiria duas queries e reconciliar paginação; o volume de linhas por página (até 100, ver `TRANSACTIONS_PAGE_SIZE_OPTIONS`) é pequeno o bastante para o cliente resolver.

**4. Clique navega para a fatura usando `cardId` + `period` da pseudo-linha.**
A pseudo-linha renderiza um link/handler para `/cards/${cardId}/invoice?period=${period}`, mesma rota já usada pela navegação existente do app para a fatura. Não é necessário nenhum estado novo de UI (modal, expansão) — a navegação já resolve a visualização detalhada.

**5. Quando o agrupamento por data está ativo, a pseudo-linha usa a data de vencimento da fatura como chave de agrupamento por data.**
A chave de data hoje é `purchaseDate` de cada lançamento (`transactions-table.tsx:239`); uma pseudo-linha de fatura não tem uma única `purchaseDate` (representa várias compras em datas diferentes). Ela usa `buildDateOnlyStringFromPeriodDay(period, card.dueDay)` como sua chave de agrupamento por data, para aparecer junto dos demais lançamentos com vencimento próximo — consistente com o dado que a própria tela de fatura já usa para mostrar "vencimento" (`invoice-summary-card.tsx`).

## Risks / Trade-offs

- [Risco] Buscar o total agregado por cartão exige uma query adicional na renderização da lista → Mitigação: a query só roda quando o agrupamento está elegível (sem filtro de categoria/busca/pessoa) e é uma única agregação por página, agrupada por `cardId`, não uma por linha ou por cartão individualmente.
- [Risco] A pseudo-linha ainda precisa de nome/logo do cartão para exibir a fatura resumida → Mitigação: esses campos já vêm nas linhas carregadas via `mapTransactionsData` (`cartaoName`, `cartaoLogo`, `cardId`), sem busca extra.
- [Risco] Confundir o usuário se a pseudo-linha aparecer com o mesmo estilo de um lançamento normal → Mitigação: usar visual distinto (ex: ícone de fatura, estilo de card) para deixar claro que é um resumo, não um lançamento único.

## Migration Plan

Mudança aditiva e só de apresentação — nenhuma migração de dados. Pode ser habilitada diretamente sem afetar lançamentos existentes.
