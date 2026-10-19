import type { AutomationExecution, AgentExecutionUpdate } from "./rpc-types.js";

export function applyAgentExecutionUpdate(
  execution: AutomationExecution,
  update: AgentExecutionUpdate,
): Extract<AutomationExecution, { mode: "agent" }> {
  if (execution.mode !== "agent") {
    throw new Error(
      "Agent execution options can only update agent automations",
    );
  }

  const next = {
    ...execution,
    ...(update.prompt !== undefined ? { prompt: update.prompt } : {}),
    ...(update.providerId !== undefined
      ? { providerId: update.providerId }
      : {}),
    ...(update.model !== undefined ? { model: update.model } : {}),
    ...(update.reasoningLevel !== undefined
      ? { reasoningLevel: update.reasoningLevel }
      : {}),
    ...(update.permissionMode !== undefined
      ? { permissionMode: update.permissionMode }
      : {}),
  };
  if (update.serviceTier === null) {
    delete next.serviceTier;
  } else if (update.serviceTier !== undefined) {
    next.serviceTier = update.serviceTier;
  }
  if (update.target === undefined) return next;
  if (update.target.type === "target-thread") {
    return { ...next, targetThreadId: update.target.threadId };
  }
  const { targetThreadId: _targetThreadId, ...withoutTargetThread } = next;
  return {
    ...withoutTargetThread,
    environment: update.target.environment,
  };
}
