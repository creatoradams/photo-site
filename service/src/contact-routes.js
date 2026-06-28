import express from "express";
import rateLimit from "express-rate-limit";
import { CONTACT_TO } from "./config.js";
import { normalizeEmail } from "./util.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createContactRoutes({ checkRate, mailer }) {
  const router = express.Router();
  const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

  router.post("/api/contact", contactLimiter, async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 200);
    const email = normalizeEmail(req.body?.email);
    const message = String(req.body?.message || "").trim().slice(0, 5000);
    // Honeypot: real users never see/fill this field. Bots usually do.
    const honeypot = String(req.body?.x_field_check || "").trim();

    const emailOk = EMAIL_RE.test(email);
    console.log(
      `[contact] received ip=${req.ip} emailValid=${emailOk} msgLen=${message.length} honeypot=${honeypot ? "TRIPPED" : "ok"}`
    );

    if (honeypot) {
      console.log("[contact] dropped as spam (honeypot filled)");
      return res.json({ ok: true });
    }
    if (!emailOk) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (message.length < 2) {
      return res.status(400).json({ error: "Please enter a message." });
    }

    if (!checkRate(`contact:${req.ip}`, 5)) {
      console.log("[contact] rate limited", req.ip);
      return res.status(429).json({ error: "Too many messages right now. Please try again later." });
    }

    try {
      const info = await mailer.sendContactEmail({ name, email, message });
      if (!info?.dev) {
        console.log(`[contact] sent to ${CONTACT_TO} messageId=${info.messageId} response=${info.response}`);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("Contact SMTP error:", err);
      res.status(500).json({ error: "Could not send your message. Please email directly." });
    }
  });

  return router;
}
