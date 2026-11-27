import { getDb } from "@/server/db";

const OLLAMA_TIMEOUT_MS = 4000;

/**
 * Is the app able to work? Checks the database and whether the Ollama server
 * answers from where the app runs. Meant for whoever deploys it: when the agent
 * says it is unavailable, this tells which side is wrong (address, network or IP authorization).
 */
export async function GET() {
  const checks: Record<string, string> = {};

  try {
    await (await getDb()).execute("SELECT 1");
    checks.database = "ok";
  } catch (error) {
    checks.database = `erro: ${(error as Error).message}`;
  }

  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) {
      checks.ollama = `erro: o servidor respondeu ${response.status} (IP sem autorização?)`;
    } else {
      // Cloud models can be used without showing up in this list, so only the connection is judged here.
      checks.ollama = "ok";
    }
  } catch (error) {
    const reason = (error as Error).name === "TimeoutError" ? "sem resposta em 4 s" : (error as Error).message;
    checks.ollama = `erro: não alcançou o Ollama em ${new URL(base).host} (${reason})`;
  }

  const ok = Object.values(checks).every((value) => value === "ok");
  return Response.json({ status: ok ? "ok" : "degradado", ...checks }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
