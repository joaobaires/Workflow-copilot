import { randomUUID } from "node:crypto";

export interface TeamsMessage {
  id: string;
  sender: string;
  content: string;
  createdAt: string;
  mentions: string[];
}

export interface ProposedAction {
  title: string;
  details: string;
  urgency: "low" | "normal" | "high";
  recommendedRecipient?: string;
  suggestedMessage?: string;
  relatedMessageId?: string;
}

export interface ActionPlan {
  generatedAt: string;
  timespanHours: number;
  messageSampleSize: number;
  actions: ProposedAction[];
}

export function normalizeMessages(payloads: Array<Record<string, any>>): TeamsMessage[] {
  return payloads.map((payload) => {
    const content = String(payload?.body?.content ?? "").replace(/<[^>]+>/g, "").trim();
    const sender = payload?.from?.user?.displayName ?? "Unknown";
    const createdDate = payload?.createdDateTime ?? new Date().toISOString();
    const mentions: string[] = (payload?.mentions ?? [])
      .map((m: any) => m?.mentioned?.user?.displayName)
      .filter(Boolean);
    return {
      id: payload?.id ?? randomUUID(),
      sender,
      content,
      createdAt: createdDate,
      mentions,
    } as TeamsMessage;
  });
}
