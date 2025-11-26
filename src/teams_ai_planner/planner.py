"""High-level orchestration for fetching Teams data and planning actions."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable, List, Optional, Protocol

from rich.console import Console
from rich.table import Table

from .graph import GraphClient
from .models import ActionPlan, ProposedAction, TeamsMessage, ensure_messages


class AnalyzerProtocol(Protocol):
    def suggest_actions(
        self,
        messages: Iterable[TeamsMessage],
        focus: Optional[str] = None,
        time_horizon_hours: int = 8,
    ) -> List[ProposedAction]:
        ...


class DailyActionPlanner:
    """Generate and optionally execute AI-suggested Teams follow-ups."""

    def __init__(
        self,
        graph_client: GraphClient | None,
        analyzer: AnalyzerProtocol,
        *,
        time_horizon_hours: int = 8,
    ) -> None:
        self._graph = graph_client
        self._analyzer = analyzer
        self._time_horizon_hours = time_horizon_hours
        self._console = Console()

    def generate_plan(
        self,
        team_id: str,
        channel_id: str,
        *,
        focus: Optional[str] = None,
        top: int = 40,
        lookback_hours: int = 24,
        offline_messages: Optional[Iterable[dict]] = None,
    ) -> ActionPlan:
        """Fetch Teams data (or accept offline messages) and analyze it."""

        if offline_messages is not None:
            raw_messages = list(offline_messages)
        else:
            if not self._graph:
                raise RuntimeError(
                    "Graph client is not configured. Provide --team-id/--channel-id or use offline JSON."
                )
            raw_messages = self._graph.get_recent_messages(
                team_id, channel_id, top=top, lookback_hours=lookback_hours
            )
        normalized: List[TeamsMessage] = ensure_messages(raw_messages)
        actions = self._analyzer.suggest_actions(
            normalized,
            focus=focus,
            time_horizon_hours=self._time_horizon_hours,
        )
        return ActionPlan(
            generated_at=datetime.utcnow(),
            timespan_hours=self._time_horizon_hours,
            message_sample_size=len(normalized),
            actions=actions,
        )

    def pretty_print(self, plan: ActionPlan) -> None:
        table = Table(title="Suggested follow-ups")
        table.add_column("Urgency", style="yellow")
        table.add_column("Title", style="bold")
        table.add_column("Details")
        table.add_column("Recipient")
        for action in plan.actions:
            table.add_row(
                action.urgency.capitalize(),
                action.title,
                action.details,
                action.recommended_recipient or "—",
            )
        self._console.print(table)

    def execute_followups(
        self,
        plan: ActionPlan,
        team_id: str,
        channel_id: str,
        *,
        dry_run: bool = True,
    ) -> list[dict]:
        """Send suggested follow-up messages back to the Teams channel."""

        if not self._graph:
            raise RuntimeError("Cannot send follow-ups without a Graph client.")

        responses = []
        for action in plan.actions:
            if not action.suggested_message:
                continue
            message = action.suggested_message
            if dry_run:
                self._console.print(
                    f"[cyan]DRY RUN[/cyan] Would send: {message[:120]}..."
                )
                continue
            responses.append(
                self._graph.send_channel_message(team_id, channel_id, message)
            )
        return responses
