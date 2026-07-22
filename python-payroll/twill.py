"""A tiny, dependency-free client for the Twill Docs API (stdlib only)."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

DEFAULT_BASE_URL = os.environ.get("TWILL_BASE_URL", "https://www.twilldocs.com").rstrip("/")


class TwillError(RuntimeError):
    """Raised for any non-2xx response or transport failure."""


class TwillClient:
    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
        if not api_key:
            raise TwillError("TWILL_API_KEY is not set. Copy .env.example to .env and fill it in.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def create_document(
        self, template: str, doc_input: dict[str, Any], idempotency_key: str | None = None
    ) -> dict[str, Any]:
        """Create a document. Returns immediately (HTTP 202) with the new id and status.

        The Idempotency-Key makes a retried request safe: Twill returns the original
        document instead of rendering (and billing) a duplicate.
        """
        idempotency_key = idempotency_key or uuid.uuid4().hex
        return self._request_json(
            "POST",
            "/v1/documents",
            body={"template": template, "input": doc_input},
            extra_headers={"Idempotency-Key": idempotency_key},
        )

    def get_document(self, doc_id: int) -> dict[str, Any]:
        return self._request_json("GET", f"/v1/documents/{doc_id}")

    def wait_for_document(self, doc_id: int, timeout: float = 60.0, interval: float = 1.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            doc = self.get_document(doc_id)
            status = doc.get("status")
            if status == "succeeded":
                return doc
            if status == "failed":
                raise TwillError(f"Render failed for document {doc_id}: {doc.get('error') or 'unknown error'}")
            time.sleep(interval)
        raise TwillError(f"Timed out waiting for document {doc_id} to render.")

    def download_pdf(self, doc_id: int) -> bytes:
        """Download the finished PDF bytes. Only valid once the document has succeeded."""
        return self._request("GET", f"/v1/documents/{doc_id}/download")

    # -- internals ----------------------------------------------------------

    def _request_json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return json.loads(self._request(method, path, body, extra_headers))

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> bytes:
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
        if extra_headers:
            headers.update(extra_headers)

        data: bytes | None = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise TwillError(f"{method} {path} failed: HTTP {exc.code} — {detail}") from None
        except urllib.error.URLError as exc:
            raise TwillError(f"{method} {path} failed: {exc.reason}") from None
