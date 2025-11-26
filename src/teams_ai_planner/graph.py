"""Thin Microsoft Graph API wrapper for Teams messages."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

import msal
import requests

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
SCOPES = ["https://graph.microsoft.com/.default"]


class GraphClient:
    """Minimal Microsoft Graph helper for Teams data."""

    def __init__(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        session: Optional[requests.Session] = None,
    ) -> None:
        self._authority = f"https://login.microsoftonline.com/{tenant_id}"
        self._app = msal.ConfidentialClientApplication(
            client_id=client_id,
            client_credential=client_secret,
            authority=self._authority,
        )
        self._session = session or requests.Session()

    def _get_token(self) -> str:
        result = self._app.acquire_token_silent(SCOPES, account=None)
        if not result:
            result = self._app.acquire_token_for_client(scopes=SCOPES)
        if "access_token" not in result:
            raise RuntimeError(
                f"Unable to fetch Graph token: {result.get('error_description', 'unknown error')}"
            )
        return result["access_token"]

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }

    def get_channel_messages(
        self,
        team_id: str,
        channel_id: str,
        top: int = 50,
        lookback_hours: Optional[int] = None,
    ) -> List[dict[str, Any]]:
        params: Dict[str, str] = {"$top": str(top)}
        if lookback_hours:
            start_time = datetime.utcnow() - timedelta(hours=lookback_hours)
            params["$filter"] = f"createdDateTime ge {start_time.isoformat()}Z"

        url = f"{GRAPH_BASE_URL}/teams/{team_id}/channels/{channel_id}/messages"
        response = self._session.get(url, headers=self._headers(), params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get("value", [])

    def send_channel_message(self, team_id: str, channel_id: str, message: str) -> dict[str, Any]:
        payload = {"body": {"contentType": "html", "content": message}}
        url = f"{GRAPH_BASE_URL}/teams/{team_id}/channels/{channel_id}/messages"
        response = self._session.post(url, headers=self._headers(), data=json.dumps(payload), timeout=30)
        response.raise_for_status()
        return response.json()

    def get_recent_messages(
        self,
        team_id: str,
        channel_id: str,
        top: int = 50,
        lookback_hours: int = 24,
    ) -> List[dict[str, Any]]:
        return self.get_channel_messages(team_id, channel_id, top=top, lookback_hours=lookback_hours)
