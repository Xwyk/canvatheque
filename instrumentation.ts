export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_STARTUP_TASKS === "true") return;
  const { runStartupTasks } = await import("@/lib/startup");
  await runStartupTasks();
}
