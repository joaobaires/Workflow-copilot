import OpenAI from "openai";
import { ProposedAction, TeamsMessage } from "../types.js";
import { Analyzer } from "./types.js";

const SYSTEM_PROMPT =
  "You are an operations chief of staff bot that reviews Microsoft Teams channels." +
  "Summarize active threads and propose tactically useful actions." +
  "Respond with strict JSON: {\"actions\":[{\"title\":str,\"details\":str,\"urgency\":\"low|normal|high\",\"recommended_recipient\":str|null,\"suggested_message\":str|null,\"related_message_id\":str|null}]}";

export interface OpenAiAnalyzerOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAiAnalyzer implements Analyzer {
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAiAnalyzerOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
    this.model = options.model;
  }

  async suggestActions({ messages, focus, timeHorizonHours }: {
    messages: TeamsMessage[];
    focus?: string | null;
    timeHorizonHours: number;
  }): Promise<ProposedAction[]> {
    const userPrompt = this.buildUserPrompt(messages, focus ?? undefined, timeHorizonHours);
    const response = await this.client.responses.create({
      model: this.model,
      temperature: 0.4,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const firstOutput = response.output?.[0] as any;
    const text = firstOutput?.content?.[0]?.text;
    if (!text) {
      throw new Error("OpenAI response missing content");
    }
    const data = JSON.parse(text);
    return (data.actions ?? []).map((action: any) => ({
      title: action.title ?? "Untitled",
      details: action.details ?? "",
      urgency: action.urgency ?? "normal",
      recommendedRecipient: action.recommended_recipient ?? undefined,
      suggestedMessage: action.suggested_message ?? undefined,
      relatedMessageId: action.related_message_id ?? undefined,
    } satisfies ProposedAction));
  }

  private buildUserPrompt(messages: TeamsMessage[], focus: string | undefined, horizon: number) {
    const rows = ["Recent Teams channel activity (oldest to newest):"];
    for (const msg of messages) {
      const mentions = msg.mentions.length ? ` mentions ${msg.mentions.join(", ")}` : "";
      rows.push(`- ${msg.createdAt} | ${msg.sender}${mentions}: ${msg.content.slice(0, 400)}`);
    }
    rows.push(`Desired time horizon: next ${horizon} hours. Operational focus: ${focus ?? "General productivity"}.`);
    rows.push("Return action list prioritizing blockers, unresolved requests, and status updates.");
    return rows.join("\n");
  }
}
