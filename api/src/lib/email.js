/**
 * email.js — Transactional email (verification and password-reset links)
 *
 * Sent through the Resend HTTP API (Workers cannot open SMTP connections):
 *   RESEND_API_KEY  secret  — `wrangler secret put RESEND_API_KEY`
 *   EMAIL_FROM      var     — e.g. "RealRate <no-reply@geekio.org>" (a domain verified in Resend)
 * For local development without a provider, EMAIL_DEBUG_LOG="true" writes each email (with
 * its link) to the worker log instead of sending it.
 */

import { logger } from "./logger.js";
import { AppError } from "./AppError.js";

const RESEND_URL = "https://api.resend.com/emails";

/** Whether this deployment can deliver email at all */
export function isEmailConfigured(env) {
  return Boolean(String(env?.RESEND_API_KEY || "").trim() && String(env?.EMAIL_FROM || "").trim())
    || String(env?.EMAIL_DEBUG_LOG || "") === "true";
}

/**
 * @param {object} env
 * @param {{ to: string, subject: string, html: string, text: string }} message
 */
export async function sendEmail(env, { to, subject, html, text }) {
  const apiKey = String(env?.RESEND_API_KEY || "").trim();
  const from = String(env?.EMAIL_FROM || "").trim();

  if (!apiKey || !from) {
    if (String(env?.EMAIL_DEBUG_LOG || "") === "true") {
      logger.info("[email:debug] not sent (no provider configured)", { to, subject, text });
      return;
    }
    throw new AppError("ارسال ایمیل روی سرور تنظیم نشده است. لطفاً بعداً دوباره تلاش کنید یا با گوگل وارد شوید.", 503, "EMAIL_NOT_CONFIGURED");
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error("Email provider rejected a message", { status: res.status, detail: detail.slice(0, 300) });
    throw new AppError("ارسال ایمیل ناموفق بود. لطفاً چند دقیقه دیگر دوباره تلاش کنید.", 502, "EMAIL_SEND_FAILED");
  }
}

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal RTL layout that renders in every mail client (tables + inline styles) */
function layout({ title, intro, buttonLabel, url, outro }) {
  const html = `<!doctype html>
<html lang="fa" dir="rtl"><body style="margin:0;padding:24px;background:#0b0f17;font-family:Tahoma,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#111726;border-radius:14px;padding:28px;color:#e5e7eb;text-align:right;" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:bold;color:#fde68a;padding-bottom:14px;">RealRate</td></tr>
<tr><td style="font-size:16px;font-weight:bold;padding-bottom:10px;">${escapeHtml(title)}</td></tr>
<tr><td style="font-size:14px;line-height:1.9;color:#cbd5e1;padding-bottom:20px;">${escapeHtml(intro)}</td></tr>
${url ? `<tr><td style="padding-bottom:20px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;">${escapeHtml(buttonLabel)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.8;color:#94a3b8;padding-bottom:16px;direction:ltr;text-align:left;word-break:break-all;">${escapeHtml(url)}</td></tr>` : ""}
<tr><td style="font-size:12px;line-height:1.9;color:#94a3b8;">${escapeHtml(outro)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, "", intro, url ? `\n${buttonLabel}: ${url}` : "", "", outro].join("\n");
  return { html, text };
}

export function verificationEmail(url) {
  return {
    subject: "تأیید ایمیل حساب RealRate",
    ...layout({
      title: "ایمیل خود را تأیید کنید",
      intro: "برای فعال شدن حساب RealRate، روی دکمه زیر بزنید. این لینک ۲۴ ساعت اعتبار دارد و فقط یک بار قابل استفاده است.",
      buttonLabel: "تأیید ایمیل و ورود",
      url,
      outro: "اگر شما در RealRate ثبت‌نام نکرده‌اید، این ایمیل را نادیده بگیرید؛ بدون تأیید، حسابی فعال نمی‌شود.",
    }),
  };
}

export function passwordResetEmail(url) {
  return {
    subject: "بازیابی رمز عبور RealRate",
    ...layout({
      title: "تعیین رمز عبور جدید",
      intro: "برای تعیین رمز عبور جدید روی دکمه زیر بزنید. این لینک یک ساعت اعتبار دارد و فقط یک بار قابل استفاده است. پس از تغییر رمز، از همه دستگاه‌های دیگر خارج می‌شوید.",
      buttonLabel: "تعیین رمز جدید",
      url,
      outro: "اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید؛ رمز فعلی تغییری نمی‌کند.",
    }),
  };
}

export function accountExistsEmail(loginUrl, resetUrl) {
  return {
    subject: "شما از قبل حساب RealRate دارید",
    ...layout({
      title: "این ایمیل قبلاً ثبت شده است",
      intro: "کسی (احتمالاً خود شما) با این ایمیل درخواست ثبت‌نام داد، اما حساب شما از قبل وجود دارد. می‌توانید با گوگل یا رمز عبور وارد شوید؛ اگر رمز ندارید یا آن را فراموش کرده‌اید، از لینک زیر رمز جدید تعیین کنید.",
      buttonLabel: "تعیین یا بازیابی رمز عبور",
      url: resetUrl,
      outro: `ورود: ${loginUrl}\nاگر این درخواست از طرف شما نبوده، کاری لازم نیست.`,
    }),
  };
}
