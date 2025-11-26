"""Rule-based fallback analyzer for offline demos or testing."""

from __future__ import annotations

from typing import Iterable, List, Optional

from .models import ProposedAction, TeamsMessage


class RuleBasedAnalyzer:
    """Lightweight heuristic analyzer that avoids external LLM calls."""

    def suggest_actions(
        self,
        messages: Iterable[TeamsMessage],
        focus: Optional[str] = None,
        time_horizon_hours: int = 8,
    ) -> List[ProposedAction]:
        focus_hint = focus or "General"
        actions: List[ProposedAction] = []
        for message in messages:
            lower = message.content.lower()
            target = message.mentions[0] if message.mentions else message.sender
            if any(keyword in lower for keyword in ("update", "status", "eta")):
                actions.append(
                    ProposedAction(
                        title=f"Request update from {target}",
                        details=f"{message.sender} needs a status update related to: '{message.content[:80]}...'",
                        urgency="high" if "overdue" in lower or "today" in lower else "normal",
                        recommended_recipient=target,
                        suggested_message=(
                            f"Hi {target.split()[0]}, could you share an update on the request mentioned by "
                            f"{message.sender}? Original note: {message.content[:200]}"
                        ),
                        related_message_id=message.id,
                    )
                )
            elif "reminder" in lower or "due" in lower:
                actions.append(
                    ProposedAction(
                        title="Confirm deadline ownership",
                        details=f"Reminder detected: {message.content[:100]}...",
                        urgency="normal",
                        recommended_recipient=target,
                        suggested_message=(
                            f"Following up on the reminder from {message.sender}: {message.content[:160]}"
                        ),
                        related_message_id=message.id,
                    )
                )

        if not actions:
            actions.append(
                ProposedAction(
                    title=f"Proactive check-in ({focus_hint})",
                    details="No obvious blockers. Consider posting a quick roundup asking for pending items.",
                    urgency="low",
                    suggested_message=(
                        "Quick sync reminder: please share blockers or pending updates for today's agenda."
                    ),
                )
            )
        return actions
