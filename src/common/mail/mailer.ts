/**
 * Envio de e-mails (convite e recuperação de senha) pelo mesmo serviço HTTP
 * do SIMDASH (`MAIL_API_URL` + `MAIL_API_SECRET`, header `x-api-key`).
 *
 * Nunca lança: devolve `true`/`false`. Sem as variáveis, só registra um aviso —
 * o convite continua criado e o link aparece na tela para o Desenvolvedor.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function buildInviteLink(token: string): string {
  return `${frontendUrl()}/convite/${token}`;
}

export function buildResetLink(token: string): string {
  return `${frontendUrl()}/redefinir-senha/${token}`;
}

interface LayoutParams {
  preheader: string;
  titulo: string;
  saudacao: string;
  paragrafos: string[];
  destaqueRotulo?: string;
  destaqueValor?: string;
  botao: string;
  link: string;
  aviso: string;
}

/** Layout em tabelas com estilo inline (único jeito previsível em Gmail/Outlook), cores do painel. */
function layout(p: LayoutParams): string {
  const destaque =
    p.destaqueRotulo && p.destaqueValor
      ? `<tr><td style="padding:0 40px 28px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;border-radius:10px;"><tr><td style="padding:16px 20px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:4px;">${p.destaqueRotulo}</div>
          <div style="font-size:16px;font-weight:700;color:#1a7a4a;">${p.destaqueValor}</div>
        </td></tr></table></td></tr>`
      : '';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${p.titulo}</title></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${p.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td align="center" style="background-color:#1b2a3b;padding:28px 24px;">
        <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">ONCODASH</div>
        <div style="font-size:12px;color:#9fb0c3;margin-top:4px;">Autorização prévia de medicamentos oncológicos</div>
      </td></tr>
      <tr><td style="background-color:#1a7a4a;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 40px 8px 40px;">
        <p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#1b2a3b;">${p.saudacao}</p>
        ${p.paragrafos.map((t) => `<p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">${t}</p>`).join('')}
      </td></tr>
      ${destaque}
      <tr><td align="center" style="padding:0 40px 32px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#1a7a4a" style="border-radius:999px;"><a href="${p.link}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${p.botao}</a></td>
      </tr></table></td></tr>
      <tr><td style="padding:0 40px 8px 40px;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;">Ou copie e cole este link no navegador:</p>
        <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${p.link}" style="color:#1a7a4a;text-decoration:underline;">${p.link}</a></p>
      </td></tr>
      <tr><td style="padding:24px 40px 36px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff7ed;border-left:3px solid #f59e0b;border-radius:6px;"><tr>
        <td style="padding:12px 16px;font-size:13px;color:#92400e;">${p.aviso}</td>
      </tr></table></td></tr>
      <tr><td style="background-color:#f0f2f5;padding:24px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0 0 6px 0;font-size:11px;line-height:1.5;color:#94a3b8;">OncoDash — Ministério da Saúde.</p>
        <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/**
 * Nome do remetente que aparece na caixa de entrada. O serviço de e-mail é o
 * mesmo do SIMDASH; sem `fromName` ele usa o padrão dele ("SIMDASH — Painel
 * Nacional de Radioterapia"). Dá para trocar pela variável MAIL_FROM_NAME.
 */
const REMETENTE = process.env.MAIL_FROM_NAME?.trim() || 'OncoDash — Autorização Prévia de Medicamentos Oncológicos';

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiUrl = process.env.MAIL_API_URL;
  const apiSecret = process.env.MAIL_API_SECRET;
  if (!apiUrl || !apiSecret) {
    console.warn(`[mailer] MAIL_API_URL/MAIL_API_SECRET não configurados — e-mail "${subject}" para ${to} não enviado.`);
    return false;
  }
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiSecret },
      body: JSON.stringify({ to, subject, html, fromName: REMETENTE }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      console.error(`[mailer] serviço recusou o envio para ${to} (HTTP ${res.status}): ${corpo}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[mailer] falha ao chamar o serviço de e-mail para ${to}:`, err);
    return false;
  }
}

export interface InviteEmailParams {
  to: string;
  nome: string | null;
  profile: string;
  escopo: string | null;
  inviterNome: string | null;
  link: string;
  expiresAt: Date;
}

export function sendInviteEmail(p: InviteEmailParams): Promise<boolean> {
  const nome = p.nome ? escapeHtml(p.nome) : null;
  const remetente = p.inviterNome ? escapeHtml(p.inviterNome) : 'Um gestor do OncoDash';
  const perfil = escapeHtml(p.profile) + (p.escopo ? ` · ${escapeHtml(p.escopo)}` : '');
  const expira = p.expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return send(
    p.to,
    'Convite para o OncoDash',
    layout({
      preheader: `${remetente} convidou você para o OncoDash. O convite vale até ${expira}.`,
      titulo: 'Convite para o OncoDash',
      saudacao: nome ? `Olá, ${nome}!` : 'Olá!',
      paragrafos: [`<strong>${remetente}</strong> convidou você para acessar o painel OncoDash.`],
      destaqueRotulo: 'Seu perfil de acesso',
      destaqueValor: perfil,
      botao: 'Ativar minha conta',
      link: p.link,
      aviso: `Este convite vale até <strong>${expira}</strong> e só pode ser usado uma vez. Depois disso, peça um novo a quem convidou você.`,
    }),
  );
}

export interface ResetEmailParams {
  to: string;
  nome: string | null;
  link: string;
}

export function sendPasswordResetEmail(p: ResetEmailParams): Promise<boolean> {
  const nome = p.nome ? escapeHtml(p.nome) : null;
  return send(
    p.to,
    'Redefinição de senha do OncoDash',
    layout({
      preheader: 'Use o link para criar uma nova senha. Ele vale por 1 hora.',
      titulo: 'Redefinição de senha do OncoDash',
      saudacao: nome ? `Olá, ${nome}!` : 'Olá!',
      paragrafos: [
        'Recebemos um pedido para redefinir a senha da sua conta no OncoDash.',
        'Ao criar a nova senha, todas as sessões abertas serão encerradas.',
      ],
      botao: 'Criar nova senha',
      link: p.link,
      aviso: 'Este link vale por <strong>1 hora</strong> e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.',
    }),
  );
}
