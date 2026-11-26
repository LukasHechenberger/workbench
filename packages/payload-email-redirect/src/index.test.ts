import { describe, expect, mock, test } from 'bun:test';
import type { EmailAdapter, SendEmailOptions } from 'payload';
import { redirectEmails, redirectedMessage, redirectNonProductionEmails } from '.';

/** A fake adapter that records what it sends, and a logger that records warnings */
function fakeAdapter() {
  const sent: SendEmailOptions[] = [];
  const warnings: string[] = [];
  const adapter: EmailAdapter = () => ({
    name: 'fake',
    defaultFromAddress: 'noreply@example.com',
    defaultFromName: 'Shop',
    sendEmail: async (message) => {
      sent.push(message);
    },
  });
  const send = async (wrapped: EmailAdapter, message: SendEmailOptions) => {
    const payload = { logger: { warn: mock((text: string) => warnings.push(text)) } };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in with only the logger
    await wrapped({ payload: payload as never }).sendEmail(message);
  };
  return { adapter, sent, warnings, send };
}

const order = { to: 'anna@example.com', subject: 'Your order', text: 'Thanks!' };

describe('redirectedMessage', () => {
  test('goes only to `to`, naming every recipient, without cc and bcc', () => {
    expect(
      redirectedMessage(
        {
          to: [{ name: 'Anna', address: 'anna@example.com' }, 'ben@example.com'],
          cc: 'cc@example.com',
          bcc: ['bcc@example.com'],
          replyTo: 'shop@example.com',
          subject: 'Your order',
        },
        { to: 'team@example.com', label: 'Preview' },
      ),
    ).toEqual({
      to: 'team@example.com',
      replyTo: 'shop@example.com',
      subject:
        '[Preview → anna@example.com, ben@example.com, cc@example.com, bcc@example.com] Your order',
    });
  });

  test('keeps the subject of emails that already go only to `to`', () => {
    expect(
      redirectedMessage(
        { to: 'team@example.com', subject: '[Preview] Contact form' },
        { to: 'team@example.com' },
      ).subject,
    ).toBe('[Preview] Contact form');
  });

  test('takes a custom subject', () => {
    expect(
      redirectedMessage(order, {
        to: 'team@example.com',
        label: 'Staging',
        subject: (subject, { recipients, label }) => `${subject} (${label}: ${recipients.length})`,
      }).subject,
    ).toBe('Your order (Staging: 1)');
  });
});

describe('redirectEmails', () => {
  test('sends through the adapter, redirected', async () => {
    const { adapter, sent, send } = fakeAdapter();
    await send(redirectEmails(adapter, { to: 'team@example.com' }), order);
    expect(sent).toEqual([
      {
        to: 'team@example.com',
        subject: '[Redirected → anna@example.com] Your order',
        text: 'Thanks!',
      },
    ]);
  });

  test('leaves the adapter as it is without `to`', () => {
    const { adapter } = fakeAdapter();
    expect(redirectEmails(adapter, { to: undefined })).toBe(adapter);
  });
});

describe('redirectNonProductionEmails', () => {
  test('changes nothing on production', () => {
    const { adapter } = fakeAdapter();
    const environment = { VERCEL_ENV: 'production', NOTIFICATIONS_EMAIL: 'team@example.com' };
    expect(redirectNonProductionEmails(adapter, { environment })).toBe(adapter);
  });

  test.each([
    [{ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' }, 'Preview'],
    [{ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' }, 'Staging'],
    [{}, 'Local'],
  ])('redirects to NOTIFICATIONS_EMAIL elsewhere (%o)', async (vercel, label) => {
    const { adapter, sent, send } = fakeAdapter();
    const environment = { ...vercel, NOTIFICATIONS_EMAIL: ' team@example.com ' };
    await send(redirectNonProductionEmails(adapter, { environment }), order);
    expect(sent[0]).toMatchObject({
      to: 'team@example.com',
      subject: `[${label} → anna@example.com] Your order`,
    });
  });

  test('takes another address and label', async () => {
    const { adapter, sent, send } = fakeAdapter();
    const environment = { VERCEL_ENV: 'preview', NOTIFICATIONS_EMAIL: 'team@example.com' };
    await send(
      redirectNonProductionEmails(adapter, { environment, to: 'qa@example.com', label: 'QA' }),
      order,
    );
    expect(sent[0]).toMatchObject({
      to: 'qa@example.com',
      subject: '[QA → anna@example.com] Your order',
    });
  });

  test('sends nothing without an address, and warns', async () => {
    const { adapter, sent, warnings, send } = fakeAdapter();
    await send(
      redirectNonProductionEmails(adapter, { environment: { VERCEL_ENV: 'preview' } }),
      order,
    );
    expect(sent).toEqual([]);
    expect(warnings).toEqual([
      'Not sending "Your order": no NOTIFICATIONS_EMAIL to redirect emails to outside production',
    ]);
  });

  test('sends as usual without an address with `whenUnset: send`', () => {
    const { adapter } = fakeAdapter();
    expect(
      redirectNonProductionEmails(adapter, {
        environment: { VERCEL_ENV: 'preview' },
        whenUnset: 'send',
      }),
    ).toBe(adapter);
  });
});
