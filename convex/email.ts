import { Resend } from "@convex-dev/resend";

import { components } from "./_generated/api";
import { env } from "./_generated/server";

// Defaults to test mode (no real sends, and only Resend's own approved test
// addresses are accepted as `to`) unless RESEND_IS_PROD is explicitly set to
// "true" — same safe-when-unset direction as SITE_URL/JWKS in
// convex.config.ts. There's no separate dev deployment (see convex/auth.ts),
// so this has to be an explicit flag rather than something inferred from
// NODE_ENV. Convex env vars are always strings (see convex.config.ts), so
// this can't be declared v.boolean() — "true" is the one value that flips
// it, everything else (including unset) stays in test mode.
export const resend = new Resend(components.resend, {
  testMode: env.RESEND_IS_PROD !== "true",
});

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// Local-part + display name are code, not env: only the domain
// (RESEND_FROM_DOMAIN) is genuinely deployment-specific (which domain got
// verified in Resend). Keeping "invites" and "Ai Cloud" here means changing
// either is a one-line code edit, not a redeploy-and-reconfigure-env dance.
// Falls back to Resend's own sandbox sender when no domain is configured yet
// (e.g. local dev, still in test mode).
export const INVITE_FROM_ADDRESS = env.RESEND_FROM_DOMAIN
  ? `Ai Cloud <invites@${env.RESEND_FROM_DOMAIN}>`
  : "onboarding@resend.dev";

export const INVITE_EMAIL_SUBJECT = "You're invited to join Ai Cloud";

// Inline HTML, not a Resend dashboard Template: this app plans to localize
// transactional email later, which Resend's own template variables don't
// support well, so the content needs to live in code where it can eventually
// route through the same i18n machinery as the rest of the app instead of a
// second, English-only copy sitting in Resend's dashboard.
export const buildInviteEmailHtml = ({
  inviterName,
  link,
  role,
}: {
  inviterName: string;
  link: string;
  role: string;
}) => {
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const safeLink = escapeHtml(link);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection" />
    <title>You've been invited to join Ai Cloud.</title>
    <style>
      @media (prefers-color-scheme: dark){li::marker{color:#c4c4c4}}
    </style>
  </head>
  <body dir="ltr" lang="en" style="background-color:#ffffff;margin:0;padding:0">
    <div
      style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0"
      data-skip-in-text="true"
    >
      You've been invited to join Ai Cloud.
    </div>
    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
      <tbody>
        <tr>
          <td
            dir="ltr"
            lang="en"
            style="margin:0;padding:0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;font-size:1em;min-height:100%;line-height:155%;background-color:#ffffff"
          >
            <table
              align="left"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="max-width:600px;align:left;width:100%;color:#000000;background-color:#ffffff;border-radius:0px;border-color:#000000;line-height:155%"
            >
              <tbody>
                <tr style="width:100%">
                  <td style="padding-top:0px;padding-right:0px;padding-bottom:0px;padding-left:0px">
                    <h1
                      style="margin:0;padding:0;font-size:2.25em;line-height:1.44em;padding-top:0.389em;font-weight:600"
                    >
                      You're invited to join Ai Cloud
                    </h1>
                    <p style="margin:0;padding:0;font-size:1em;padding-top:0.5em;padding-bottom:0.5em">
                      Hi there,
                    </p>
                    <p style="margin:0;padding:0;font-size:1em;padding-top:0.5em;padding-bottom:0.5em">
                      ${safeInviterName} has invited you to join Ai Cloud with ${safeRole} access.
                    </p>
                    <p style="margin:0;padding:0;font-size:1em;padding-top:0.5em;padding-bottom:0.5em">
                      Accepting takes less than a minute, and this link expires in 7 days.
                    </p>
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                      <tbody style="width:100%">
                        <tr style="width:100%">
                          <td align="left" data-id="__react-email-column">
                            <a
                              class="button"
                              href="${safeLink}"
                              style="line-height:100%;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;margin:0;padding:0;padding-top:7px;padding-right:12px;padding-bottom:7px;padding-left:12px;background-color:#000000;color:#ffffff;border-radius:4px;font-weight:500;font-size:0.875em;text-align:center"
                              target="_blank"
                              ><span
                                ><!--[if mso]><i style="mso-font-width:300%;mso-text-raise:10.5px" hidden>&#8202;&#8202;</i><![endif]--></span
                              ><span
                                style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:5.25px"
                                >Accept invite</span
                              ><span
                                ><!--[if mso]><i style="mso-font-width:300%" hidden>&#8202;&#8202;&#8203;</i><![endif]--></span
                              ></a
                            >
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style="margin:0;padding:0;font-size:1em;padding-top:0.5em;padding-bottom:0.5em">
                      If you have any questions, just reply to this email — we're happy to help.
                    </p>
                    <p style="margin:0;padding:0;font-size:1em;padding-top:0.5em;padding-bottom:0.5em">
                      Welcome aboard,<br />The Ai Cloud Team
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
};

// Follow-up, not yet built: delivery-status webhook. Once something in the
// UI needs to show per-invite send/delivery state, add to convex/http.ts:
//   http.route({
//     path: "/resend-webhook",
//     method: "POST",
//     handler: httpAction(async (ctx, req) => resend.handleResendEventWebhook(ctx, req)),
//   });
// then register that URL in the Resend dashboard, set RESEND_WEBHOOK_SECRET,
// and pass onEmailEvent: internal.email.handleEmailEvent into the
// Resend(...) constructor above.
