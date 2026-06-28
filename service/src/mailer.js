import nodemailer from "nodemailer";
import { SMTP, SITE_URL, MAGIC_MINUTES, CONTACT_TO } from "./config.js";
import { escapeHtml } from "./util.js";

export function createMailer() {
  const transporter = SMTP.host
    ? nodemailer.createTransport({
        host: SMTP.host,
        port: SMTP.port,
        secure: SMTP.secure,
        auth: { user: SMTP.user, pass: SMTP.pass },
      })
    : null;

  async function sendMagicLink(slug, email, token) {
    const link = `${SITE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
    if (!transporter) {
      console.log("[dev] Magic link for", email, ":", link);
      return;
    }
    await transporter.sendMail({
      from: SMTP.from,
      to: email,
      subject: "Your gallery access link",
      text: `Click to access your gallery (expires in ${MAGIC_MINUTES} minutes):\n\n${link}\n`,
      html: `<p>Click to access your gallery (expires in ${MAGIC_MINUTES} minutes):</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  async function sendContactEmail({ name, email, message }) {
    if (!transporter) {
      console.log("[dev] Contact message from", email, "-", name, "\n", message);
      return { dev: true };
    }
    return transporter.sendMail({
      from: { name: "adamsphoto.net", address: SMTP.from },
      to: CONTACT_TO,
      replyTo: name ? { name, address: email } : email,
      subject: `New inquiry from ${name || email}`,
      text: `New website inquiry\n\nFrom: ${name || "(no name given)"} <${email}>\n\n${message}\n\n— Sent from the adamsphoto.net contact form\n`,
      html: `<p>New website inquiry</p><p><strong>From:</strong> ${escapeHtml(name || "(no name given)")} &lt;${escapeHtml(email)}&gt;</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p><hr /><p style="color:#888;font-size:12px">Sent from the adamsphoto.net contact form. Reply directly to respond to the sender.</p>`,
    });
  }

  return { transporter, sendMagicLink, sendContactEmail };
}
