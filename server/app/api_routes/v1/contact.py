"""
Public contact / demo-request endpoint for the marketing homepage.
Sends email via SMTP when configured; otherwise logs the submission so the
form still works in local/test environments.
"""

from __future__ import annotations

import logging
import os
import re
import smtplib
from email.message import EmailMessage

from flask import Blueprint, jsonify, request

bp = Blueprint("contact_v1", __name__)
logger = logging.getLogger(__name__)

CONTACT_TO = "contact@swallow-ctr.com"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX_LEN = {
    "name": 120,
    "company": 160,
    "email": 200,
    "phone": 40,
    "message": 4000,
}


def _clean(value, key: str) -> str:
    text = (value or "").strip()
    return text[: MAX_LEN[key]]


def _send_email(payload: dict) -> bool:
    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        return False

    port = int(os.getenv("SMTP_PORT") or "587")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    mail_from = (os.getenv("SMTP_FROM") or user or CONTACT_TO).strip()
    mail_to = (os.getenv("CONTACT_EMAIL_TO") or CONTACT_TO).strip()
    use_tls = (os.getenv("SMTP_USE_TLS") or "true").strip().lower() != "false"

    msg = EmailMessage()
    msg["Subject"] = f"Swallow CTR demo request — {payload['company']}"
    msg["From"] = mail_from
    msg["To"] = mail_to
    msg["Reply-To"] = payload["email"]
    body = (
        f"Name: {payload['name']}\n"
        f"Company: {payload['company']}\n"
        f"Email: {payload['email']}\n"
        f"Phone: {payload.get('phone') or '(none)'}\n\n"
        f"Message:\n{payload['message']}\n"
    )
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if use_tls:
            smtp.starttls()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)
    return True


@bp.route("/api/v1/contact", methods=["POST"])
def submit_contact():
    data = request.get_json(silent=True) or {}
    payload = {
        "name": _clean(data.get("name"), "name"),
        "company": _clean(data.get("company"), "company"),
        "email": _clean(data.get("email"), "email"),
        "phone": _clean(data.get("phone"), "phone"),
        "message": _clean(data.get("message"), "message"),
    }

    errors = {}
    if not payload["name"]:
        errors["name"] = "Name is required."
    if not payload["company"]:
        errors["company"] = "Company is required."
    if not payload["email"]:
        errors["email"] = "Email is required."
    elif not EMAIL_RE.match(payload["email"]):
        errors["email"] = "Enter a valid email."
    if not payload["message"]:
        errors["message"] = "Message is required."
    if errors:
        return jsonify({"error": "validation_failed", "fields": errors}), 400

    try:
        sent = _send_email(payload)
    except Exception:
        logger.exception("Failed to send contact email")
        return jsonify({"error": "Unable to send your request. Please try again."}), 502

    if not sent:
        # No SMTP configured — accept and log so the marketing test page works.
        logger.info(
            "Contact form (SMTP not configured): name=%s company=%s email=%s phone=%s message=%s",
            payload["name"],
            payload["company"],
            payload["email"],
            payload["phone"] or "",
            payload["message"][:500],
        )

    return jsonify({"ok": True}), 200
