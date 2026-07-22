"""Tiny local SMTP capture server used only by automated tests."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.getenv("E2E_SMTP_OUTPUT", ROOT / ".tmp" / "e2e-smtp" / "messages.jsonl"))
PORT = int(os.getenv("E2E_SMTP_PORT", "1025"))
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text("", encoding="utf-8")


async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    writer.write(b"220 e2e-mail.local ESMTP ready\r\n")
    await writer.drain()
    data_mode = False
    auth_login_pending = False
    message_lines: list[bytes] = []
    envelope: dict[str, object] = {"mailFrom": "", "recipients": []}
    while not reader.at_eof():
        line = await reader.readline()
        if not line:
            break
        command = line.decode("utf-8", errors="replace").rstrip("\r\n")
        if data_mode:
            if command == ".":
                payload = {
                    **envelope,
                    "data": b"\n".join(message_lines).decode("utf-8", errors="replace"),
                }
                with OUTPUT.open("a", encoding="utf-8") as handle_out:
                    handle_out.write(json.dumps(payload) + "\n")
                data_mode = False
                message_lines = []
                envelope = {"mailFrom": "", "recipients": []}
                writer.write(b"250 2.0.0 captured\r\n")
            else:
                message_lines.append(line.rstrip(b"\r\n"))
            await writer.drain()
            continue
        upper = command.upper()
        if auth_login_pending:
            auth_login_pending = False
            writer.write(b"235 2.7.0 authenticated\r\n")
        elif upper.startswith(("EHLO", "HELO")):
            writer.write(b"250-e2e-mail.local\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 52428800\r\n")
        elif upper.startswith("AUTH PLAIN"):
            writer.write(b"235 2.7.0 authenticated\r\n")
        elif upper.startswith("AUTH LOGIN"):
            auth_login_pending = True
            writer.write(b"334 VXNlcm5hbWU6\r\n")
        elif upper.startswith("MAIL FROM:"):
            envelope["mailFrom"] = command.split(":", 1)[1].strip()
            writer.write(b"250 2.1.0 sender accepted\r\n")
        elif upper.startswith("RCPT TO:"):
            envelope["recipients"].append(command.split(":", 1)[1].strip())
            writer.write(b"250 2.1.5 recipient accepted\r\n")
        elif upper == "DATA":
            data_mode = True
            writer.write(b"354 end data with <CR><LF>.<CR><LF>\r\n")
        elif upper == "RSET":
            envelope = {"mailFrom": "", "recipients": []}
            writer.write(b"250 2.0.0 reset\r\n")
        elif upper == "NOOP":
            writer.write(b"250 2.0.0 ok\r\n")
        elif upper == "QUIT":
            writer.write(b"221 2.0.0 bye\r\n")
            await writer.drain()
            break
        else:
            writer.write(b"250 2.0.0 ok\r\n")
        await writer.drain()
    writer.close()
    await writer.wait_closed()


async def main() -> None:
    server = await asyncio.start_server(handle, "127.0.0.1", PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
