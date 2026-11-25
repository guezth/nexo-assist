import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getPresence } from "@/server/presence";
import { LoginForm } from "./login-form";
import { OnlineAnalysts, OnlineAnalystsFallback } from "./online-analysts";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Entrar · Nexo Assist" };

function NexoMark() {
  // The prototype crops the logo to a 24px box; here the whole shape is kept visible.
  return (
    <svg className={styles.mark} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path
        transform="translate(1.806 3.6821)"
        fill="#fff"
        d="M21.763 0.24493l-3.374 1.687c-0.623 0.308-0.973 0.903-0.973 1.631l0 6.293-11.193-9.429c-0.623-0.469-1.372-0.553-2.03-0.245l-3.185 1.631c-0.651 0.322-1.008 0.924-1.008 1.673l0 15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c0.693-0.322 1.057-0.952 1.057-1.722l0-7.7 11.732 10.591c0.602 0.546 1.421 0.679 2.086 0.364l2.786-1.505c0.602-0.315 0.938-0.931 0.938-1.68l0-15.288c0-1.463-1.505-2.275-2.625-1.687z"
      />
    </svg>
  );
}

/** The number of analysts with the console open, read when the page is requested (not at build time). */
async function OnlineStat() {
  await connection();
  return <OnlineAnalysts initial={await (await getPresence()).countOnline()} />;
}

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <aside className={styles.showcase}>
        <div className={styles.brand}>
          <NexoMark />
          <span className={styles.brandName}>Nexo Assist</span>
        </div>

        <div className={styles.story}>
          <div className={styles.headline}>
            <p className={styles.eyebrow}>Service desk de TI da Nexo</p>
            <h2 className={styles.title}>Seu problema de TI, resolvido em uma conversa.</h2>
            <p className={styles.lead}>
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama
              um analista quando precisa.
            </p>
          </div>

          <div className={styles.previewWrap}>
            <div className={styles.preview} aria-hidden>
              <div className={styles.userRow}>
                <div className={styles.userBubble}>Meu notebook não conecta na VPN. Erro 809.</div>
              </div>
              <div className={styles.agent}>
                <div className={styles.who}>
                  <span className={styles.whoName}>Nexo Assist</span>
                  <span className={styles.whoSteps}>consultou seus chamados · criou um chamado</span>
                </div>
                <div className={styles.agentBubble}>
                  <p>Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.</p>
                </div>
                <div className={styles.ticketChip}>
                  <span className={styles.dot} />
                  <span className={styles.ticketNumber}>INC-20517</span>
                  <span className={styles.ticketMeta}>Rede e VPN · Alta · em até 4 h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statValue}>8 s</div>
            <div className={styles.statLabel}>primeira resposta, em média</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>72%</div>
            <div className={styles.statLabel}>resolvidos sem fila</div>
          </div>
          <Suspense fallback={<OnlineAnalystsFallback />}>
            <OnlineStat />
          </Suspense>
        </div>
      </aside>

      <main className={styles.signin}>
        <div className={styles.help}>
          <span>Problema para entrar?</span>
          <span className={styles.helpLink}>Ligue no ramal 4000</span>
        </div>

        <div className={styles.center}>
          <LoginForm />
        </div>

        <div className={styles.footer}>
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </main>
    </div>
  );
}
