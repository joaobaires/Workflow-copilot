import { ProposedAction, TeamsMessage } from "../types.js";

export interface Analyzer {
  suggestActions(params: {
    messages: TeamsMessage[];
    focus?: string | null;
    timeHorizonHours: number;
  }): Promise<ProposedAction[]>;
}
