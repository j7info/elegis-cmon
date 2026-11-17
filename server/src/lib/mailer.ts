import nodemailer from 'nodemailer';

type MailEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | 'MAIL_HOST'
  | 'MAIL_PORT'
  | 'MAIL_USERNAME'
  | 'MAIL_PASSWORD'
  | 'MAIL_FROM_ADDRESS'
  | 'MAIL_FROM_NAME'
  | 'MAIL_SECURE'
  | 'MAIL_TLS_REJECT_UNAUTHORIZED'
>>;

export const resolveMailConfig = (env: MailEnvironment = process.env) => {
  const host = env.MAIL_HOST?.trim();
  const user = env.MAIL_USERNAME?.trim();
  const pass = env.MAIL_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error('Configuração de e-mail incompleta');
  }

  const port = Number.parseInt(env.MAIL_PORT || '587', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MAIL_PORT inválida');
  }

  return {
    transport: {
      host,
      port,
      secure: env.MAIL_SECURE === 'true' || (!env.MAIL_SECURE && port === 465),
      auth: { user, pass },
      tls: {
        rejectUnauthorized: env.MAIL_TLS_REJECT_UNAUTHORIZED !== 'false',
      },
    },
    fromAddress: env.MAIL_FROM_ADDRESS?.trim() || user,
    fromName: env.MAIL_FROM_NAME?.trim() || 'Elegis - Câmara Municipal de Ourilândia do Norte',
  };
};

export const sendRecoveryEmail = async (to: string, token: string, baseUrl: string) => {
  const config = resolveMailConfig();
  const transporter = nodemailer.createTransport(config.transport);
  const resetLink = `${baseUrl}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: `"${config.fromName}" <${config.fromAddress}>`,
    to,
    subject: 'Recuperação de Senha - Sistema de Certificação e Presença',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #115e59; text-align: center;">Recuperação de Senha</h2>
        <p>Olá,</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Sistema de Certificação e Presença</strong> da Câmara Municipal de Ourilândia do Norte.</p>
        <p>Para criar uma nova senha, clique no botão abaixo:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0f766e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Ou copie e cole o link no seu navegador: <br><a href="${resetLink}" style="color: #0f766e; word-break: break-all;">${resetLink}</a></p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">Se você não solicitou isso, pode ignorar este e-mail em segurança. O link expira em 2 horas.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};
