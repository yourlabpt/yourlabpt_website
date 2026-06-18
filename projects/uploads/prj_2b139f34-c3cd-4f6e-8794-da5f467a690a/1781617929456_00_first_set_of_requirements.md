Abaixo está uma especificação organizada de requisitos de cliente, stakeholders, funcionalidades, páginas e identidade visual para a aplicação Grupo Ferreira — City Pass Gastronómico, baseada na imagem e na descrição fornecida.

1. Visão geral do produto

A aplicação será um City Pass Gastronómico do Grupo Ferreira, permitindo que clientes comprem planos de desconto e utilizem cupons digitais em restaurantes participantes.

O utilizador poderá criar conta, consultar restaurantes, ver detalhes de cada restaurante, comprar um plano de desconto por dias e número de pessoas, gerar cupons com QR Code e acompanhar o histórico de utilização.

2. Objetivo do cliente

O objetivo principal é criar uma aplicação premium, simples e confiável para:

Aumentar a frequência de clientes nos restaurantes do Grupo Ferreira.

Facilitar a venda de planos de desconto digitais.

Permitir que o cliente use cupons de forma rápida no restaurante.

Centralizar informações sobre restaurantes, menus, websites e benefícios.

Criar uma experiência visual elegante, associada à gastronomia, Lisboa, exclusividade e confiança.

3. Stakeholders

3.1 Cliente final / utilizador da app

Pessoa que baixa a aplicação, cria conta, compra um plano e utiliza cupons nos restaurantes.

Necessidades principais:

Consultar restaurantes disponíveis.

Comprar plano de desconto.

Gerar cupom no momento da refeição.

Apresentar QR Code ao funcionário.

Ver dias restantes e benefícios ativos.

Consultar histórico de utilização.

Gerir perfil, métodos de pagamento e dados pessoais.

3.2 Grupo Ferreira

Empresa proprietária da aplicação e dos restaurantes participantes.

Necessidades principais:

Divulgar os restaurantes do grupo.

Aumentar vendas e reservas.

Controlar planos ativos.

Validar cupons utilizados.

Ter consistência visual da marca.

Garantir que o desconto é aplicado apenas a utilizadores elegíveis.

3.3 Restaurantes participantes

Unidades como Los Chanetes, Casa Augusta, Brasa D’Ouro, A Capela, entre outros.

Necessidades principais:

Aparecer na lista da aplicação.

Disponibilizar fotos, localização, website e menu.

Receber clientes com cupons válidos.

Validar QR Code ou código manualmente.

Consultar se o cupom está ativo, expirado ou já utilizado.

3.4 Funcionários dos restaurantes

Pessoas responsáveis por validar o cupom no momento do pagamento.

Necessidades principais:

Ver rapidamente o QR Code.

Confirmar código do cupom.

Validar se o cupom ainda está dentro do prazo.

Confirmar número de pessoas abrangidas pelo plano.

Aplicar o desconto correto.

3.5 Administrador da plataforma

Pessoa ou equipa que gere conteúdos, restaurantes, planos e utilizadores.

Necessidades principais:

Gerir restaurantes.

Atualizar fotos, menus e websites.

Criar ou alterar planos disponíveis.

Consultar utilizadores e planos ativos.

Consultar histórico de cupons.

Gerir termos, suporte e métodos de pagamento.

4. Requisitos funcionais gerais

RF01 — Registo de conta

A aplicação deve permitir criar uma nova conta com:

Nome completo.

E-mail.

Palavra-passe.

Também deve permitir autenticação social com:

Google.

Apple.

RF02 — Login

A aplicação deve permitir que utilizadores já registados acedam à conta.

O ecrã deve conter opção “Já tem conta? Entrar”.

RF03 — Splash screen

A aplicação deve apresentar uma tela inicial com:

Imagem de Lisboa.

Logótipo Grupo Ferreira.

Texto “City Pass Gastronómico”.

Chamada principal: “Descubra Lisboa. Poupe em cada refeição.”

Botão “Começar”.

RF04 — Lista de restaurantes

Após login, o utilizador deve ver a página inicial com restaurantes disponíveis.

Cada restaurante deve apresentar:

Imagem.

Nome.

Localização.

Botão “Ver restaurante”.

Botão “Gerar cupom”.

RF05 — Detalhe do restaurante

Ao abrir um restaurante, a aplicação deve mostrar:

Imagem principal.

Nome do restaurante.

Localização.

Descrição curta.

Botão para visitar website.

Botão para ver menu.

Botão para gerar cupom.

RF06 — Compra de plano

Quando o utilizador tentar gerar cupom sem plano ativo, a aplicação deve direcionar para a escolha de plano.

O utilizador deve escolher:

Quantidade de dias.

Quantidade de pessoas.

Desconto aplicado.

RF07 — Duração do plano

A aplicação deve permitir seleção de plano por:

1 dia.

3 dias.

5 dias.

10 dias.

15 dias.

Número personalizado de dias.

RF08 — Número de pessoas

A aplicação deve permitir definir quantas pessoas poderão usar o benefício em conjunto.

A interface deve ter botões de aumentar e diminuir quantidade de pessoas.

RF09 — Resumo do plano

Antes do pagamento, a aplicação deve exibir resumo com:

Quantidade de dias.

Quantidade de pessoas.

Desconto incluído.

Total a pagar.

RF10 — Carrinho / pagamento

A aplicação deve apresentar uma página de carrinho contendo:

Plano selecionado.

Número de dias.

Número de pessoas.

Percentual de desconto.

Total a pagar.

Método de pagamento.

RF11 — Métodos de pagamento

A aplicação deve aceitar:

Cartão de crédito.

MB WAY.

Apple Pay.

RF12 — Segurança no pagamento

A página de pagamento deve apresentar indicação de pagamento seguro.

Exemplo visual: “Pagamento 100% seguro”.

RF13 — Área de cupons

A aplicação deve ter uma landing page principal chamada “Cupons”.

Nesta página, o utilizador deve ver:

Plano ativo.

Dias restantes.

Número de utilizadores/pessoas incluídas.

Percentual de desconto.

Lista de restaurantes onde pode gerar cupom.

Botão “Gerar cupom” para cada restaurante.

RF14 — Geração de cupom

Ao clicar em “Gerar cupom”, a aplicação deve criar um cupom para o restaurante escolhido.

O cupom deve conter:

Nome do restaurante.

Localização.

Percentual de desconto.

Código alfanumérico do cupom.

QR Code.

Tempo de validade.

Botão “Mostrar ao funcionário”.

RF15 — Validade do cupom

O cupom deve ter validade limitada.

Na imagem de referência, aparece a informação:

“Válido até 14:32 de hoje”.

Portanto, o sistema deve controlar prazo de validade do cupom gerado.

RF16 — Código manual

Além do QR Code, o cupom deve apresentar um código manual, exemplo:

GF-28491

Esse código deve permitir validação caso o QR Code não possa ser lido.

RF17 — Menu inferior fixo

A aplicação deve ter navegação inferior fixa com três páginas principais:

Início.

Cupons.

Perfil.

Essa navegação deve estar sempre acessível nas áreas principais da aplicação.

RF18 — Perfil

A página Perfil deve mostrar:

Nome do utilizador.

E-mail.

Estado do plano: ativo ou inativo.

Dias restantes.

Número de pessoas/utilizadores incluídos.

Percentual de desconto.

RF19 — Menu do perfil

A página Perfil deve conter os seguintes acessos:

Histórico de utilizações.

Métodos de pagamento.

As minhas informações.

Ajuda e suporte.

Termos e condições.

Terminar sessão.

RF20 — Histórico de utilizações

A aplicação deve permitir consultar o histórico de cupons.

O histórico deve conter abas:

Todos.

Utilizados.

Expirados.

Cada item deve apresentar:

Imagem ou logótipo do restaurante.

Nome do restaurante.

Localização.

Data de utilização ou expiração.

Percentual de desconto.

RF21 — Estados do cupom

O sistema deve distinguir cupons:

Gerados.

Utilizados.

Expirados.

Disponíveis.

Inválidos.

RF22 — Estado do plano

O sistema deve distinguir planos:

Ativo.

Inativo.

Expirado.

Cancelado.

Pendente de pagamento.

RF23 — Como funciona

A aplicação deve ter uma secção explicativa com o funcionamento do serviço.

Fluxo sugerido:

Descarregue a app e crie a sua conta.

Escolha o plano de dias e número de pessoas.

Faça o pagamento de forma segura.

Gere cupons e usufrua de 15% de desconto em qualquer restaurante do Grupo Ferreira.

Apresente o cupom ao funcionário para validar.

5. Requisitos não funcionais

RNF01 — Simplicidade

A aplicação deve ser simples, com poucos passos entre o login, escolha do restaurante, compra do plano e geração do cupom.

RNF02 — Performance

As páginas principais devem carregar rapidamente, especialmente:

Lista de restaurantes.

Área de cupons.

Cupom gerado com QR Code.

RNF03 — Segurança

A aplicação deve proteger:

Dados pessoais.

Dados de pagamento.

Histórico de utilização.

Códigos de cupom.

RNF04 — Pagamento seguro

O sistema deve usar provedores de pagamento seguros e compatíveis com cartão, MB WAY e Apple Pay.

RNF05 — Prevenção de fraude

O sistema deve evitar:

Uso duplicado do mesmo cupom.

Uso após expiração.

Uso por mais pessoas do que o permitido no plano.

Geração ilimitada de cupons fora das regras.

RNF06 — Disponibilidade

A aplicação deve estar disponível durante os horários de funcionamento dos restaurantes e preferencialmente 24/7.

RNF07 — Escalabilidade

A arquitetura deve permitir adicionar novos restaurantes, novos planos e novos métodos de pagamento no futuro.

RNF08 — Compatibilidade

A aplicação deve funcionar em iOS e Android.

A autenticação com Apple deve ser suportada especialmente em iOS.

RNF09 — Experiência premium

A interface deve transmitir sofisticação, gastronomia, confiança e exclusividade.

6. Especificação das páginas

6.1 Splash Screen

Objetivo

Apresentar a marca e iniciar a experiência do utilizador.

Elementos

Imagem de fundo de Lisboa.

Gradiente escuro na parte inferior.

Logótipo Grupo Ferreira.

Texto “City Pass Gastronómico”.

Frase de impacto.

Botão “Começar”.

Ações

Ao clicar em “Começar”, o utilizador é levado para login/registo.

6.2 Login / Registo

Objetivo

Permitir criação de conta e entrada na aplicação.

Elementos

Logótipo centralizado.

Título “Crie a sua conta”.

Campo Nome completo.

Campo E-mail.

Campo Palavra-passe.

Ícone para mostrar/ocultar palavra-passe.

Botão “Criar conta”.

Link “Já tem conta? Entrar”.

Separador “ou continue com”.

Botão Google.

Botão Apple.

Ações

Criar conta.

Entrar com conta existente.

Entrar com Google.

Entrar com Apple.

6.3 Início / Lista de restaurantes

Objetivo

Mostrar os restaurantes disponíveis no Grupo Ferreira.

Elementos

Cabeçalho verde escuro.

Texto de boas-vindas.

Ícone de notificações.

Cards de restaurantes.

Imagem do restaurante.

Nome.

Localização.

Botão “Ver restaurante”.

Botão “Gerar cupom”.

Menu inferior com Início, Cupons e Perfil.

Ações

Abrir detalhe do restaurante.

Gerar cupom.

Navegar para Cupons.

Navegar para Perfil.

6.4 Detalhe do restaurante

Objetivo

Apresentar informações completas do restaurante.

Elementos

Imagem grande no topo.

Botão de voltar.

Ícone de favorito.

Card inferior branco arredondado.

Nome do restaurante.

Localização.

Descrição.

Botão “Visitar website”.

Botão “Ver menu”.

Botão “Gerar cupom”.

Ações

Voltar.

Abrir website.

Abrir menu.

Gerar cupom.

Marcar restaurante como favorito, caso a funcionalidade seja implementada.

6.5 Escolha do plano

Objetivo

Permitir selecionar o plano de desconto.

Elementos

Título “Escolha o seu plano”.

Descrição: “15% de desconto em todos os restaurantes do Grupo Ferreira”.

Seleção de dias.

Seleção de número de pessoas.

Resumo do plano.

Total.

Botão “Continuar para pagamento”.

Planos disponíveis

1 dia.

3 dias.

5 dias.

10 dias.

15 dias.

Personalizado.

Ações

Selecionar dias.

Aumentar ou reduzir pessoas.

Ver resumo.

Avançar para pagamento.

6.6 Carrinho / Pagamento

Objetivo

Confirmar plano e pagar.

Elementos

Título “Carrinho”.

Card “Plano selecionado”.

Dias selecionados.

Número de pessoas.

Desconto por compra.

Total a pagar.

Métodos de pagamento.

Cartão de crédito.

MB WAY.

Apple Pay.

Texto de segurança.

Botão “Finalizar compra”.

Ações

Selecionar método de pagamento.

Finalizar compra.

Voltar para editar plano.

6.7 Área de Cupons

Objetivo

Mostrar o plano ativo e permitir geração de cupons.

Elementos

Título “Os seus benefícios”.

Card do plano ativo.

Dias restantes.

Número de utilizadores/pessoas.

Percentual de desconto.

Lista de restaurantes.

Imagem pequena do restaurante.

Nome.

Localização.

Botão “Gerar cupom”.

Menu inferior.

Ações

Gerar cupom para restaurante escolhido.

Consultar status do benefício.

Navegar para Início ou Perfil.

6.8 Cupom Gerado

Objetivo

Permitir apresentar o cupom ao funcionário.

Elementos

Título “Cupom gerado”.

Card central branco.

Nome do restaurante.

Localização.

Percentual de desconto.

Código do cupom.

QR Code.

Validade.

Botão “Mostrar ao funcionário”.

Regras

Cada cupom deve ser único.

O cupom deve ter validade limitada.

O cupom deve ser associado ao utilizador, plano e restaurante.

Após validação, o cupom deve entrar no histórico como utilizado.

6.9 Perfil

Objetivo

Permitir ao utilizador consultar dados pessoais, plano e configurações.

Elementos

Avatar.

Nome.

E-mail.

Card do plano ativo.

Dias restantes.

Número de utilizadores/pessoas.

Percentual de desconto.

Lista de opções.

Botão “Terminar sessão”.

Ações

Abrir histórico.

Gerir métodos de pagamento.

Editar informações pessoais.

Abrir ajuda e suporte.

Abrir termos e condições.

Terminar sessão.

6.10 Histórico de utilizações

Objetivo

Mostrar todos os cupons usados, expirados e histórico completo.

Elementos

Título “Histórico de utilizações”.

Abas:

Todos.

Utilizados.

Expirados.

Lista de restaurantes.

Imagem ou logótipo.

Nome.

Localização.

Data.

Percentual de desconto.

Ações

Filtrar por status.

Consultar detalhe de utilização.

7. Identidade visual

7.1 Estilo geral

A identidade visual deve transmitir:

Elegância.

Tradição.

Gastronomia premium.

Lisboa.

Confiança.

Exclusividade.

A interface deve combinar verde escuro, dourado, branco quente e tons neutros.

7.2 Paleta de cores sugerida

Verde principal

Uso: cabeçalhos, botões principais, fundos premium.

Código sugerido:

#003D32

Variação mais escura:

#002B24

Variação para gradientes:

#004C3F

Dourado principal

Uso: botões de destaque, logótipo, elementos premium, seleção ativa.

Código sugerido:

#C79A3B

Variação clara:

#D8B15A

Variação escura:

#A77C24

Branco quente

Uso: fundo de páginas, cards e áreas de conteúdo.

Código sugerido:

#FAF8F3

Branco card

Uso: cartões internos, formulários e modais.

Código sugerido:

#FFFFFF

Cinza texto secundário

Uso: subtítulos, localização, detalhes.

Código sugerido:

#6B6B6B

Cinza borda

Uso: inputs, cards, divisores.

Código sugerido:

#E5E0D8

Preto texto principal

Uso: títulos e textos principais.

Código sugerido:

#111111

Vermelho de saída/alerta

Uso: botão “Terminar sessão” ou mensagens críticas.

Código sugerido:

#B94A48

7.3 Tipografia

A aplicação deve usar uma tipografia limpa e moderna.

Sugestão:

Títulos: fonte com peso semibold ou bold.

Texto comum: fonte regular.

Botões: fonte semibold, caixa alta em ações principais.

Estilo sugerido:

Títulos grandes: 22–28 px.

Títulos de página: 18–22 px.

Texto normal: 14–16 px.

Texto secundário: 12–14 px.

Botões: 13–15 px.

7.4 Botões

Botão principal verde

Uso:

Criar conta.

Gerar cupom.

Finalizar compra.

Código:

Fundo #003D32

Texto #FFFFFF

Raio: 10–14 px.

Altura: 48–56 px.

Botão principal dourado

Uso:

Começar.

Continuar para pagamento.

Mostrar ao funcionário.

Código:

Fundo #C79A3B

Texto #FFFFFF

Raio: 10–14 px.

Botão secundário

Uso:

Ver restaurante.

Visitar website.

Ver menu.

Código:

Fundo #FFFFFF

Borda #E5E0D8

Texto #111111

7.5 Cards

Os cards devem ter:

Fundo branco.

Bordas suaves.

Cantos arredondados.

Sombra leve.

Espaçamento interno confortável.

Raio sugerido:

16–24 px.

7.6 Ícones

Os ícones devem seguir estilo linear, simples e elegante.

Ícones necessários:

Utilizador.

E-mail.

Cadeado.

Olho para mostrar palavra-passe.

Localização.

Sino de notificações.

Website.

Menu.

Calendário.

Cartão.

QR Code.

Histórico.

Pagamento.

Ajuda.

Termos.

Perfil.

Início.

Cupom.

8. Regras de negócio

RN01 — Desconto padrão

O desconto padrão mostrado na aplicação é de 15% por compra.

RN02 — Aplicação do desconto

O desconto deve ser válido em restaurantes do Grupo Ferreira incluídos no plano.

RN03 — Plano ativo necessário

O utilizador só pode gerar cupom se tiver um plano ativo.

RN04 — Número de pessoas

O plano deve guardar a quantidade de pessoas permitidas.

Exemplo:

Plano ativo para 3 pessoas.

O cupom deve informar ou permitir validar esse limite.

RN05 — Dias restantes

A aplicação deve calcular automaticamente os dias restantes do plano.

RN06 — Expiração do plano

Quando o plano chegar ao fim, o estado deve mudar para inativo ou expirado.

RN07 — Cupom único

Cada cupom gerado deve possuir código único e QR Code único.

RN08 — Validação no restaurante

O funcionário deve conseguir validar o cupom por QR Code ou código manual.

RN09 — Histórico automático

Após uso ou expiração, o cupom deve aparecer no histórico correspondente.

9. Requisitos para backoffice/admin

Embora não apareça na imagem, a aplicação precisa de uma área administrativa para gerir o sistema.

Funcionalidades administrativas necessárias

Criar restaurante.

Editar restaurante.

Remover ou desativar restaurante.

Adicionar fotos.

Adicionar localização.

Adicionar website.

Adicionar link do menu.

Gerir planos disponíveis.

Gerir preços por dias e pessoas.

Consultar utilizadores.

Consultar planos ativos.

Consultar cupons gerados.

Consultar cupons utilizados.

Validar cupom manualmente.

Ver relatórios básicos de utilização.

10. Dados principais do sistema

Utilizador

ID.

Nome.

E-mail.

Senha criptografada ou login social.

Método de autenticação.

Data de criação.

Status da conta.

Restaurante

ID.

Nome.

Localização.

Descrição.

Fotos.

Website.

Menu.

Status ativo/inativo.

Plano

ID.

Utilizador.

Quantidade de dias.

Número de pessoas.

Percentual de desconto.

Data de início.

Data de fim.

Status.

Valor pago.

Cupom

ID.

Código.

QR Code.

Utilizador.

Restaurante.

Plano associado.

Status.

Data de geração.

Data de expiração.

Data de utilização.

Percentual de desconto.

Número de pessoas permitido.

Pagamento

ID.

Utilizador.

Plano.

Método de pagamento.

Valor.

Status.

Data.

Referência da transação.

11. Fluxo principal do utilizador

1. O utilizador abre a app.
2. Vê a Splash Screen.
3. Cria conta ou entra com Google/Apple.
4. Acede à página Início.
5. Consulta restaurantes.
6. Abre detalhe de restaurante.
7. Clica em “Gerar cupom”.
8. Caso não tenha plano ativo, escolhe plano.
9. Seleciona dias e número de pessoas.
10. Vai para pagamento.
11. Finaliza compra.
12. Plano fica ativo.
13. Acede à página Cupons.
14. Gera cupom para um restaurante.
15. Apresenta QR Code ao funcionário.
16. Cupom é validado.
17. Utilização aparece no histórico.

12. Critérios de aceitação principais

A aplicação só deve ser considerada pronta quando:

O utilizador conseguir criar conta com e-mail.

O utilizador conseguir entrar com Google e Apple.

A lista de restaurantes carregar corretamente.

Cada restaurante tiver página de detalhe.

O utilizador conseguir escolher plano.

O utilizador conseguir selecionar dias e número de pessoas.

O pagamento estiver integrado.

Após pagamento, o plano aparecer como ativo.

A página Cupons mostrar dias restantes e desconto.

O sistema gerar QR Code e código manual.

O cupom puder ser validado.

O histórico mostrar cupons utilizados e expirados.

O perfil mostrar dados do utilizador e status do plano.

A navegação inferior funcionar em todas as páginas principais.

A identidade visual seguir verde escuro, dourado e branco quente.