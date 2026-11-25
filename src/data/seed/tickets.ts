import type { Ticket } from "@/domain/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Seed tickets are expressed relative to `now`, so the "overdue",
 * "recently resolved" and "too old to reopen" situations stay true no matter
 * when the app is started.
 */
export function buildTickets(now: Date): Ticket[] {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  return [
    // ---- Ana Souza (the main demo user): 3 open, 2 closed ----
    {
      id: 1,
      code: "INC-20311",
      type: "INC",
      title: "Notebook lento após atualização do Windows",
      description:
        "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
      category: "Hardware",
      subcategory: "Notebook",
      priority: "medium",
      status: "waiting_analyst",
      affected: "self",
      requesterId: 1,
      createdAt: ago(6 * DAY),
      updatedAt: ago(6 * DAY), // Annex B: "há 6 dias". Always past the 3 business day deadline, whatever the weekday.
      history: [{ at: ago(6 * DAY), author: "Ana Souza", text: "Chamado aberto." }],
    },
    {
      id: 2,
      code: "INC-20298",
      type: "INC",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "Não consigo abrir a pasta Financeiro > Fechamento no SharePoint. Aparece 'acesso negado'.",
      category: "Acesso",
      priority: "medium",
      status: "in_progress",
      affected: "self",
      requesterId: 1,
      createdAt: ago(7 * DAY),
      updatedAt: ago(1 * DAY), // within the deadline
      history: [
        { at: ago(7 * DAY), author: "Ana Souza", text: "Chamado aberto." },
        { at: ago(1 * DAY), author: "Rafael Lima", text: "Aguardando aprovação do gestor da pasta." },
      ],
    },
    {
      id: 3,
      code: "REQ-10442",
      type: "REQ",
      title: "Segundo monitor para home office",
      description: "Solicito um segundo monitor para uso no home office.",
      category: "Hardware",
      priority: "low",
      status: "approved",
      affected: "self",
      requesterId: 1,
      createdAt: ago(12 * DAY),
      updatedAt: ago(7 * DAY), // Annex B: "há 1 semana"
      history: [
        { at: ago(12 * DAY), author: "Ana Souza", text: "Requisição aberta." },
        { at: ago(7 * DAY), author: "Juliana Costa", text: "Aprovado pelo gestor. Aguardando envio do equipamento." },
      ],
    },
    {
      id: 4,
      code: "INC-19877",
      type: "INC",
      title: "Outlook não sincroniza no celular",
      description: "O e-mail corporativo parou de sincronizar no app do celular.",
      category: "E-mail",
      priority: "medium",
      status: "resolved",
      affected: "self",
      requesterId: 1,
      createdAt: ago(54 * DAY),
      updatedAt: ago(52 * DAY),
      resolvedAt: ago(52 * DAY), // too old to reopen
      history: [
        { at: ago(54 * DAY), author: "Ana Souza", text: "Chamado aberto." },
        { at: ago(52 * DAY), author: "Juliana Costa", text: "Conta reconfigurada no aparelho. Resolvido." },
      ],
    },
    {
      id: 5,
      code: "INC-19410",
      type: "INC",
      title: "Troca de senha da rede",
      description: "Preciso trocar a senha da rede, que expirou.",
      category: "Acesso",
      priority: "low",
      status: "resolved",
      affected: "self",
      requesterId: 1,
      createdAt: ago(137 * DAY),
      updatedAt: ago(137 * DAY),
      resolvedAt: ago(137 * DAY),
      history: [
        { at: ago(137 * DAY), author: "Ana Souza", text: "Chamado aberto." },
        { at: ago(137 * DAY), author: "Juliana Costa", text: "Senha redefinida. Resolvido." },
      ],
    },

    // ---- Other employees: privacy and edge cases ----
    {
      // Resolved 4 days ago: can be reopened (limit is 7 days).
      id: 6,
      code: "INC-20150",
      type: "INC",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP foi bloqueada após tentativas erradas.",
      category: "Acesso",
      priority: "medium",
      status: "resolved",
      affected: "self",
      requesterId: 2,
      createdAt: ago(5 * DAY),
      updatedAt: ago(4 * DAY),
      resolvedAt: ago(4 * DAY),
      history: [
        { at: ago(5 * DAY), author: "Carla Mendes", text: "Chamado aberto." },
        { at: ago(4 * DAY), author: "Juliana Costa", text: "Senha desbloqueada. Resolvido." },
      ],
    },
    {
      // Open VPN ticket from ANOTHER employee: must never leak to Ana, nor be
      // used to deduplicate Ana's own VPN problem. Also overdue (high = 4 business hours).
      id: 7,
      code: "INC-20402",
      type: "INC",
      title: "VPN não conecta em casa",
      description: "A VPN não conecta quando estou em casa. Erro de timeout.",
      category: "Rede e VPN",
      priority: "high",
      status: "in_progress",
      affected: "self",
      requesterId: 3,
      createdAt: ago(2 * DAY),
      updatedAt: ago(1 * DAY),
      history: [
        { at: ago(2 * DAY), author: "Bruno Tavares", text: "Chamado aberto." },
        { at: ago(1 * DAY), author: "Rafael Lima", text: "Em análise do firewall." },
      ],
    },
    {
      // Critical and fresh: still inside its 1 hour deadline.
      id: 8,
      code: "INC-20516",
      type: "INC",
      title: "Servidor de homologação inacessível",
      description: "O ambiente de homologação está fora do ar para toda a equipe de engenharia.",
      category: "Outros",
      priority: "critical",
      status: "in_progress",
      affected: "team",
      requesterId: 4,
      createdAt: ago(40 * MINUTE),
      updatedAt: ago(15 * MINUTE),
      history: [
        { at: ago(40 * MINUTE), author: "Diego Ramos", text: "Chamado aberto." },
        { at: ago(15 * MINUTE), author: "Rafael Lima", text: "Analisando o servidor." },
      ],
    },
    {
      id: 9,
      code: "INC-20519",
      type: "INC",
      title: "Impressora do 3º andar não imprime",
      description: "A impressora do 3º andar mostra a fila parada e não imprime.",
      category: "Hardware",
      priority: "medium",
      status: "open",
      affected: "team",
      requesterId: 5,
      createdAt: ago(8 * MINUTE),
      updatedAt: ago(8 * MINUTE),
      history: [{ at: ago(8 * MINUTE), author: "Elisa Prado", text: "Chamado aberto." }],
    },
    {
      // Resolved 8 days ago: just past the 7-day reopen window.
      id: 10,
      code: "INC-20255",
      type: "INC",
      title: "Teclado do notebook com teclas falhando",
      description: "Algumas teclas do teclado do notebook não respondem.",
      category: "Hardware",
      priority: "medium",
      status: "resolved",
      affected: "self",
      requesterId: 6,
      createdAt: ago(12 * DAY),
      updatedAt: ago(8 * DAY),
      resolvedAt: ago(8 * DAY),
      history: [
        { at: ago(12 * DAY), author: "Fábio Nunes", text: "Chamado aberto." },
        { at: ago(8 * DAY), author: "Juliana Costa", text: "Teclado substituído. Resolvido." },
      ],
    },
    {
      id: 11,
      code: "REQ-10480",
      type: "REQ",
      title: "Licença do Adobe Acrobat",
      description: "Preciso de licença do Adobe Acrobat para editar PDFs de contratos.",
      category: "Software",
      priority: "low",
      status: "open",
      affected: "self",
      requesterId: 7,
      createdAt: ago(3 * DAY),
      updatedAt: ago(3 * DAY),
      history: [{ at: ago(3 * DAY), author: "Gabriela Rocha", text: "Requisição aberta." }],
    },
  ];
}

/** Last used code number per type, so new tickets continue after the seed ones. */
export const lastTicketCodeNumber = { INC: 20519, REQ: 10480 } as const;
