"use server";

import { getSession } from "@/server/auth/session";

/**
 * Asks for a password reset link for the person in the session.
 * SIMULATED: there is no mail service in this challenge, so nothing is sent.
 */
export async function requestPasswordResetAction(): Promise<{ ok: true }> {
  const user = await getSession();
  if (!user) throw new Error("Sessão inválida.");
  return { ok: true };
}
