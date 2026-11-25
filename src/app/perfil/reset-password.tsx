"use client";

import { Check, KeyRound, Loader2, Mail, RotateCcwKey } from "lucide-react";
import { useState, useTransition } from "react";
import { requestPasswordResetAction } from "./actions";
import styles from "./perfil.module.css";

/** The password card. The reset link is simulated (there is no mail service). */
export function PasswordCard({ email, meta }: { email: string; meta: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function request() {
    setError(false);
    startTransition(async () => {
      try {
        await requestPasswordResetAction();
        setSent(true);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <section className={styles.card} aria-label="Senha">
      <div className={styles.passwordRow}>
        <div className={styles.iconWrap}>
          <KeyRound size={18} aria-hidden />
        </div>
        <div className={styles.passwordText}>
          <h2 className={styles.passwordTitle}>Senha</h2>
          <span className={styles.passwordMeta}>{meta}</span>
        </div>
        <button type="button" className={styles.reset} onClick={request} disabled={pending || sent}>
          {pending ? (
            <Loader2 size={15} className={styles.spin} aria-hidden />
          ) : sent ? (
            <Check size={15} aria-hidden />
          ) : (
            <RotateCcwKey size={15} aria-hidden />
          )}
          {sent ? "Link enviado" : "Redefinir senha"}
        </button>
      </div>
      <div className={styles.helper} role="status">
        <Mail size={14} aria-hidden />
        {error
          ? "Não foi possível pedir o link agora. Tente de novo."
          : sent
            ? `Link de redefinição enviado para ${email}.`
            : `Enviaremos um link de redefinição para ${email}.`}
      </div>
    </section>
  );
}
