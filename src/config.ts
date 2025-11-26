import { config as loadEnv } from "dotenv";

export interface Settings {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  openAiApiKey: string;
  openAiModel: string;
  openAiBaseUrl?: string;
  plannerTimeHorizonHours: number;
}

export interface SettingsOptions {
  envFile?: string;
  requireAi?: boolean;
  requireGraph?: boolean;
}

export function loadSettings(options: SettingsOptions = {}): Settings {
  const { envFile = ".env", requireAi = true, requireGraph = true } = options;
  loadEnv({ path: envFile });

  const getRequired = (key: string, enabled: boolean): string => {
    const value = process.env[key];
    if (enabled && !value) {
      throw new Error(`Missing required environment variable '${key}'.`);
    }
    return value ?? "";
  };

  const tenantId = requireGraph ? getRequired("TEAMS_TENANT_ID", true) : process.env.TEAMS_TENANT_ID ?? "offline";
  const clientId = requireGraph ? getRequired("TEAMS_CLIENT_ID", true) : process.env.TEAMS_CLIENT_ID ?? "offline";
  const clientSecret = requireGraph ? getRequired("TEAMS_CLIENT_SECRET", true) : process.env.TEAMS_CLIENT_SECRET ?? "offline";
  const openAiApiKey = requireAi ? getRequired("OPENAI_API_KEY", true) : process.env.OPENAI_API_KEY ?? "offline";

  return {
    tenantId,
    clientId,
    clientSecret,
    openAiApiKey,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
    plannerTimeHorizonHours: Number(process.env.PLANNER_TIME_HORIZON_HOURS ?? "8"),
  };
}
