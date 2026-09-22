# Spec Delta

## Purpose

Cobre o comportamento da lista geral de lançamentos (despesas, receitas, transferências e compras de cartão exibidas juntas), incluindo como os lançamentos podem ser agrupados visualmente.

## ADDED Requirements

### Requirement: Agrupamento de compras de cartão em uma linha de fatura
Na lista geral de lançamentos, o sistema SHALL exibir as compras de um mesmo cartão de crédito no mesmo período agrupadas em uma única linha resumida, mostrando o cartão, o período e o valor total da fatura, em vez de uma linha por compra. Cada cartão com compras no período exibido gera sua própria linha resumida.

#### Scenario: Fatura com várias compras aparece como uma linha
- **WHEN** a lista geral exibe um período em que um cartão tem duas ou mais compras e nenhum filtro de categoria, estabelecimento/busca ou pessoa está ativo
- **THEN** o sistema mostra uma única linha para aquele cartão naquele período, com o valor igual à soma de todas as compras daquele cartão no período

#### Scenario: Dois cartões no mesmo período geram duas linhas
- **WHEN** o usuário tem compras em dois cartões diferentes no mesmo período
- **THEN** o sistema mostra uma linha resumida para cada cartão, cada uma com o total da respectiva fatura

#### Scenario: Cartão sem compras no período não aparece
- **WHEN** um cartão do usuário não tem nenhuma compra lançada no período exibido
- **THEN** nenhuma linha resumida é exibida para aquele cartão

### Requirement: Navegação da linha resumida para a fatura do cartão
Ao selecionar a linha resumida de uma fatura na lista geral, o sistema SHALL levar o usuário para a tela de fatura daquele cartão, filtrada no mesmo período, onde as compras continuam aparecendo individualmente.

#### Scenario: Clique na linha resumida abre a fatura
- **WHEN** o usuário clica na linha resumida de "Fatura Cartão X" referente a um período
- **THEN** o sistema navega para a tela de fatura do cartão X já filtrada naquele período

### Requirement: Agrupamento desativado quando há filtro que recorta a fatura
O sistema SHALL exibir as compras de cartão individualmente, sem agrupar em uma linha de fatura, sempre que a lista geral estiver filtrada por categoria, estabelecimento/busca ou pessoa.

#### Scenario: Filtro de categoria ativo mostra compras individuais
- **WHEN** o usuário aplica um filtro de categoria na lista geral
- **THEN** as compras de cartão daquele período voltam a aparecer individualmente, sem a linha resumida de fatura

#### Scenario: Remover o filtro reativa o agrupamento
- **WHEN** o usuário remove todos os filtros de categoria, estabelecimento/busca e pessoa
- **THEN** as compras de cartão voltam a aparecer agrupadas em uma linha de fatura por cartão/período

### Requirement: Convivência com o agrupamento por data
O sistema SHALL permitir que o agrupamento por fatura de cartão e o agrupamento por data (já existente) estejam ativos ao mesmo tempo. Quando ambos estão ativos, a linha resumida da fatura é posicionada no grupo de data correspondente à data de vencimento da fatura.

#### Scenario: Agrupamento por data e por fatura juntos
- **WHEN** o usuário tem o agrupamento por data ativo e a lista não está filtrada por categoria, estabelecimento/busca ou pessoa
- **THEN** a linha resumida de cada fatura aparece sob o cabeçalho de data correspondente à data de vencimento daquela fatura, junto dos demais lançamentos daquele dia
