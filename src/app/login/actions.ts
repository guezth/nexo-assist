"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, getSession } from "@/server/auth/session";
import { getPresence } from "@/server/presence";
import { homePathFor } from "@/server/auth/session-token";
import { authenticate } from "@/server/auth/users";

export interface LoginState {
  error?: string;
  email?: string;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!email || !password) return { error: "Informe o e-mail e a senha.", email };

  const result = authenticate(email, password);
  if (!result.ok) {
    return {
      email,
      error:
        result.reason === "throttled"
          ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
          : "E-mail ou senha incorretos.",
    };
  }

  await createSession(result.user, { remember });
  redirect(homePathFor(result.user.role));
}

export async function logoutAction(): Promise<void> {
  // An analyst who signs out stops counting as online right away.
  const user = await getSession();
  if (user?.role === "analyst") await (await getPresence()).leave(user.id);
  await destroySession();
  redirect("/login");
}
