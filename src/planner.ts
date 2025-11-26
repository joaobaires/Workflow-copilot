import { Analyzer } from "./analyzers/types.js";
import { GraphClient } from "./graphClient.js";
import { ActionPlan, ProposedAction, TeamsMessage, normalizeMessages } from "./types.js";

export interface PlanOptions {
  focus?: string;
  top?: number;
  lookbackHours?: number;
  offlineMessages?: Array<Record<string, any>>;
}

export interface DailyActionPlannerOptions {
  graphClient?: GraphClient;
  analyzer: Analyzer;
  timeHorizonHours: number;
}

export class DailyActionPlanner {
  private graphClient?: GraphClient;
  private analyzer: Analyzer;
  private timeHorizonHours: number;

  constructor(opts: DailyActionPlannerOptions) {
    this.graphClient = opts.graphClient;
    this.analyzer = opts.analyzer;
    this.timeHorizonHours = opts.timeHorizonHours;
  }

  async generatePlan(teamId: string, channelId: string, options: PlanOptions = {}): Promise<ActionPlan> {
    const { focus, top = 40, lookbackHours = 24, offlineMessages } = options;
    let rawMessages: Array<Record<string, any>>;
    if (offlineMessages) {
      rawMessages = [...offlineMessages];
    } else {
      if (!this.graphClient) {
        throw new Error("Graph client is not configured. Provide --team-id/--channel-id or use offline JSON.");
      }
      rawMessages = await this.graphClient.getRecentMessages(teamId, channelId, top, lookbackHours);
    }

    const normalized = normalizeMessages(rawMessages);
    const actions = await this.analyzer.suggestActions({
      messages: normalized,
      focus,
      timeHorizonHours: this.timeHorizonHours,
    });

    return {
      generatedAt: new Date().toISOString(),
      timespanHours: this.timeHorizonHours,
      messageSampleSize: normalized.length,
      actions,
    } satisfies ActionPlan;
  }

  printPlan(plan: ActionPlan, formatter: (action: ProposedAction) => void): void {
    plan.actions.forEach(formatter);
  }

  async executeFollowUps(plan: ActionPlan, teamId: string, channelId: string, { dryRun = true } = {}): Promise<any[]> {
    if (!this.graphClient) {
      throw new Error("Cannot send follow-ups without a Graph client.");
    }
    const responses: any[] = [];
    for (const action of plan.actions) {
      if (!action.suggestedMessage) continue;
      if (dryRun) {
        console.log(`[DRY RUN] Would send: ${action.suggestedMessage.slice(0, 120)}...`);
        continue;
      }
      const res = await this.graphClient.sendChannelMessage(teamId, channelId, action.suggestedMessage);
      responses.push(res);
    }
    return responses;
  }
}
