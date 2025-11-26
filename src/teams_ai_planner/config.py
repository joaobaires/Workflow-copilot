"""Configuration helpers for the Teams AI Planner."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


@dataclass(slots=True)
class Settings:
    """Runtime settings sourced from environment variables."""

    tenant_id: str
    client_id: str
    client_secret: str
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"
    openai_base_url: Optional[str] = None
    planner_time_horizon_hours: int = 8

    @classmethod
    def from_env(
        cls,
        env_file: str | os.PathLike[str] | None = ".env",
        *,
        require_ai: bool = True,
        require_graph: bool = True,
    ) -> "Settings":
        """Load settings from environment variables and optional ``.env`` file."""

        if env_file:
            path = Path(env_file)
            if path.exists():
                load_dotenv(dotenv_path=path)

        def _require(key: str) -> str:
            value = os.getenv(key)
            if not value:
                raise ValueError(
                    f"Missing required environment variable '{key}'. "
                    "See README for setup instructions."
                )
            return value

        planner_time_horizon_hours = int(os.getenv("PLANNER_TIME_HORIZON_HOURS", "8"))

        openai_api_key = os.getenv("OPENAI_API_KEY")
        if require_ai and not openai_api_key:
            raise ValueError(
                "Missing required environment variable 'OPENAI_API_KEY'. "
                "Set it or run the CLI with --fake-ai for offline testing."
            )

        tenant_id = _require("TEAMS_TENANT_ID") if require_graph else os.getenv("TEAMS_TENANT_ID", "offline")
        client_id = _require("TEAMS_CLIENT_ID") if require_graph else os.getenv("TEAMS_CLIENT_ID", "offline")
        client_secret = _require("TEAMS_CLIENT_SECRET") if require_graph else os.getenv("TEAMS_CLIENT_SECRET", "offline")

        return cls(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
            openai_api_key=openai_api_key or "offline-placeholder",
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            openai_base_url=os.getenv("OPENAI_BASE_URL"),
            planner_time_horizon_hours=planner_time_horizon_hours,
        )

    def to_redacted_dict(self) -> dict[str, str | int | None]:
        """Return settings metadata with secrets redacted for logging."""

        return {
            "tenant_id": self.tenant_id,
            "client_id": self.client_id,
            "client_secret": "***",
            "openai_api_key": "***",
            "openai_model": self.openai_model,
            "openai_base_url": self.openai_base_url,
            "planner_time_horizon_hours": self.planner_time_horizon_hours,
        }
