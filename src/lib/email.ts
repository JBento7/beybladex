import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM ?? "LBL <noreply@lbl.com>";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const link = `${BASE_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Confirme seu cadastro na LBL",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;max-width:560px;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#c8102e,#8b0000);padding:32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">🌀</div>
            <div style="font-size:22px;font-weight:900;color:#f0a500;letter-spacing:1px;">LIGA BEYBLADE LONDRINA</div>
            <div style="font-size:12px;color:#ffcccc;margin-top:4px;">Bem-vindo à LBL!</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 32px;">
            <h1 style="color:#ffffff;font-size:20px;margin:0 0 12px;">Olá, ${name}! 👋</h1>
            <p style="color:#aaaaaa;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Seu cadastro na Liga Beyblade Londrina foi realizado com sucesso. Para ativar sua conta e acessar os campeonatos, confirme seu e-mail clicando no botão abaixo.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${link}"
                style="display:inline-block;background:#f0a500;color:#000000;font-weight:900;font-size:16px;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;">
                ✅ Confirmar E-mail
              </a>
            </div>
            <p style="color:#666666;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Se o botão não funcionar, copie e cole este link no seu navegador:
            </p>
            <p style="word-break:break-all;background:#252525;border-radius:8px;padding:12px;font-size:12px;color:#f0a500;margin:0 0 24px;">${link}</p>
            <p style="color:#555555;font-size:12px;margin:0;">
              Este link expira em <strong style="color:#aaaaaa">24 horas</strong>. Se você não criou essa conta, ignore este e-mail.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#111111;padding:20px 32px;text-align:center;border-top:1px solid #2a2a2a;">
            <p style="color:#444444;font-size:12px;margin:0;">© 2025 Liga Beyblade Londrina · Londrina, PR</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

export async function isEmailConfigured(): Promise<boolean> {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
