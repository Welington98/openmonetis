# Tasks

## 1. Elegibilidade do agrupamento

- [x] 1.1 Em `transactions-page.tsx`, calcular um booleano `isInvoiceGroupingEligible` a partir do `TransactionSearchFilters` resolvido (verdadeiro quando `categoryFilters`, `payerFilters` e `searchFilter` estão vazios); verificar com teste unitário os casos com e sem cada filtro
- [x] 1.2 Passar `isInvoiceGroupingEligible` como prop para `transactions-table.tsx`; verificar que o valor chega corretamente com um teste de render

## 2. Total agregado por cartão

- [x] 2.1 Criar uma função de query que, dado `userId` + `period` (+ lista de `cardId`s presentes na página), retorna o total (`sum(amount)`) por `cardId`, reaproveitando a agregação já usada em `fetchInvoiceData` (`src/features/invoices/queries.ts`); verificar com teste que a soma bate com o total mostrado na tela de fatura para o mesmo cartão/período
- [x] 2.2 Chamar essa função a partir de `transactions-page.tsx` (ou do carregamento de dados da página) somente quando `isInvoiceGroupingEligible` for verdadeiro; verificar que a query não roda quando um filtro de categoria/busca/pessoa está ativo

## 3. Renderização da linha resumida

- [x] 3.1 Em `transactions-table.tsx`, quando `isInvoiceGroupingEligible`, substituir as linhas com o mesmo `cardId` por uma pseudo-linha `{ kind: "invoice-summary", cardId, period, total, cardName, cardLogo }` usando o total do passo 2.1; verificar com teste que N linhas do mesmo cartão viram 1 pseudo-linha com o total correto
- [x] 3.2 Estilizar a pseudo-linha com um visual distinto de um lançamento comum (ícone/estilo de fatura, nome do cartão, período, valor total); verificar visualmente no navegador
- [x] 3.3 Ligar o clique/seleção da pseudo-linha para navegar até `/cards/${cardId}/invoice?period=${period}`; verificar manualmente que o clique abre a fatura correta
- [x] 3.4 Quando `groupTransactionsByDate` estiver ativo, posicionar a pseudo-linha no grupo de data calculado a partir de `buildDateOnlyStringFromPeriodDay(period, card.dueDay)` (`src/shared/utils/financial-dates.ts`); verificar visualmente que a pseudo-linha aparece sob o cabeçalho de vencimento esperado

## 4. Regressão

- [x] 4.1 Verificar manualmente que a tela de fatura do cartão (`/cards/[cardId]/invoice`) continua mostrando as compras individuais sem nenhuma pseudo-linha
- [x] 4.2 Rodar `pnpm exec tsc --noEmit` e `pnpm run lint` e corrigir eventuais erros introduzidos
- [x] 4.3 Rodar a suíte de testes existente da lista de lançamentos (`pnpm run test`, ou o comando de teste equivalente do projeto) e confirmar que os testes de filtros e agrupamento por data continuam passando
