# Recursos a portar do financeiro-pessoal para o OpenMonetis

Levantamento dos 6 recursos que o [financeiro-pessoal](https://github.com/Welington98/financeiro-pessoal) tem e o
[OpenMonetis](https://github.com/Welington98/openmonetis) (v2.7.13, lido em `bf4138d`) não tem hoje — confirmado
lendo `src/db/schema.ts`, o README e as pastas de features do OpenMonetis. Cada seção abaixo é um brief
autocontido, pensado para ser passado direto para um agente de código trabalhando no repositório do
OpenMonetis: descreve o comportamento esperado, como o financeiro-pessoal resolveu (schema + decisões de
design), e uma proposta concreta de implementação já na convenção deles (Drizzle, tabelas em português,
`userId` multi-tenant, estrutura `src/features/<nome>/{actions,queries,components,lib}`).

Nenhuma proposta abaixo foi implementada ou validada no OpenMonetis — são pontos de partida, não specs
fechadas. Ajustar contra o código real deles antes de implementar.

## Ordem sugerida

1. [Balanço patrimonial](#1-balanço-patrimonial-ativopassivopatrimônio-líquido) — baixo esforço, só leitura
2. [Status de lançamento derivado](#2-status-de-lançamento-como-enum-derivado) — baixo esforço, só apresentação
3. [Metas de economia](#3-metas-de-economia) — esforço médio, tabela nova isolada
4. [Subcategorias + vínculos de referência](#4-subcategorias--vínculos-de-referência) — esforço médio, mexe em formulário/filtro
5. [Extração automática de comprovante](#5-extração-automática-de-comprovante-pdf--telegram) — esforço médio, reaproveita `pre_lancamentos`
6. [Sincronização bancária automática (Open Finance) + conciliação](#6-sincronização-bancária-automática-open-finance--conciliação) — alto esforço, maior valor

---

## 1. Balanço patrimonial (Ativo/Passivo/Patrimônio líquido)

**O que é:** uma tela que agrupa as contas do usuário em Ativo (o que ele tem) e Passivo (o que ele deve),
mostrando três totais: Ativo, Passivo e Patrimônio Líquido (Ativo − Passivo). Não existe hoje no
OpenMonetis nenhuma tela equivalente — confirmado por busca no código e no README.

**Como o financeiro-pessoal resolve:**
- Classificação é uma constante em código, não uma coluna no schema: `ASSET_ACCOUNT_TYPES` lista os tipos
  de conta que são ativo (`checking`, `savings`, `cash`, `investment`); qualquer tipo fora dessa lista
  (hoje só `credit_card`) é passivo.
- Uma função pura `computeBalanceSheetTotals(accounts)` recebe `{ type, balanceCents }[]` (o resultado que
  já vem da função existente de saldo por conta) e retorna `{ ativoCents, passivoCents,
  patrimonioLiquidoCents }`. O saldo de uma conta de passivo já vem negativo (dívida) — a função inverte o
  sinal só para exibir o passivo como um valor positivo de dívida.
- A tela reaproveita a função de saldo por conta que já existe (sem alterá-la) e só filtra contas
  arquivadas — o total bate exatamente com o "saldo total" já mostrado no dashboard, o que serve de
  verificação: Ativo − Passivo tem que ser igual ao saldo total consolidado atual.

**Proposta para o OpenMonetis:**
- Nenhuma mudança de schema. `financialAccounts.accountType` (coluna `tipo_conta`) já existe — só falta
  descobrir os valores possíveis hoje (prováveis: conta corrente, poupança, cartão, dinheiro, investimento
  — conferir em `src/shared/lib/accounts/constants.ts`) e decidir qual lista é ativo vs. passivo.
- Nova feature `src/features/balance-sheet/` (ou dentro de `reports/`, já que a estrutura de features deles
  já tem um `reports/` com padrão de queries por período): `queries.ts` com uma função que agrupa
  `financialAccounts` por `accountType` e soma o saldo calculado de cada uma (reaproveitando a query de
  saldo que já existe, a mesma usada no dashboard); um helper puro de classificação/soma testável sem banco.
- UI: página nova seguindo o padrão de outras telas de relatório (cards de totais + lista de contas
  agrupada, no estilo do `category-report-page.tsx` já existente).
- **Atenção:** conferir se `excludeFromBalance` (coluna já existente em `financialAccounts`) precisa ser
  respeitado aqui — provavelmente sim, para o total bater com o saldo consolidado do dashboard.

**Esforço:** baixo. **Risco:** baixo — é leitura pura sobre dado que já existe.

---

## 2. Status de lançamento como enum derivado

**O que é:** em vez de um único boolean "confirmado", o lançamento tem 4 estados visuais derivados
automaticamente: **Agendado** (não confirmado, data no futuro), **Pendente** (não confirmado, data igual ou
no passado — muda de Agendado para Pendente sozinho, sem job nenhum, só porque a data virou passado),
**Confirmado**, e **Conciliado** (mais forte que confirmado — vence mesmo se por algum motivo o confirmado
estiver false). Nenhum desses 4 estados é uma coluna nova: são computados na hora da leitura.

**Como o financeiro-pessoal resolve** (`src/lib/transactionStatus.ts`, função pura, sem I/O):

```ts
function getTransactionStatus(t: { isConfirmed: boolean; isReconciled: boolean; date: Date }) {
  if (t.isReconciled) return "reconciled";
  if (t.isConfirmed) return "confirmed";
  return t.date <= today ? "pending" : "scheduled";
}
```

Cada estado tem um rótulo em português e uma cor (badge). Existe também uma versão que gera a cláusula de
filtro (`transactionStatusWhereClause`) para poder filtrar a lista de lançamentos por qualquer um dos 4
estados via querystring.

**Proposta para o OpenMonetis:**
- O schema já tem `transactions.isSettled` (boolean) e `purchaseDate`/`dueDate` — dá pra derivar os mesmos 4
  estados sem nenhuma migração, só uma função pura equivalente + os badges na tabela de lançamentos e no
  filtro (`transactions-filters.tsx`).
- Ponto de atenção: o OpenMonetis não tem um campo `isReconciled` separado — teria que decidir se vale
  introduzir um (aí sim precisa de migração) ou se os 4 estados viram 3 (sem "Conciliado") até que exista
  alguma noção de conciliação bancária lá (ver item 6 abaixo — se a sincronização automática for
  implementada, "conciliado" passa a fazer sentido natural: veio confirmado direto do banco).
- Sugestão: implementar primeiro com 3 estados (agendado/pendente/confirmado) usando só o que já existe, e
  promover para 4 quando (e se) o item 6 for implementado.

**Esforço:** baixo (versão de 3 estados) a médio (se decidir migrar para 4 com coluna nova).
**Risco:** baixo.

---

## 3. Metas de economia

**O que é:** diferente de orçamento (limite de gasto por categoria), uma meta é um objetivo de acúmulo:
"quero ter R$X guardado até tal data, numa conta específica". O progresso é a diferença entre o saldo atual
da conta de destino e o saldo dela no momento em que a meta foi criada — não é um livro-razão de aportes
manuais, é observado direto do saldo da conta. O sistema sugere quanto guardar por mês pra bater a meta na
data alvo, mas isso é só informativo (nunca cria lançamento sozinho).

**Como o financeiro-pessoal resolve** (`prisma/schema.prisma` + `src/services/savingsGoals.ts`):

Schema (Prisma, adaptar pra Drizzle):
```
SavingsGoal {
  id, description, targetAmountCents, startDate, targetDate,
  monthlyRateBps?      // taxa mensal aproximada, em pontos-base — só informativo, nunca usado em cálculo
  destinationAccountId → Account
  startingBalanceCents // saldo da conta no momento em que a meta foi criada
}
```

Lógica pura (sem I/O, testável isolada):
```ts
progressCents = currentBalanceCents - startingBalanceCents
isReached = progressCents >= targetAmountCents

suggestedMonthlyContribution(targetAmountCents, progressCents, today, targetDate):
  if (progressCents >= targetAmountCents) return null  // já bateu, não sugere mais nada
  remaining = targetAmountCents - progressCents
  monthsRemaining = max(wholeMonthsBetween(today, targetDate), 1)  // nunca divide por zero
  return round(remaining / monthsRemaining)
```

**Proposta para o OpenMonetis:**
- Nova tabela `metas` (Drizzle, seguindo o padrão de `orcamentos`): `id` (uuid), `descricao`, `valor_alvo`
  (numeric 12,2), `data_inicio`, `data_alvo`, `conta_destino_id` → `contas.id`, `saldo_inicial` (numeric
  12,2, capturado no momento da criação), `user_id` (multi-tenant, com índice composto
  `user_id + conta_destino_id`), `created_at`/`updated_at`.
- Nova feature `src/features/savings-goals/` (ou `goals/`) com `actions.ts` (criar/editar/excluir) e
  `queries.ts` (listar metas do usuário com progresso calculado — reaproveitando a query de saldo de conta
  que `financialAccounts`/reports já usa).
- Um helper puro equivalente a `computeSavingsGoalProgress`/`computeSuggestedMonthlyContribution`, testável
  sem banco.
- UI: cards de progresso (barra), possivelmente reaproveitando o componente de progresso que orçamentos já
  usam lá.

**Esforço:** médio. **Risco:** baixo — tabela nova isolada, sem tocar em `lancamentos`.

---

## 4. Subcategorias + vínculos de referência

**O que é:** dois recursos relacionados mas distintos:
1. **Hierarquia de categoria** — uma categoria pode ter uma categoria-pai (ex.: "Alimentação" → "Mercado",
   "Restaurante"). Hoje a `categorias` do OpenMonetis é plana (sem `parent_id`).
2. **Vínculos de referência no lançamento** — além de categoria, o lançamento pode referenciar um
   **centro de custo**, um **contato** e um **projeto** (cada um é uma entidade nomeada simples, tipo
   `CostCenter { id, name }`), mais **tags** livres em relação N:N. Isso serve pra quem usa o app também
   pra controle de gastos de freelance/pequeno negócio dentro das finanças pessoais — sem ser um sistema de
   contabilidade completo, só um jeito de filtrar/relatar por "cliente X" ou "projeto Y" além da categoria.

**Como o financeiro-pessoal resolve:**
- `Category.parentId` — self-relation simples (`parent`/`children`), sem limite de profundidade imposto no
  schema (a UI trata como 1 nível na prática).
- `CostCenter`, `Contact`, `Project` são todos o mesmo formato mínimo: `{ id, name (unique), createdAt }` +
  relação 1:N com `Transaction` (campo `costCenterId`/`contactId`/`projectId`, todos opcionais, `onDelete:
  SetNull` — apagar o centro de custo não apaga o lançamento, só desvincula).
- `Tag` é N:N implícito com `Transaction` (join table implícita do Prisma).

**Proposta para o OpenMonetis:**
- `categorias`: adicionar coluna `categoria_pai_id` (uuid, nullable, self-reference com `onDelete: set
  null` ou `restrict` — decidir se apagar uma categoria-pai com filhos deve ser bloqueado ou órfã-los).
  Índice em `categoria_pai_id`.
- Três tabelas novas no mesmo formato mínimo, seguindo a convenção deles (nome em português, `user_id`
  multi-tenant já que tudo lá é por usuário — diferente do financeiro-pessoal, que é single-tenant e não
  tem esse campo):
  ```
  centros_custo   { id, nome, user_id, created_at }
  contatos        { id, nome, user_id, created_at }
  projetos        { id, nome, user_id, created_at }
  ```
  Cada uma com índice único em `(user_id, nome)` em vez de `nome` global único (que é o que o
  financeiro-pessoal faz, mas lá não existe multiusuário).
- `lancamentos`: 3 colunas novas opcionais (`centro_custo_id`, `contato_id`, `projeto_id`), todas
  `onDelete: set null`, com índice em cada uma (mesmo padrão de índice que as demais FKs opcionais da
  tabela já seguem).
- `tags` (`{ id, nome, user_id }`, único por `user_id + nome`) + `lancamento_tags` (junction:
  `lancamento_id`, `tag_id`, chave composta — mesmo padrão de `transactionAttachments`/`noteAttachments`
  que já existem no schema deles).
- UI: os três selects (centro de custo/contato/projeto) + multi-select de tags entram na seção "mais
  detalhes" do formulário de lançamento, que já existe lá como conceito (campos opcionais colapsados);
  filtro de subcategoria entra no select de categoria existente, agrupado por pai.

**Esforço:** médio — schema é simples, mas toca formulário de lançamento, filtros e cadastro (CRUD) de 4
entidades novas.
**Risco:** baixo-médio — nenhuma mudança em coluna existente além da nova FK em `categorias`.

---

## 5. Extração automática de comprovante (PDF + Telegram)

**O que é, com precisão** (correção em relação a uma versão anterior deste levantamento que chamou isso de
"OCR" — não é): o financeiro-pessoal recebe um **PDF de comprovante de Pix/transferência** (upload direto
na web, ou enviado para um **bot do Telegram**), extrai o **texto do PDF** (não é OCR de imagem — é extração
de texto de um PDF gerado digitalmente pelo banco) e usa **heurísticas de regex** em português para achar
valor, data e descrição/favorecido, pré-preenchendo um formulário de lançamento que o usuário confirma ou
corrige antes de salvar. Nunca cria o lançamento sozinho sem revisão.

**Como o financeiro-pessoal resolve** (`src/services/receiptParsing.ts` + schema):
- Regex por linha-âncora: procura linhas com "valor pago", "valor da transferência", "valor total" etc.,
  depois um padrão de valor brasileiro (`R$ 1.234,56`) na mesma linha ou perto.
- Data: aceita formato numérico (`dd/mm/yyyy`) ou por extenso ("25 de agosto de 2026", com um mapa de nomes
  de mês em português).
- Tipo (receita/despesa): heurística por palavras-chave ("você recebeu", "depósito recebido" → receita;
  senão despesa).
- Descrição: procura linhas rotuladas "favorecido"/"beneficiário"/"para:".
- Guarda o texto bruto extraído (truncado) para debug/reprocessamento manual quando a heurística erra.
- Modelo (`ReceiptUpload`): guarda o arquivo (bytes), status (`pending`/`confirmed`/`rejected`), os campos
  extraídos, um `parseError` quando falha, e a origem (`web` ou `telegram`, com `telegramChatId`/
  `telegramMessageId` quando vier do bot).

**Proposta para o OpenMonetis — reaproveitar `pre_lancamentos`, não criar tabela nova:**
- O OpenMonetis **já tem exatamente o padrão de fila de revisão necessário**: `inbox_items`
  (`pre_lancamentos`), hoje usado só para as notificações capturadas pelo Companion Android
  (`source_app`, `original_text`, `parsed_name`, `parsed_amount`, `status: pending/processed/discarded`,
  `transaction_id` quando processado). Extrair um comprovante em PDF é conceitualmente o mesmo fluxo:
  "uma fonte externa manda um texto bruto → parseia → usuário revisa → vira lançamento".
- Proposta: generalizar `pre_lancamentos` para aceitar uma origem `"receipt_pdf"` (além das origens de app
  bancário que já existem), com `original_text` = texto extraído do PDF em vez do texto da notificação, e
  reaproveitar `parsed_name`/`parsed_amount` como já são. Precisa de 1-2 colunas a mais (`parsed_date`,
  referência ao arquivo em `anexos` já que eles já têm storage S3 de anexos prontos — bem mais simples que
  o `Bytes` direto no banco que o financeiro-pessoal usa).
- Serviço novo (`src/features/inbox/lib/receipt-parsing.ts` ou similar) portando as regex do
  financeiro-pessoal quase 1:1 — é lógica pura de string, sem I/O, direto portável.
- Canal Telegram é opcional/fase 2: um webhook que recebe o PDF, chama o mesmo parser, e cria a entrada em
  `pre_lancamentos` com `source_app = "telegram"`. Não depende de nada do item 6.

**Esforço:** médio — a parte de parsing é praticamente um port direto; o trabalho real é encaixar no
`inbox_items` existente sem quebrar o fluxo do Companion.
**Risco:** baixo-médio — cuidado para não acoplar demais os dois casos de uso (notificação de app vs. PDF de
comprovante) na mesma tabela a ponto de um quebrar o outro; talvez valha um campo `item_type` discriminando.

---

## 6. Sincronização bancária automática (Open Finance) + conciliação

**O que é:** conexão real com a conta bancária do usuário via [Pluggy](https://pluggy.ai) (agregador
brasileiro de Open Finance) — sincroniza contas e transações automaticamente, sem o usuário digitar nada
nem precisar que o banco mande notificação. É o recurso mais valioso do financeiro-pessoal e o único que o
Companion Android do OpenMonetis não substitui de verdade (notificação captura só o que o banco decide
notificar, no formato que o banco decide notificar — não é a conta oficial).

O README do OpenMonetis é explícito: **"Não há Open Finance"** — hoje a única forma de ter dado bancário lá
é manual, import OFX/XLS, ou o Companion.

**Como o financeiro-pessoal resolve** (visão geral — é o recurso mais complexo dos 6):

Duas peças que trabalham juntas:

1. **Conexão + sync automático** (`PluggyItem` + `src/services/pluggySync.ts`):
   - `PluggyItem { pluggyItemId (unique), connectorName, status, lastSyncedAt, isActive }`, com relação 1:N
     para `Account` (uma conexão pode trazer várias contas do mesmo banco — corrente + poupança, por
     exemplo).
   - `syncPluggyItem(pluggyItemId)` busca contas e transações novas via API do Pluggy, mapeia tipo de conta
     e tipo de transação Pluggy → os enums internos do app, e tenta uma categorização automática
     best-effort (`matchCategory`) — nunca 100% confiável, por isso sempre passa pelo passo 2 antes de virar
     lançamento definitivo.

2. **Conciliação/revisão** (`BankImport` + `StatementLine` + `src/services/reconciliation.ts`) — o mesmo
   pipeline serve tanto para o sync automático do Pluggy quanto para import manual de OFX/CSV/PDF de
   extrato (`BankImportSource: ofx | csv | pdf | pluggy`):
   - Cada linha importada vira uma `StatementLine` com status `unmatched` inicialmente.
   - `runMatching(importId)` roda heurísticas (`findMatchCandidates`) tentando casar cada linha do extrato
     com um `Transaction` já existente no app (ex.: um lançamento manual que o usuário já tinha criado
     antes do extrato chegar) — evita duplicar.
   - O que não casa fica pendente de revisão manual: usuário decide se cria um lançamento novo, casa
     manualmente com um existente (`getMatchCandidatesForLine` oferece sugestões), ou ignora a linha.
   - `matchedTransactionId` (único) fecha o ciclo quando a linha vira/casa com um `Transaction` real.

**Proposta para o OpenMonetis:**
- **Antes de desenhar schema:** ler o import OFX/XLS deles a fundo (`ofx_import_fingerprint`,
  `ofx_fit_id`, `import_batch_id` já existem em `lancamentos` — sinal de que o dedup já existe, mas não está
  claro se existe uma fila de *revisão* (unmatched/matched) como o `StatementLine`, ou se o import já cria
  o lançamento direto). Se não existir fila de revisão, é a peça que falta antes até de pensar em Pluggy.
- Tabela `conexoes_bancarias` (equivalente a `PluggyItem`): `id`, `user_id`, `pluggy_item_id` (unique),
  `connector_name`, `status`, `last_synced_at`, `is_active`, `created_at`. Uma FK opcional em `contas`
  (`conexao_bancaria_id`) para saber quais contas vieram de qual conexão.
- Se a fila de revisão não existir: nova tabela `linhas_extrato` bem próxima do `StatementLine` (`id`,
  `importacao_id`, `data`, `descricao`, `valor`, `tipo`, `external_id`, `status: matched|unmatched|ignored`,
  `categoria_id?`, `lancamento_correspondente_id?` único), reaproveitando a tabela de importação que
  provavelmente já existe para OFX (ou criando `importacoes_bancarias` se não existir, com `origem: ofx |
  xls | pluggy`).
- Serviço de sync: cron/job periódico (ou trigger manual) chamando a API do Pluggy por conexão ativa,
  gerando `linhas_extrato` do mesmo jeito que um import manual gera — **o objetivo de design aqui é que
  Pluggy vire só mais uma origem de `linhas_extrato`, reaproveitando 100% do fluxo de matching/revisão que
  já existir (ou for criado) para OFX**, em vez de um caminho paralelo.
- Credenciais Pluggy (client id/secret) como variável de ambiente, seguindo o padrão de `.env.example`
  deles (que já lista chaves de outros serviços externos: S3, IA, e-mail).

**Esforço:** alto — é o único item da lista que precisa de infraestrutura nova (chamada a API externa, job
periódico, fluxo de revisão se não existir ainda) em vez de só schema + tela.
**Risco:** médio-alto — depende de como o import OFX deles já funciona por dentro; fazer esse
reconhecimento primeiro muda a estimativa. Também é o único item com custo recorrente (a API do Pluggy é
paga por conexão ativa) — vale confirmar que o modelo de negócio do OpenMonetis (self-hosted, gratuito para
uso pessoal) comporta isso antes de embarcar.

---

## Notas gerais para quem for implementar

- **Multi-tenant desde o dia 1:** toda tabela nova acima precisa nascer com `user_id` (referência a `user`,
  `onDelete: cascade`) e os índices compostos correspondentes (`user_id` + o que for mais filtrado junto) —
  padrão que toda tabela existente no schema deles já segue. O financeiro-pessoal é single-tenant, então
  nenhum dos trechos de schema citados acima tem esse campo — adicionar ao portar.
- **Estrutura de feature:** cada item acima deveria virar (ou se encaixar dentro de) uma pasta em
  `src/features/<nome>/` com `actions.ts`/`queries.ts` como portas de entrada, conforme a convenção
  documentada no `CLAUDE.md` do OpenMonetis.
- **ORM:** todo o schema acima está descrito em português/conceito, não em sintaxe Drizzle literal — traduzir
  para `pgTable`/`relations` conferindo o estilo exato usado nas tabelas vizinhas mais parecidas
  (`orcamentos` para tabelas simples ligadas a categoria; `payerShares`/`transactionAttachments` para
  junctions).