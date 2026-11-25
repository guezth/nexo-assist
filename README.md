# Nexo Assist

Agent de atendimento para o service desk de TI da Nexo, feito para o desafio técnico da Beyond the Bytes.

O funcionário conversa com o agent para tirar dúvidas, abrir, atualizar ou reabrir chamados e consultar o andamento deles. O agent decide a ação a cada mensagem, pede confirmação antes de mexer em qualquer chamado e transfere para um analista quando precisa. O analista atende pelo console: assume a conversa (o agent pausa), responde, devolve ao agent ou encerra. Em cada resposta dá para abrir um painel e ver o que o agent entendeu, o que fez, com que segurança e por quê.

## Sumário

1. [Como rodar](#como-rodar)
2. [Visão geral da arquitetura](#visão-geral-da-arquitetura)
3. [Como o agent decide o que fazer](#como-o-agent-decide-o-que-fazer)
4. [Como garanti a qualidade das decisões](#como-garanti-a-qualidade-das-decisões)
5. [Decisões e trade-offs](#decisões-e-trade-offs)
6. [O que faria com mais tempo](#o-que-faria-com-mais-tempo)
7. [Uso de IA](#uso-de-ia)
8. [Deploy com Docker e Portainer](#deploy-com-docker-e-portainer)

## Como rodar

Requisitos: **Node 22.13 ou superior** (o Mastra 1.x exige; há um `.nvmrc`) e acesso ao servidor Ollama.

```bash
npm install
cp .env.example .env     # no Windows: copy .env.example .env
npm run dev              # http://localhost:3000
```

O `.env.example` já traz o endereço do Ollama, os dois modelos e as demais variáveis. Em desenvolvimento nada mais precisa ser preenchido (o `SESSION_SECRET` tem um valor provisório, que **não** é aceito em produção).

### Usuários de exemplo

A senha de todos é `nexo123`.

| Papel | E-mail | Observação |
| --- | --- | --- |
| Funcionária | `ana.souza@nexo.com.br` | Windows 11. Tem chamado vencido (INC-20311) e um resolvido há dias |
| Funcionária | `carla.mendes@nexo.com.br` | Tem chamado resolvido há 4 dias (dá para reabrir) |
| Funcionário | `bruno.tavares@nexo.com.br` | Windows 10; chamado de VPN aberto (serve para testar privacidade) e conversa na fila |
| Funcionário | `fabio.nunes@nexo.com.br` | Chamado resolvido há 8 dias (não dá para reabrir) |
| Outros | `diego.ramos@`, `elisa.prado@`, `gabriela.rocha@` `nexo.com.br` | |
| Analista | `rafael.lima@nexo.com.br` | Suporte N2, entra no console |
| Analista | `juliana.costa@nexo.com.br` | Suporte N1 |

Ao abrir o banco pela primeira vez, o sistema cria 7 conversas de exemplo no console (3 na fila, 2 com o agent e 2 resolvidas). Ana, Carla e Bruno já começam transferidos para um analista, então o agent fica mudo para eles até alguém devolver ou encerrar a conversa. Para usar um deles com o agent, entre como Rafael, abra a conversa e clique em **Devolver ao agent** (ou **Encerrar atendimento**, que abre uma sessão nova). Fábio, Gabriela, Diego e Elisa já podem conversar com o agent.

### Roteiro para testar

Os passos 2, 4, 5 e 6 supõem a Ana (ou a Carla) já devolvida ao agent, como explicado acima.

1. **Dúvida resolvida pela central de ajuda:** como Fábio, "esqueci minha senha da rede". O agent responde com o artigo KB-003.
2. **Artigo que não se aplica:** como Ana (Windows 11) numa conversa nova, "minha VPN dá erro 809". O artigo KB-001 só vale para Windows 10: o agent explica e segue para abrir um chamado, com perguntas curtas e botões.
3. **Rascunho e confirmação:** responda às perguntas e confira o cartão do rascunho. Só ao clicar em **Confirmar** o chamado nasce.
4. **Duplicidade:** peça para abrir um chamado de "notebook lento depois da atualização do Windows". Existe o INC-20311 aberto: o agent pergunta se é o mesmo problema.
5. **Reabertura:** como Carla, peça para reabrir o INC-20150 (resolvido há 4 dias). Como Fábio, o INC-20255 (há 8 dias) é recusado.
6. **Privacidade:** como Ana, pergunte pelo INC-20402 (é do Bruno): a resposta é a mesma de um chamado que não existe.
7. **Fora de TI:** "quantos dias de férias eu tenho?" é redirecionado.
8. **Transferência:** "quero falar com um analista". Abra o console em outra janela (Rafael), assuma, responda e veja a resposta aparecer para o funcionário. Depois devolva ao agent ou encerre.
9. **Transparência:** em qualquer resposta do agent, clique em **detalhes**.
10. **Queda do sistema de chamados:** o sistema legado simulado falha em 10% das chamadas. Com `TICKET_SERVICE_FAILURE_RATE=1` no `.env`, dá para ver as novas tentativas e o aviso.

### Comandos

```bash
npm test           # testes (vitest)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # build de produção
```

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Servidor Ollama (sem chave, autorização por IP) |
| `OLLAMA_MODEL_MAIN` | `kimi-k2.6:cloud` | Modelo principal (raciocínio e ferramentas) |
| `OLLAMA_MODEL_FAST` | `gemma4:31b-cloud` | Modelo leve (roteamento e respostas simples) |
| `SESSION_SECRET` | provisório em dev | Assina o cookie de sessão. **Obrigatório em produção**, 32+ caracteres |
| `SESSION_COOKIE_SECURE` | `true` em produção | Use `false` se publicar em HTTP puro |
| `DATABASE_URL` | `file:./data/nexo.db` | Arquivo SQLite das conversas |
| `SEED_DEMO_CONVERSATIONS` | `true` | Cria as conversas de exemplo do console no banco vazio |
| `TICKET_SERVICE_FAILURE_RATE` | `0.1` | Chance de cada chamada derrubar o sistema de chamados simulado |
| `TICKET_SERVICE_OUTAGE_MS` | `3000` | Quanto tempo ele fica fora |
| `TICKET_SERVICE_LATENCY_MIN_MS` / `_MAX_MS` | `80` / `400` | Latência simulada |

## Visão geral da arquitetura

```
Navegador ──► Next.js (App Router)
               ├─ /chat, /perfil           telas do funcionário
               ├─ /chat/stream (POST)      um turno do agent, em streaming (uma linha JSON por evento)
               ├─ /console                 console do analista (atualiza a cada 5 s)
               └─ proxy.ts                 redireciona por papel (a sessão é checada de novo nas páginas e nas ações)

src/domain     regras puras, sem I/O: SLA, prioridade, duplicidade, reabertura, transferência,
               montagem da resposta (TurnAssembler) e os tipos que a tela desenha
src/server
  agent/       Mastra: modelos, instruções, ferramentas, confirmação de rascunhos, orquestração do turno
  services/    sistema de chamados simulado (com instabilidade) e central de ajuda (busca por palavras)
  conversations/  repositório SQLite das conversas (employee, agent e analista)
  auth/        sessão assinada (HMAC), senha (scrypt), bloqueio por tentativas
  console/     monta o que o console desenha
src/data/seed  funcionários, 9 artigos e 11 chamados em situações variadas
```

Pontos centrais:

- **Separação de responsabilidades.** A tela só desenha *view models* já formatados (`src/domain/chat.ts`). O agent os produz. O sistema de chamados é uma interface (`TicketService`) com uma implementação simulada, então trocar pelo real não toca no agent.
- **O agent fica dentro de um turno controlado** (`handle-turn.ts`). O turno é quem aplica o limite de mensagens, decide se o agent pode falar, executa confirmações e realiza transferências. O modelo não tem como pular essas regras.
- **Persistência.** SQLite (`@libsql/client`), com migrações por `PRAGMA user_version`. Guarda as mensagens já no formato que a tela desenha, o modo da conversa (agent, analista ou encerrada), quem assumiu, o motivo e o resumo da transferência.
- **Analistas online.** O console avisa o servidor a cada 15 s que está aberto; quem passou de 40 s sem avisar (ou saiu pelo botão Sair) deixa de contar. A tela de login mostra esse número real e o atualiza sozinha.
- **Tempo real.** O funcionário recebe o turno do agent em streaming; enquanto espera um analista, a tela consulta a conversa a cada 4 s. O console se atualiza a cada 5 s. Não usei WebSocket para manter o deploy simples.

## Como o agent decide o que fazer

Cada mensagem do funcionário passa por este caminho:

1. **Limite e voz.** O servidor conta a mensagem (máximo de 30 por sessão, em uma única instrução SQL, então requisições simultâneas não passam do limite). Se a conversa está com um analista, o agent **não responde**: a mensagem fica para o analista.
2. **Cliques da tela.** Confirmar ou cancelar um rascunho é executado **por código**, sem modelo. Escolher uma opção ou um chamado da lista vira uma mensagem normal.
3. **Roteador (modelo leve, gemma4).** Em menos de 1 s, decide se a mensagem é de TI, social (cumprimento, agradecimento) ou fora do escopo (RH, financeiro, facilities). Nos dois últimos casos, o próprio modelo leve responde. Só se ele tiver confiança de 75% ou mais; qualquer dúvida ou falha segue para o modelo principal.
4. **Agent principal (kimi-k2.6, via Mastra).** Recebe as últimas 24 mensagens (incluindo o que a tela mostrou: botões, cartões, rascunhos) e as instruções do service desk. O **primeiro passo é obrigatório**: registrar o que entendeu, o que vai fazer, a confiança e o porquê (`record_decision`). Depois usa as ferramentas que precisar, até 8 passos:

| Ferramenta | O que faz |
| --- | --- |
| `search_help_center` | Busca artigos (cada um diz para quais sistemas vale) |
| `list_my_tickets`, `get_ticket` | Consulta chamados **da própria pessoa** e mostra cartões; informa se estão vencidos |
| `classify_priority` | Explica a prioridade e o prazo |
| `propose_new_ticket` | Monta o **rascunho** de um chamado novo, depois de checar duplicidade |
| `propose_ticket_update` | Rascunho de informação nova num chamado aberto |
| `propose_ticket_reopen` | Rascunho de reabertura (resolvido há até 7 dias) |
| `ask_options` | Pergunta com botões de resposta rápida |
| `handoff_to_analyst` | Transfere para o suporte N2 com resumo |

5. **Fim do turno.** O texto e os cartões viram uma mensagem, gravada com os passos e a decisão. Se houve transferência, ela é feita **depois** de gravar a resposta, para a linha do tempo sair na ordem certa.

### Quando o agent transfere

A pedido da pessoa, em caso crítico, em chamado vencido (se a pessoa aceitar) e quando não tem segurança (confiança abaixo de 60%). O resumo vai junto e o prazo de retorno é calculado pelo código: 1 hora corrida para crítico, 2 horas úteis nos demais. Um chamado **crítico** é transferido pelo próprio código assim que é criado, sem depender do modelo.

### Transparência

Acima de cada resposta ficam os passos ("consultou seus chamados", "classificou a prioridade"). O botão **detalhes** (no chat e, para o analista, no console) abre um painel lateral com: o que o agent entendeu, o que fez, a confiança (barra e nível), o porquê, **quem decidiu** (modelo principal, modelo leve ou regra do sistema, com o id do modelo) e cada consulta com seu detalhe (artigos encontrados e relevância, chamados vistos, prazo, tentativas contra o sistema instável). O formato é nosso: o protótipo não traz esse painel.

## Como garanti a qualidade das decisões

A ideia central: **o modelo propõe, o código dispõe**. O que não pode errar não foi deixado para o prompt.

| Regra do service desk | Como é garantida |
| --- | --- |
| Confirmar antes de agir | As ferramentas só montam rascunhos. Criar, atualizar ou reabrir é feito pelo código ao clicar em Confirmar, com os dados guardados na mensagem (nunca os que vêm da tela) |
| Privacidade | O id do funcionário vem da sessão assinada e as ferramentas são criadas em volta dele: não existe parâmetro de usuário. Chamado de outra pessoa responde "não encontrado", igual a um que não existe |
| Prioridade (impacto x urgência) | O agent só descreve os fatos (quem é afetado, trabalho parado, compromisso hoje); `classifyPriority` decide, seguindo a tabela do Anexo A |
| Prazos e "vencido" | `src/domain/sla.ts`: 1 h corrida, 4 h úteis, 3 e 5 dias úteis; horário útil seg-sex 8h-18h (UTC-3, sem feriados); o relógio conta da última atualização |
| Sem duplicidade | Antes de qualquer rascunho novo o código procura chamado aberto parecido (mesma categoria, 2 ou mais palavras em comum). O agent só pode ignorar o aviso se a pessoa já o tiver visto e respondido |
| Reabrir só até 7 dias | Regra de domínio, aplicada na ferramenta e no serviço |
| Agent mudo com o analista | `handle-turn.ts` nem chama o modelo |
| Limite de 30 mensagens | Contagem atômica no banco |
| Sistema de chamados instável | 4 tentativas com espera crescente, cada uma visível como passo; se falhar, o rascunho continua aberto |
| Falha do modelo | Mensagem clara, conversa continua, tempo máximo de 90 s |

**Testes (99, `npm test`).** Os que mais importam não dependem de modelo: injeto um agent falso e verifico as regras em volta dele.

- Privacidade (consulta, listagem, atualização e reabertura de chamado alheio).
- Confirmação (nada é criado sem clique; confirmar duas vezes não duplica; cancelar não toca no sistema).
- Crítico vai direto ao analista; sistema fora do ar mantém o rascunho; agent mudo; limite de 30, inclusive com requisições simultâneas.
- Duplicidade e reabertura. SLA, prioridade, sessão e autenticação. Repositório de conversas, console e persistência após reabrir o arquivo.

**Verificação com o modelo real.** Além dos testes, percorri os casos do roteiro acima no navegador, com o kimi e o gemma de verdade. Isso revelou problemas que os testes não pegariam, e cada um virou correção: o modelo repetia o texto depois dos botões, copiava as notas internas do histórico para as respostas e perguntava de novo quando a pessoa já tinha pedido um analista.

## Decisões e trade-offs

- **Dois modelos.** O modelo leve (gemma) decide em menos de 1 s se vale acionar o principal: assuntos fora de TI e cumprimentos não gastam o modelo caro nem esperam 15 segundos. O kimi, mais lento e mais capaz, fica com o raciocínio e as ferramentas. Em troca, o roteador pode errar; por isso só age com confiança alta e, na dúvida, passa adiante.
- **Mastra 1.x com o AI SDK v6.** O modelo é acessado pelo endpoint compatível com OpenAI do Ollama (`@ai-sdk/openai-compatible`). As ferramentas são tipadas com zod 4 e criadas por turno, em volta do contexto do funcionário.
- **SQLite via `@libsql/client`.** O `better-sqlite3` precisa compilar código nativo; o libsql traz binário pronto e é o que o Mastra usa. Arquivo único, simples de colocar num volume.
- **Busca por palavras na central de ajuda.** Explicável (a relevância aparece no painel) e sem dependência externa. Não entende sinônimos; uma busca semântica entraria no lugar sem mudar quem a chama (`KnowledgeBase`).
- **Atualização por consulta (polling) em vez de WebSocket.** 4 s no funcionário e 5 s no console. Simples e suficiente para a demonstração; custa algumas requisições a mais.
- **A confiança vem do próprio modelo.** É um indício, não uma medida calibrada. Por isso as regras importantes (crítico, duplicidade, confirmação) não dependem dela.
- **Dados do sistema de chamados em memória.** O sistema "legado" é simulado e volta ao estado inicial ao reiniciar; só as conversas persistem. Mantém a demonstração repetível.
- **Sem recarregar o histórico inteiro.** O agent lembra das últimas 24 mensagens, o que limita custo e latência, mas conversas muito longas perdem o começo.

Pontos conhecidos:

- Uma resposta com ferramentas leva de 15 a 20 segundos com o kimi. Os passos aparecem ao vivo, mas é o ponto mais lento.
- A mensagem enviada conta no limite de 30 mesmo quando o modelo falha.
- O link de "Redefinir senha" no perfil é simulado (não há serviço de e-mail), e "Alterada há N dias" vem dos dados de exemplo.
- O protótipo foi seguido por medidas (a comparação foi feita pelas dimensões e espaçamentos dos quadros, não lado a lado); o ícone da marca ficou inteiro, onde o protótipo recorta um pouco.

## O que faria com mais tempo

- **Latência do agent:** menos idas e voltas ao modelo (ferramentas que já devolvam o contexto), cache de consultas dentro do turno e teste de modelos mais rápidos para o passo de decisão.
- **Avaliação contínua:** um conjunto fixo de conversas (as do roteiro) rodado contra o modelo real a cada mudança de prompt, com a nota por regra, para detectar regressões.
- **Busca semântica** na central de ajuda, com a relevância no painel.
- **Tempo real de verdade** (SSE ou WebSocket) e indicador de "digitando".
- **Chamados persistentes** num serviço separado e feriados no cálculo de prazo.
- **Métricas do agent** (tempo de resposta, taxa de transferência, uso por modelo) — items que ainda não têm métricas detalhadas.
- **Acessibilidade e responsivo** do console, hoje pensado para desktop.

## Uso de IA

O projeto foi desenvolvido com o Claude Code, em passos pequenos acompanhados e testados pelo autor, que fez os commits. A IA escreveu a maior parte do código e dos testes sob direção do autor, que definiu a stack, os modelos, as regras e a ordem do trabalho, e revisou o resultado. Alguns exemplos do que mudou por causa dessa revisão: ids numéricos com código de exibição separado, regra de "há 6 dias" nos dados de exemplo, a decisão de executar confirmações por código, e a verificação de cada tela contra o protótipo.

No produto, a IA aparece de dois modos: os modelos do Ollama (gemma4 e kimi-k2.6) que conversam com o funcionário, e o Mastra, que orquestra as ferramentas.

## Deploy com Docker e Portainer

O repositório traz um `Dockerfile` (3 estágios, Node 22, usuário sem privilégios, healthcheck) e um `docker-compose.yml`.

### Com docker compose

```bash
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export OLLAMA_BASE_URL=http://SEU_SERVIDOR:11434
docker compose up -d --build        # http://localhost:3000
```

As conversas ficam no volume `nexo-data` e sobrevivem a novos deploys. Se publicar atrás de HTTPS, defina também `SESSION_COOKIE_SECURE=true`.

### Com Portainer

1. **Stacks > Add stack > Repository**, apontando para este repositório (arquivo `docker-compose.yml`).
2. Em **Environment variables**, preencha `SESSION_SECRET` (32+ caracteres) e `OLLAMA_BASE_URL`. As demais têm padrão.
3. Faça o deploy e acesse a porta publicada (`PORT`, padrão 3000).

O Ollama autoriza por IP: o IP do servidor onde o Portainer roda precisa estar liberado.

Para limitar o uso em um deploy público, mantenha as contas de exemplo (o limite de 30 mensagens por sessão já controla o custo) e considere um proxy reverso com limite de requisições.
