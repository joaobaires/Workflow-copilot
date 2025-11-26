"""Command-line interface for the Teams AI Planner."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from .analyzer import ActionPlanAnalyzer
from .config import Settings
from .graph import GraphClient
from .models import ActionPlan
from .planner import DailyActionPlanner


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AI-assisted Microsoft Teams planning")
    parser.add_argument("--team-id", help="Microsoft Teams team ID", required=False)
    parser.add_argument("--channel-id", help="Channel ID inside the team", required=False)
    parser.add_argument("--focus", help="Operational focus (e.g. blockers, customers)")
    parser.add_argument("--top", type=int, default=40, help="Max messages to fetch")
    parser.add_argument("--lookback", type=int, default=24, help="Hours of history to fetch")
    parser.add_argument(
        "--offline-json",
        type=Path,
        help="Optional path to cached Graph messages for offline testing",
    )
    parser.add_argument(
        "--export-json",
        type=Path,
        help="Optional path to export the generated plan as JSON",
    )
    parser.add_argument(
        "--send-followups",
        action="store_true",
        help="Send suggested follow-up messages to the channel",
    )
    parser.add_argument(
        "--force-send",
        action="store_true",
        help="Disable dry-run safety when --send-followups is set",
    )
    parser.add_argument(
        "--fake-ai",
        action="store_true",
        help="Use the rule-based analyzer instead of calling an external LLM",
    )
    return parser.parse_args()


def _load_offline_messages(path: Path) -> Iterable[dict]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        return data.get("value", [])
    return data


def main() -> None:
    args = _parse_args()
    use_fake_ai = args.fake_ai
    needs_graph = not args.offline_json or args.send_followups

    settings = None
    if needs_graph or not use_fake_ai:
        settings = Settings.from_env(
            require_ai=not use_fake_ai,
            require_graph=needs_graph,
        )

    if needs_graph and (not args.team_id or not args.channel_id):
        raise SystemExit("--team-id and --channel-id are required when hitting Microsoft Graph")

    graph_client = None
    if needs_graph and settings:
        graph_client = GraphClient(
            tenant_id=settings.tenant_id,
            client_id=settings.client_id,
            client_secret=settings.client_secret,
        )

    if use_fake_ai:
        from .heuristics import RuleBasedAnalyzer

        analyzer = RuleBasedAnalyzer()
    else:
        analyzer = ActionPlanAnalyzer(
            api_key=settings.openai_api_key,  # type: ignore[union-attr]
            model=settings.openai_model,  # type: ignore[union-attr]
            base_url=settings.openai_base_url,  # type: ignore[union-attr]
        )

    planner = DailyActionPlanner(
        graph_client=graph_client,
        analyzer=analyzer,
        time_horizon_hours=settings.planner_time_horizon_hours if settings else 8,
    )

    offline_messages = None
    if args.offline_json:
        offline_messages = _load_offline_messages(args.offline_json)

    plan = planner.generate_plan(
        team_id=args.team_id or "offline",
        channel_id=args.channel_id or "offline",
        focus=args.focus,
        top=args.top,
        lookback_hours=args.lookback,
        offline_messages=offline_messages,
    )
    planner.pretty_print(plan)

    if args.export_json:
        args.export_json.write_text(json.dumps(plan.to_dict(), indent=2), encoding="utf-8")

    if args.send_followups:
        planner.execute_followups(
            plan,
            team_id=args.team_id,
            channel_id=args.channel_id,
            dry_run=not args.force_send,
        )


if __name__ == "__main__":  # pragma: no cover
    main()
