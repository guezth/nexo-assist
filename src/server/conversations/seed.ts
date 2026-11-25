import type { Client } from "@libsql/client";
import { ConversationRepository } from "./repository";

const META_KEY = "demo_conversations";

/**
 * Demo conversations for the console, created once per database (like the seed
 * tickets, they stand in for a week of activity). Times are relative to "now".
 * Employee ids and ticket codes match src/data/seed.
 */
export async function seedDemoConversations(db: Client, now: Date = new Date()): Promise<boolean> {
  const done = await db.execute({ sql: "SELECT value FROM app_meta WHERE key = ?", args: [META_KEY] });
  if (done.rows.length > 0) return false;

  /** A repository whose clock says it is `minutes` before now. */
  const at = (minutes: number) => new ConversationRepository(db, () => new Date(now.getTime() - minutes * 60_000));
  const bubble = (text: string) => ({ role: "agent" as const, steps: [], blocks: [{ kind: "bubble" as const, text }] });
  const agentSays = (steps: string[], text: string) => ({
    role: "agent" as const,
    steps: steps.map((label) => ({ label })),
    blocks: [{ kind: "bubble" as const, text }],
  });

  async function conversation(employeeId: number, openedMinutesAgo: number) {
    // A conversation the person already had (e.g. from trying the chat) must not mix with the demo one.
    await db.execute({ sql: "UPDATE conversations SET mode = 'closed' WHERE employee_id = ? AND mode != 'closed'", args: [employeeId] });
    return (await at(openedMinutesAgo).getOrCreateActive(employeeId)).id;
  }

  // Ana: asked for an analyst about an overdue ticket, and keeps writing while she waits.
  {
    const id = await conversation(1, 13);
    await at(12).addUserMessage(id, "Qual o status do meu chamado?");
    await at(12).addAgentMessage(id, agentSays(["consultou seus chamados"], "Você tem 3 chamados abertos. Sobre qual deles quer saber?"));
    await at(11).addUserMessage(id, "INC-20311 · Notebook lento após atualização do Windows");
    await at(11).addAgentMessage(
      id,
      agentSays(["consultou o INC-20311", "calculou o prazo"], "Está sem atualização há 6 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?"),
    );
    await at(9).addUserMessage(id, "Quero falar com um analista.");
    await at(8).addAgentMessage(id, bubble("Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis."));
    await at(8).handOff(id, {
      reason: "overdue",
      ticketCode: "INC-20311",
      respondBy: new Date(now.getTime() + 112 * 60_000).toISOString(),
      summary: "Notebook lento desde a atualização do Windows. Chamado INC-20311 sem atualização há 6 dias; a pessoa pediu para falar com um analista.",
    });
    await at(5).addUserMessage(id, "Ok, obrigada.");
    await at(4).addUserMessage(id, "Estou no notebook agora, se precisar de acesso remoto.");
  }

  // Carla: needs something urgent that the agent cannot grant.
  {
    const id = await conversation(2, 20);
    await at(19).addUserMessage(id, "Oi, preciso de acesso ao SAP.");
    await at(19).addAgentMessage(id, agentSays(["buscou na central de ajuda"], "Acesso ao SAP precisa de aprovação do gestor. Qual é a urgência?"));
    await at(15).addUserMessage(id, "Preciso de acesso ao SAP ainda hoje");
    await at(15).handOff(id, {
      reason: "critical",
      respondBy: new Date(now.getTime() + 25 * 60_000).toISOString(),
      summary: "Pedido urgente de acesso ao SAP para a Controladoria; depende de aprovação do gestor.",
    });
  }

  // Bruno: the agent was not sure what to do and asked for help.
  {
    const id = await conversation(3, 30);
    await at(29).addUserMessage(id, "A VPN conecta e cai depois de alguns minutos, em qualquer rede.");
    await at(28).addAgentMessage(
      id,
      agentSays(["buscou na central de ajuda"], "O artigo do erro 809 não parece se aplicar ao seu caso. Vou chamar um analista para isso."),
    );
    await at(28).handOff(id, {
      reason: "low_confidence",
      confidence: 0.41,
      ticketCode: "INC-20402",
      summary: "VPN conecta e cai depois de poucos minutos em qualquer rede. O artigo KB-001 (erro 809) não se aplica; o agent não teve segurança sobre a causa.",
    });
  }

  // Diego and Elisa: the agent is handling them.
  {
    const id = await conversation(4, 6);
    await at(5).addUserMessage(id, "Meu acesso ao servidor de produção continua bloqueado.");
    await at(1).addAgentMessage(id, agentSays(["consultou o INC-20516"], "Seu chamado INC-20516 é crítico e está em atendimento. Vou acompanhar por aqui."));
  }
  {
    const id = await conversation(5, 15);
    await at(14).addUserMessage(id, "A impressora do 3º andar não imprime em cores.");
    await at(12).addAgentMessage(id, agentSays(["criou o chamado"], "Chamado INC-20519 criado."));
  }

  // Resolved by the agent.
  {
    const id = await conversation(6, 20);
    await at(19).addUserMessage(id, "Como configuro o e-mail no celular?");
    await at(18).addAgentMessage(id, agentSays(["buscou na central de ajuda"], "Siga o artigo KB-005: adicione uma conta Exchange com o seu e-mail corporativo."));
    await at(14).addUserMessage(id, "Isso resolveu, obrigado!");
    await at(14).closeByAgent(id);
  }
  {
    const id = await conversation(7, 26 * 60 + 10);
    await at(26 * 60).addUserMessage(id, "Qual é a senha do Wi-Fi de visitantes?");
    await at(26 * 60 - 1).addAgentMessage(id, agentSays(["buscou na central de ajuda"], "A senha do Wi-Fi foi enviada para o seu e-mail corporativo."));
    await at(26 * 60 - 2).closeByAgent(id);
  }

  await db.execute({ sql: "INSERT INTO app_meta (key, value) VALUES (?, ?)", args: [META_KEY, now.toISOString()] });
  return true;
}
