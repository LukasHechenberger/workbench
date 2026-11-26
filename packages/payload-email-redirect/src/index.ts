import type { EmailAdapter, SendEmailOptions } from 'payload';

/**
 * Sends a Payload app's emails to one address instead of their recipients, e.g. on preview
 * deployments, whose database is a copy of production's with real customers' addresses. The
 * original recipients are named in the subject (`[Preview → anna@example.com] Your order`).
 */

export type RedirectInfo = {
  /** Everyone the email was for: `to`, `cc` and `bcc` */
  recipients: string[];
  label: string;
};

export type RedirectOptions = {
  /** Where every email goes. Without it, the adapter is returned unchanged. */
  to: string | undefined;
  /** The subject's prefix (default: `Redirected`) */
  label?: string;
  /**
   * The redirected email's subject. By default `[label → recipients] subject`, and unchanged for
   * emails that already go only to `to` (e.g. the app's own notifications to that address).
   */
  subject?: (subject: string, info: RedirectInfo) => string;
};

/** The addresses of a `to`, `cc` or `bcc`, as text */
function addresses(value: SendEmailOptions['to']): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => (typeof entry === 'string' ? entry : entry.address));
}

const defaultSubject = (subject: string, { recipients, label }: RedirectInfo) =>
  `[${label} → ${recipients.join(', ')}] ${subject}`;

/** The message as it's sent when redirected (exported for the tests) */
export function redirectedMessage(
  message: SendEmailOptions,
  { to, label = 'Redirected', subject = defaultSubject }: RedirectOptions & { to: string },
): SendEmailOptions {
  const recipients = [message.to, message.cc, message.bcc].flatMap((value) => addresses(value));
  // cc and bcc are recipients too: dropped, only named in the subject
  const { cc: _cc, bcc: _bcc, ...rest } = message;
  const alreadyThere = recipients.every((address) => address === to);

  return {
    ...rest,
    to,
    subject: alreadyThere ? message.subject : subject(message.subject ?? '', { recipients, label }),
  };
}

/** Wraps an email adapter so that it sends every email to `to` (see `RedirectOptions`) */
export function redirectEmails(adapter: EmailAdapter, options: RedirectOptions): EmailAdapter {
  const { to } = options;
  if (!to) return adapter;

  return (context) => {
    const initialized = adapter(context);
    return {
      ...initialized,
      sendEmail: (message) => initialized.sendEmail(redirectedMessage(message, { ...options, to })),
    };
  };
}

export type NonProductionOptions = Partial<Omit<RedirectOptions, 'to'>> & {
  /** Where every email goes outside production (default: `process.env.NOTIFICATIONS_EMAIL`) */
  to?: string;
  /**
   * Outside production without an address: `block` sends nothing and logs a warning (the
   * default), so a forgotten variable can't email real recipients; `send` sends as usual
   */
  whenUnset?: 'block' | 'send';
  /** The environment variables to read (default: `process.env`), e.g. for tests */
  environment?: Record<string, string | undefined>;
};

/** The environment as Vercel sets it at runtime: `production`, `preview`, a custom one, or local */
function vercelEnvironment(environment: Record<string, string | undefined>) {
  const name = environment.VERCEL_TARGET_ENV || environment.VERCEL_ENV;
  return {
    production: name === 'production',
    label: name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Local',
  };
}

/**
 * `redirectEmails` configured from Vercel's environment: everywhere except production (Vercel's
 * `VERCEL_ENV`, so locally too), to `NOTIFICATIONS_EMAIL`, labelled with the environment
 * (`Preview`, a custom environment's name, or `Local`). Without an address it sends nothing.
 */
export function redirectNonProductionEmails(
  adapter: EmailAdapter,
  { to, whenUnset = 'block', environment = process.env, ...options }: NonProductionOptions = {},
): EmailAdapter {
  const { production, label } = vercelEnvironment(environment);
  if (production) return adapter;

  const address = (to ?? environment.NOTIFICATIONS_EMAIL)?.trim();
  if (address) return redirectEmails(adapter, { label, ...options, to: address });
  if (whenUnset === 'send') return adapter;

  return (context) => {
    const initialized = adapter(context);
    return {
      ...initialized,
      sendEmail: async (message) => {
        context.payload.logger.warn(
          `Not sending "${message.subject ?? ''}": no NOTIFICATIONS_EMAIL to redirect emails to outside production`,
        );
      },
    };
  };
}
