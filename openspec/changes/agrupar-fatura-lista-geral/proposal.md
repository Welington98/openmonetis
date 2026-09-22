# Proposal

## Why

A lista geral de lançamentos (`/transactions` e demais telas que reaproveitam `TransactionsPage`/`transactions-table.tsx`) mostra cada compra de cartão de crédito como uma linha independente, junto com despesas, receitas e transferências. Uma fatura com muitas compras polui a lista e esconde o que realmente importa para quem está olhando a visão geral: quanto vai sair de cada cartão naquele período. O total da fatura já existe e é calculado hoje em `fetchInvoiceData` (`src/features/invoices/queries.ts`), e a tela de fatura por cartão (`/cards/[cardId]/invoice`) já mostra o detalhe completo — falta só resumir isso na lista geral.

## What Changes

- Na lista geral de lançamentos, os lançamentos de cartão de crédito de um mesmo cartão + período passam a poder aparecer resumidos em uma única linha ("Fatura + nome do cartão + período", com o valor total da fatura), em vez de uma linha por compra.
- Clicar nessa linha resumida navega para a tela de fatura do cartão (`/cards/[cardId]/invoice`) já existente, que mantém o detalhe compra a compra.
- O agrupamento só é aplicado quando nenhum filtro de categoria, estabelecimento/busca ou pessoa estiver ativo na lista — esses filtros continuam mostrando as compras de cartão individualmente, já que uma linha resumida perderia sentido mostrando só uma fração da fatura.
- O agrupamento por fatura é independente do agrupamento por data já existente (`groupTransactionsByDate`) e pode conviver com ele.
- Fora de escopo: a tela de fatura do cartão (`/cards/[cardId]/invoice`) em si não muda — ela já mostra os lançamentos individuais e continua assim.

## Capabilities

### New Capabilities
- `transactions-list`: comportamento da lista geral de lançamentos, incluindo o novo agrupamento de compras de cartão em uma linha de fatura por cartão/período.

### Modified Capabilities
(nenhuma — não há spec existente para a lista de lançamentos; esta change introduz a capacidade do zero)

## Impact

- `src/features/transactions/components/table/transactions-table.tsx` — lógica de agrupamento (hoje só por data) e renderização das linhas.
- `src/features/transactions/components/page/transactions-page.tsx` — decide se o agrupamento por fatura está elegível, com base nos filtros ativos.
- `src/features/transactions/lib/page-helpers.ts` — `TransactionSearchFilters`/`buildTransactionWhere`, usados para checar se algum filtro de categoria/busca/pessoa está ativo.
- `src/features/invoices/queries.ts` — reaproveita `fetchInvoiceData`/total da fatura já calculado.
- Não afeta `/cards/[cardId]/invoice` (`src/app/(dashboard)/cards/[cardId]/invoice/page.tsx`).
