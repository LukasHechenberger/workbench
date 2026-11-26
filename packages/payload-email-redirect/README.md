# @lhechenberger/payload-email-redirect

Sends a [Payload](https://payloadcms.com) app's emails to one address outside production, so previews never reach real recipients.

Preview deployments often run on a copy of production's database, with real customers' addresses: an order email or a sign-in link sent from a preview would reach them. This wraps Payload's email adapter so that, outside production, every email goes to one address instead, with the original recipients in the subject:

```
[Preview → anna@example.com] Your order
```

## Installation

Needs Payload 3.90 or newer. Works with any email adapter (e.g. `@payloadcms/email-nodemailer`, `@payloadcms/email-resend`).

```sh
npm install @lhechenberger/payload-email-redirect
# or
bun add @lhechenberger/payload-email-redirect
```

## On Vercel

```ts
// payload.config.ts
import { buildConfig } from 'payload';
import { resendAdapter } from '@payloadcms/email-resend';
import { redirectNonProductionEmails } from '@lhechenberger/payload-email-redirect';

export default buildConfig({
  // ...
  email: redirectNonProductionEmails(
    resendAdapter({
      apiKey: process.env.RESEND_API_KEY!,
      defaultFromAddress: 'shop@example.com',
      defaultFromName: 'Shop',
    }),
  ),
});
```

- **When:** everywhere except production, read from Vercel's `VERCEL_ENV` at runtime (any framework). Without Vercel (locally) it counts as not production.
- **Where to:** `NOTIFICATIONS_EMAIL`, or the `to` option. Set the variable only for Preview (and Development) in Vercel.
- **Label:** the environment, e.g. `Preview`, a custom environment's name (`VERCEL_TARGET_ENV`, e.g. `Staging`), or `Local`; or the `label` option.
- **Without an address** outside production, nothing is sent and a warning is logged, so a forgotten variable can't reach real recipients. `whenUnset: 'send'` sends as usual instead.

### With Turborepo

Deployed functions read the variables at runtime, so Turborepo doesn't affect them. Tasks that Turborepo runs (`build`, and scripts that start Payload, such as seeding or migrations) only see environment variables listed in `turbo.json` (strict mode, the default). Without them, such a task counts as not production: on a production build it would redirect or block emails that are sent during the build. Vercel also warns about `NOTIFICATIONS_EMAIL` as a missing variable. List them for every task that runs Payload:

```json
// turbo.json
{
  "tasks": {
    "build": {
      "env": ["NOTIFICATIONS_EMAIL", "VERCEL_ENV", "VERCEL_TARGET_ENV"]
    }
  }
}
```

Use `env` rather than `passThroughEnv`: with `env`, the values are part of the cache key, so a cached preview build is never reused for production.

## Anywhere else

```ts
import { redirectEmails } from '@lhechenberger/payload-email-redirect';

redirectEmails(adapter, {
  to: process.env.STAGING ? 'team@example.com' : undefined, // undefined: no redirect
  label: 'Staging',
  // optional, default `[label → recipients] subject`
  subject: (subject, { recipients, label }) => `${subject} (${label} for ${recipients.join(', ')})`,
});
```

- cc and bcc are dropped (they're named in the subject), `replyTo` is kept.
- An email that already goes only to the redirect address (e.g. the app's own notifications) keeps its subject.

## License

[MIT](LICENSE)
