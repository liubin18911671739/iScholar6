/**
 * Minimal dependency-free SMTP client (lib/server/smtp.ts)
 *
 * Functionality:
 * - Sends a plain-text UTF-8 email over SMTP using Node's `net`/`tls`.
 * - Supports implicit TLS (`SMTP_SECURE=true` or port 465) and STARTTLS.
 * - Reads configuration from `SMTP_HOST/PORT/SECURE/STARTTLS/USER/PASS/FROM/HELO`.
 *
 * Notes:
 * - Server-only. `sendMail` returns false (never throws) when SMTP is unconfigured,
 *   so callers can degrade gracefully. Transport errors still throw to the caller.
 */

import net from "node:net";
import tls from "node:tls";

/** A plain-text email to deliver. */
export interface MailInput {
  to: string;
  subject: string;
  text: string;
}

interface SmtpConfig {
  host?: string;
  port: number;
  secure: boolean;
  starttls: boolean;
  user?: string;
  pass?: string;
  from?: string;
  helo: string;
}

function config(): SmtpConfig {
  const port = Number(process.env.SMTP_PORT ?? (process.env.SMTP_SECURE === "true" ? "465" : "587"));
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    starttls: process.env.SMTP_STARTTLS !== "false",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    helo: process.env.SMTP_HELO ?? "localhost",
  };
}

/** True when SMTP host + from address are configured. */
export function isMailConfigured(): boolean {
  const cfg = config();
  return Boolean(cfg.host && cfg.from);
}

/** Line-buffered SMTP response reader. */
class ResponseReader {
  private buffer = "";
  private lines: string[] = [];
  private notify: (() => void) | null = null;

  constructor(socket: net.Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      let index: number;
      while ((index = this.buffer.indexOf("\r\n")) >= 0) {
        this.lines.push(this.buffer.slice(0, index));
        this.buffer = this.buffer.slice(index + 2);
      }
      this.notify?.();
    });
  }

  private async readLine(): Promise<string> {
    while (this.lines.length === 0) {
      await new Promise<void>((resolve) => {
        this.notify = resolve;
      });
      this.notify = null;
    }
    return this.lines.shift() as string;
  }

  /** Read one full (possibly multi-line) SMTP response. */
  async response(): Promise<{ code: number; lines: string[] }> {
    const collected: string[] = [];
    let code = 0;
    for (;;) {
      const line = await this.readLine();
      collected.push(line);
      code = Number(line.slice(0, 3));
      if (line.length < 4 || line[3] !== "-") break;
    }
    return { code, lines: collected };
  }
}

async function sendCommand(
  socket: net.Socket,
  reader: ResponseReader,
  command: string,
  expect: number[]
): Promise<void> {
  socket.write(`${command}\r\n`);
  const { code } = await reader.response();
  if (!expect.includes(code)) throw new Error(`SMTP ${command.split(" ")[0]} failed: ${code}`);
}

/** Base64-encode and wrap to SMTP-safe line length. */
function base64Body(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

/**
 * Send a plain-text email. Returns false when SMTP is not configured.
 * Throws on transport/protocol failure.
 */
export async function sendMail({ to, subject, text }: MailInput): Promise<boolean> {
  const cfg = config();
  if (!cfg.host || !cfg.from) return false;

  let socket: net.Socket;
  if (cfg.secure) {
    const secureSocket = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    await new Promise<void>((resolve, reject) => {
      secureSocket.once("secureConnect", () => resolve());
      secureSocket.once("error", reject);
    });
    socket = secureSocket;
  } else {
    socket = net.connect({ host: cfg.host, port: cfg.port });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });
  }

  try {
    let reader = new ResponseReader(socket);
    const greeting = await reader.response();
    if (greeting.code !== 220) throw new Error(`SMTP greeting ${greeting.code}`);

    await sendCommand(socket, reader, `EHLO ${cfg.helo}`, [250]);

    if (!cfg.secure && cfg.starttls) {
      await sendCommand(socket, reader, "STARTTLS", [220]);
      const upgraded = tls.connect({ socket, servername: cfg.host });
      await new Promise<void>((resolve, reject) => {
        upgraded.once("secureConnect", () => resolve());
        upgraded.once("error", reject);
      });
      socket = upgraded;
      reader = new ResponseReader(socket);
      await sendCommand(socket, reader, `EHLO ${cfg.helo}`, [250]);
    }

    if (cfg.user && cfg.pass) {
      socket.write("AUTH LOGIN\r\n");
      let auth = await reader.response();
      if (auth.code !== 334) throw new Error(`SMTP auth init ${auth.code}`);
      socket.write(`${Buffer.from(cfg.user).toString("base64")}\r\n`);
      auth = await reader.response();
      if (auth.code !== 334) throw new Error(`SMTP auth user ${auth.code}`);
      socket.write(`${Buffer.from(cfg.pass).toString("base64")}\r\n`);
      auth = await reader.response();
      if (auth.code !== 235) throw new Error(`SMTP auth pass ${auth.code}`);
    }

    await sendCommand(socket, reader, `MAIL FROM:<${cfg.from}>`, [250]);
    await sendCommand(socket, reader, `RCPT TO:<${to}>`, [250, 251]);
    await sendCommand(socket, reader, "DATA", [354]);

    const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
    const message = [
      `From: ${cfg.from}`,
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Body(text),
    ].join("\r\n");
    socket.write(`${message}\r\n.\r\n`);
    const done = await reader.response();
    if (done.code !== 250) throw new Error(`SMTP data ${done.code}`);

    socket.write("QUIT\r\n");
    return true;
  } finally {
    socket.end();
    socket.destroy();
  }
}
