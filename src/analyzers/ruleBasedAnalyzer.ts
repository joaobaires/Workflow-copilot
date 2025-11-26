import { ProposedAction, TeamsMessage } from "../types.js";
import { Analyzer } from "./types.js";

export class RuleBasedAnalyzer implements Analyzer {
  async suggestActions({ messages, focus, timeHorizonHours }: {
    messages: TeamsMessage[];
    focus?: string | null;
    timeHorizonHours: number;
  }): Promise<ProposedAction[]> {
    const actions: ProposedAction[] = [];
    for (const message of messages) {
      const lower = message.content.toLowerCase();
      const target = message.mentions[0] ?? message.sender;
      if (["update", "status", "eta"].some((keyword) => lower.includes(keyword))) {
        actions.push({
          title: `Request update from ${target}`,
          details: `${message.sender} needs a status update related to: '${message.content.slice(0, 160)}'`,
          urgency: lower.includes("overdue") || lower.includes("today") ? "high" : "normal",
          recommendedRecipient: target,
          suggestedMessage: `Hi ${target.split(" ")[0]}, could you share an update on the request mentioned by ${message.sender}? Original note: ${message.content.slice(0, 200)}`,
          relatedMessageId: message.id,
        });
      } else if (lower.includes("reminder") || lower.includes("due")) {
        actions.push({
          title: "Confirm deadline ownership",
          details: `Reminder detected: ${message.content.slice(0, 160)}`,
          urgency: "normal",
          recommendedRecipient: target,
          suggestedMessage: `Following up on the reminder from ${message.sender}: ${message.content.slice(0, 200)}`,
          relatedMessageId: message.id,
        });
      }
    }

    if (!actions.length) {
      actions.push({
        title: `Proactive check-in (${focus ?? "General"})`,
        details: `No blockers detected in the last ${timeHorizonHours} hours. Post a quick sync request?`,
        urgency: "low",
        suggestedMessage: "Quick sync reminder: please share blockers or pending updates for today's agenda.",
      });
    }

    return actions;
  }
}
