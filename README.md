# Teams AI Action Planner

This project bootstraps a practical workflow-copilot that connects to Microsoft Teams, scans recent channel messages with AI, and proposes concrete follow-up actions (for example, pinging someone for an update on an open request).

## Features

- Microsoft Graph connector for pulling and posting Teams channel messages.
- AI analyzer (OpenAI-compatible) that turns raw chats into structured action items.
- CLI workflow with optional offline sample data, JSON export, and dry-run sending.
- Heuristic fallback (`--fake-ai`) so you can demo the workflow without LLM credentials.
- Modular design so you can swap the LLM provider or extend action execution.

## Getting Started

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Create an Azure AD app registration

1. Register a confidential client with Microsoft Entra ID.
2. Grant **ChannelMessage.Read.All** and **ChannelMessage.Send** application permissions for Microsoft Graph.
3. Create a client secret and record:
   - Tenant (directory) ID
   - Client (application) ID
   - Client secret value

### 3. Configure environment

Create a `.env` file in the repository root:

```
TEAMS_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TEAMS_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TEAMS_CLIENT_SECRET=super-secret-value
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# Optional overrides:
# OPENAI_BASE_URL=https://my-azure-openai-resource.openai.azure.com/
# PLANNER_TIME_HORIZON_HOURS=6
```

> 🔐 `loadSettings` (see `src/config.ts`) reads `.env` automatically and validates required values.

## Running the planner

```bash
teams-ai-planner \
  --team-id <TEAM_ID> \
  --channel-id <CHANNEL_ID> \
  --focus "Customer escalations" \
  --top 40 \
  --lookback 24
```

What happens:

1. `GraphClient` (`src/graphClient.ts`) retrieves recent channel messages.
2. `OpenAiAnalyzer` (`src/analyzers/openAiAnalyzer.ts`) sends them to the configured LLM, requesting JSON-formatted actions (or `RuleBasedAnalyzer` for `--fake-ai`).
3. `DailyActionPlanner` (`src/planner.ts`) prints the suggested actions and optionally sends follow-ups back to Teams.

### Offline / demo mode

Try the flow without Graph credentials using the bundled sample payload:

```bash
teams-ai-planner --offline-json samples/messages.sample.json --focus "Ops readiness" --fake-ai
```

Add `--fake-ai` to skip OpenAI/Azure OpenAI. If you still want to use the live LLM while replaying cached data, omit that flag but keep `OPENAI_API_KEY` in your `.env`.

### Exporting plans

```bash
teams-ai-planner ... --export-json /tmp/plan.json
```

### Sending suggested follow-ups

By default the CLI will **not** send messages, even if the AI proposes them. To enable:

```bash
teams-ai-planner ... --send-followups --force-send
```

Omit `--force-send` to inspect a dry-run preview first.

## Extending

- Swap the LLM provider by editing `ActionPlanAnalyzer` to call Azure OpenAI, Anthropic, etc.
- Add more executors (e.g., create Planner tasks or Jira tickets) by extending `DailyActionPlanner`.
- Wrap the CLI inside a scheduled job or GitHub Action for daily reports.

## Testing checklist

- [ ] `teams-ai-planner --offline-json samples/messages.sample.json` produces a plan.
- [ ] Real Graph credentials fetch channel history successfully.
- [ ] Sending mode works after granting `ChannelMessage.Send`.
- [ ] JSON export file contains the proposed actions.

## Troubleshooting

- `Missing required environment variable ...`: ensure `.env` is populated and sourced.
- `Forbidden (403)` from Graph: confirm the app has admin-consented permissions.
- LLM JSON parse errors: enable verbose logging and inspect the raw response; sometimes raising temperature slightly can help.