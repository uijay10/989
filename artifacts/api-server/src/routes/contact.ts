import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-check";

const router: IRouter = Router();

const ADMIN_NOTIFY_EMAIL = "contact@web3release.com";

async function sendAdminNotifyEmail(fromName: string, fromEmail: string, subject: string, message: string) {
  const apiKey = process.env.RESEND_API_KEY ?? process.env.resend;
  if (!apiKey) return;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Web3 Release <noreply@web3release.com>",
      to: [ADMIN_NOTIFY_EMAIL],
      subject: `📬 新联系消息：${subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
          <h2 style="color: #2563eb; margin-bottom: 4px;">收到新联系消息</h2>
          <p style="color: #64748b; font-size: 13px; margin-bottom: 20px;">请登录管理员面板查看并回复</p>
          <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px;">
            <tr><td style="padding:8px 12px; background:#f1f5f9; font-weight:600; width:80px;">发件人</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">${fromName}</td></tr>
            <tr><td style="padding:8px 12px; background:#f1f5f9; font-weight:600;">邮箱</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">${fromEmail}</td></tr>
            <tr><td style="padding:8px 12px; background:#f1f5f9; font-weight:600;">主题</td>
                <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;">${subject.replace(/</g, "&lt;")}</td></tr>
          </table>
          <div style="background:#f8fafc; border-left:4px solid #2563eb; padding:16px 20px; border-radius:4px; margin-bottom:24px;">
            <p style="margin:0; font-size:15px; color:#1e293b; white-space:pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          </div>
          <a href="https://web3release.com/admin" style="display:inline-block; padding:10px 22px; background:#2563eb; color:#fff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:600;">
            前往管理员面板回复 →
          </a>
          <p style="color:#94a3b8; font-size:12px; margin-top:24px;">Web3 Release Team · 此为系统自动通知</p>
        </div>
      `,
    });
    console.log("[contact] Admin notify email sent");
  } catch (e) {
    console.error("[contact] Admin notify email failed:", e);
  }
}

async function sendReplyEmail(to: string, toName: string, subject: string, replyContent: string) {
  const apiKey = process.env.RESEND_API_KEY ?? process.env.resend;
  if (!apiKey) {
    console.warn("[contact] Resend API key not set — reply stored but email not sent");
    return false;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "Web3 Release <noreply@web3release.com>",
      to: [to],
      subject: `Re: ${subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
          <h2 style="color: #2563eb; margin-bottom: 8px;">Web3 Release</h2>
          <p style="color: #64748b; font-size: 13px; margin-bottom: 24px;">来自管理团队的回复</p>
          <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 4px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 15px; color: #1e293b; white-space: pre-wrap;">${replyContent.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          </div>
          <p style="color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            Hi ${toName}，这是针对您发送的消息「${subject}」的回复。<br/>
            Web3 Release Team
          </p>
        </div>
      `,
    });
    if (error) { console.error("[contact] Resend error:", error); return false; }
    return true;
  } catch (e) {
    console.error("[contact] Email send failed:", e);
    return false;
  }
}

// ── Public: submit a contact message ──────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body as Record<string, unknown>;
    if (!name || !email || !subject || !message ||
        typeof name !== "string" || typeof email !== "string" ||
        typeof subject !== "string" || typeof message !== "string") {
      res.status(400).json({ error: "name / email / subject / message 均为必填" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "邮箱格式不正确" });
      return;
    }
    if (message.trim().length < 10) {
      res.status(400).json({ error: "消息内容至少 10 个字符" });
      return;
    }
    await db.execute(sql`
      INSERT INTO contact_messages (name, email, subject, message, status)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${subject.trim()}, ${message.trim()}, 'unread')
    `);
    // 异步发送管理员通知邮件（不阻塞响应）
    sendAdminNotifyEmail(name.trim(), email.trim(), subject.trim(), message.trim()).catch(() => {});
    res.json({ ok: true, message: "消息已发送，我们将尽快回复您" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Admin: list all messages ───────────────────────────────────────────────
router.get("/", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let query = `SELECT id, name, email, subject, LEFT(message, 200) AS message_preview,
                        message, status, reply, replied_at, created_at
                 FROM contact_messages`;
    if (status && ["unread", "read", "replied"].includes(status)) {
      query += ` WHERE status = '${status}'`;
    }
    query += ` ORDER BY created_at DESC LIMIT 200`;
    const rows = await db.execute(sql.raw(query));
    res.json({ messages: rows.rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Admin: mark as read ────────────────────────────────────────────────────
router.patch("/:id/read", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`
      UPDATE contact_messages SET status = 'read' WHERE id = ${id} AND status = 'unread'
    `);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Admin: reply to a message ──────────────────────────────────────────────
router.post("/:id/reply", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { reply } = req.body as Record<string, unknown>;
    if (!reply || typeof reply !== "string" || !reply.trim()) {
      res.status(400).json({ error: "回复内容不能为空" });
      return;
    }

    // Fetch the original message for email context
    const rows = await db.execute(sql`SELECT name, email, subject FROM contact_messages WHERE id = ${id}`);
    const msg = rows.rows[0] as { name: string; email: string; subject: string } | undefined;
    if (!msg) { res.status(404).json({ error: "消息不存在" }); return; }

    await db.execute(sql`
      UPDATE contact_messages
      SET reply = ${reply.trim()}, status = 'replied', replied_at = ${Date.now()}
      WHERE id = ${id}
    `);

    const emailSent = await sendReplyEmail(msg.email, msg.name, msg.subject, reply.trim());
    res.json({ ok: true, emailSent });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Admin: delete a message ────────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM contact_messages WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
