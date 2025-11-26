"""AI-powered analysis that converts Teams messages to actionable suggestions."""

from __future__ import annotations

import json
from typing import Iterable, List, Optional

from openai import OpenAI

from .models import ProposedAction, TeamsMessage

SYSTEM_PROMPT = (
    "You are an operations chief of staff bot that reviews Microsoft Teams "
    "channels. Summarize active threads and propose tactically useful actions. "
    "Respond with strict JSON using the schema: {\"actions\":[{\"title\":str,"
    "\"details\":str,\"urgency\":\"low|normal|high\",\"recommended_recipient\":str|null,"
    "\"suggested_message\":str|null,\"related_message_id\":str|null}]}"
)


class ActionPlanAnalyzer:
    """Wraps an LLM provider to turn chat history into task suggestions."""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: Optional[str] = None,
    ) -> None:
        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        self._client = OpenAI(**client_kwargs)
        self._model = model

    def suggest_actions(
        self,
        messages: Iterable[TeamsMessage],
        focus: Optional[str] = None,
        time_horizon_hours: int = 8,
    ) -> List[ProposedAction]:
        """Call the LLM and parse action suggestions."""

        content = self._build_user_prompt(messages, focus, time_horizon_hours)
        response = self._client.responses.create(
            model=self._model,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            temperature=0.4,
        )
        ai_text = response.output[0].content[0].text  # type: ignore[index]
        data = self._parse_json(ai_text)
        return [
            ProposedAction(
                title=item.get("title", "Untitled"),
                details=item.get("details", ""),
                urgency=item.get("urgency", "normal"),
                recommended_recipient=item.get("recommended_recipient"),
                suggested_message=item.get("suggested_message"),
                related_message_id=item.get("related_message_id"),
            )
            for item in data.get("actions", [])
        ]

    @staticmethod
    def _parse_json(payload: str) -> dict:
        try:
            return json.loads(payload)
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive fallback
            raise ValueError(
                "LLM response was not valid JSON. Enable logging to inspect output."
            ) from exc

    @staticmethod
    def _build_user_prompt(
        messages: Iterable[TeamsMessage],
        focus: Optional[str],
        time_horizon_hours: int,
    ) -> str:
        focus_line = focus or "General productivity"
        rows = [
            "Recent Teams channel activity (oldest to newest):",
        ]
        for msg in messages:
            mentions = f" mentions {', '.join(msg.mentions)}" if msg.mentions else ""
            rows.append(
                f"- {msg.created_at.isoformat()} | {msg.sender}{mentions}: {msg.content[:400]}"
            )
        rows.append(
            f"Desired time horizon: next {time_horizon_hours} hours. Operational focus: {focus_line}."
        )
        rows.append(
            "Return an action list prioritizing blockers, unresolved requests, and status updates."
        )
        return "\n".join(rows)
