"use client";

import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotShown, setForgotShown] = useState(false);

  return (
    <form className={styles.form} action={formAction} noValidate>
      <div className={styles.heading}>
        <h1 className={styles.headingTitle}>Entrar</h1>
        <p className={styles.subtitle}>Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="email">
              E-mail corporativo
            </label>
          </div>
          <div className={styles.input}>
            <Mail size={16} aria-hidden />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="nome.sobrenome@nexo.com.br"
              defaultValue={state.email ?? ""}
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="password">
              Senha
            </label>
            <button type="button" className={styles.linkButton} onClick={() => setForgotShown(true)}>
              Esqueci minha senha
            </button>
          </div>
          <div className={`${styles.input} ${styles.secret}`}>
            <LockKeyhole size={16} aria-hidden />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              required
            />
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
        </div>

        <label className={styles.remember}>
          <input type="checkbox" name="remember" defaultChecked />
          <span className={styles.checkbox}>
            <Check size={12} strokeWidth={3} aria-hidden />
          </span>
          Manter conectado neste computador
        </label>
      </div>

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
        {!pending && <ArrowRight size={16} aria-hidden />}
      </button>

      <div className={styles.note} aria-live="polite">
        {state.error ? (
          <span className={styles.error} role="alert">
            {state.error}
          </span>
        ) : forgotShown ? (
          "A redefinição de senha é feita pelo service desk. Ligue no ramal 4000."
        ) : null}
      </div>
    </form>
  );
}
