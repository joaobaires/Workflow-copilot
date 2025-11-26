#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import Table from "cli-table3";

import { loadSettings } from "./config.js";
import { GraphClient } from "./graphClient.js";
import { OpenAiAnalyzer } from "./analyzers/openAiAnalyzer.js";
import { RuleBasedAnalyzer } from "./analyzers/ruleBasedAnalyzer.js";
import { DailyActionPlanner } from "./planner.js";
import { ActionPlan } from "./types.js";

async function readOfflineMessages(filePath: string) {
  const absolute = resolve(process.cwd(), filePath);
  const raw = await readFile(absolute, "utf-8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  return data.value ?? [];
}

function printPlan(plan: ActionPlan) {
  const table = new Table({
    head: ["Urgency", "Title", "Details", "Recipient"],
    style: { head: ["cyan"] },
  });
  for (const action of plan.actions) {
    table.push([
      action.urgency.toUpperCase(),
      action.title,
      action.details,
      action.recommendedRecipient ?? "—",
    ]);
  }
  console.log(table.toString());
}

async function main() {
  const program = new Command();
  program
    .name("teams-ai-planner")
    .description("AI-assisted Microsoft Teams planning")
    .option("--team-id <teamId>", "Microsoft Teams team ID")
    .option("--channel-id <channelId>", "Channel ID inside the team")
    .option("--focus <focus>", "Operational focus, e.g. blockers")
    .option("--top <number>", "Max messages to fetch", (value) => parseInt(value, 10), 40)
    .option("--lookback <hours>", "Hours of history to fetch", (value) => parseInt(value, 10), 24)
    .option("--offline-json <path>", "Optional path to cached Graph messages for offline testing")
    .option("--export-json <path>", "Optional path to export the generated plan as JSON")
    .option("--send-followups", "Send suggested follow-up messages to the channel", false)
    .option("--force-send", "Disable dry-run safety when --send-followups is set", false)
    .option("--fake-ai", "Use rule-based analyzer instead of calling OpenAI", false)
    .option("--env-file <path>", "Custom path to .env file", ".env");

  program.parse(process.argv);
  const options = program.opts<{
    teamId?: string;
    channelId?: string;
    focus?: string;
    top: number;
    lookback: number;
    offlineJson?: string;
    exportJson?: string;
    sendFollowups: boolean;
    forceSend: boolean;
    fakeAi: boolean;
    envFile: string;
  }>();

  const needsGraph = !options.offlineJson || options.sendFollowups;
  if (needsGraph && (!options.teamId || !options.channelId)) {
    console.error(chalk.red("--team-id and --channel-id are required when calling Microsoft Graph"));
    process.exit(1);
  }

  const settings = (needsGraph || !options.fakeAi)
    ? loadSettings({ envFile: options.envFile, requireAi: !options.fakeAi, requireGraph: needsGraph })
    : undefined;

  const graphClient = needsGraph && settings
    ? new GraphClient({
        tenantId: settings.tenantId,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
      })
    : undefined;

  const analyzer = options.fakeAi
    ? new RuleBasedAnalyzer()
    : new OpenAiAnalyzer({
        apiKey: settings!.openAiApiKey,
        model: settings!.openAiModel,
        baseUrl: settings!.openAiBaseUrl,
      });

  const planner = new DailyActionPlanner({
    graphClient,
    analyzer,
    timeHorizonHours: settings?.plannerTimeHorizonHours ?? 8,
  });

  const offlineMessages = options.offlineJson ? await readOfflineMessages(options.offlineJson) : undefined;

  const plan = await planner.generatePlan(options.teamId ?? "offline", options.channelId ?? "offline", {
    focus: options.focus,
    top: options.top,
    lookbackHours: options.lookback,
    offlineMessages,
  });

  printPlan(plan);

  if (options.exportJson) {
    const absolute = resolve(process.cwd(), options.exportJson);
    await writeFile(absolute, JSON.stringify(plan, null, 2), "utf-8");
    console.log(chalk.gray(`Plan written to ${absolute}`));
  }

  if (options.sendFollowups) {
    await planner.executeFollowUps(plan, options.teamId!, options.channelId!, {
      dryRun: !options.forceSend,
    });
  }
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
