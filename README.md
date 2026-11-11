# Maildesk — local edition

Manage multiple Hostinger Mail accounts from a dashboard on your computer, or on a VPS accessed through SSH port forwarding. No extra domain or ChatGPT account is required. Internet access is needed for receiving and sending mail through Hostinger.

## Git source and VPS access

This repository contains the application source, dependency lockfile, launch scripts, tests, and a safe `env.example` template. Private runtime data (`.maildesk/`), actual `.env` files, dependencies, builds, outputs, and local SSH notes are excluded from Git. A clone starts with no password or email connections; configure these through the dashboard after starting it.

For VPS access, follow `SSH-ACCESS.example.txt`. The systemd unit in `scripts/maildesk-local.service` is an example of this installation: adjust its user, application directory, Node executable, and writable paths before installing it on a different server. Keep the dashboard bound to `127.0.0.1:4387`.

To save future source changes, review `git status` and `git diff`, stage the intended files with `git add <file>`, then run `git commit -m "Describe the change"`. Configure your own Git author name and email before making personal commits. Git commits are local; a remote repository and a push are needed for an off-server source backup. Back up private runtime data separately as described below.

## Open the dashboard

1. Install Node.js LTS, version 22.13 or newer, from https://nodejs.org/ if it is not already installed.
2. Extract the entire Maildesk folder to a permanent location on your computer.
3. **Windows:** double-click `Start-Maildesk.cmd`. **macOS/Linux:** open a terminal in this folder and run `bash start-maildesk.sh`.
4. On first launch, dependencies install and the app builds. Wait for the server to say it is ready.
5. Open **http://127.0.0.1:4387** in your browser.
6. Create a local Maildesk password (at least 12 characters). This is separate from your Hostinger password.
7. Choose **Connect your email** and follow the Hostinger Mail API setup instructions.

Keep the launcher window open while using Maildesk. Close it or press Ctrl+C to stop the server. Start the same launcher again next time. Bookmark the local address. Use the Lock dashboard button to sign out; sessions otherwise last 12 hours.

If your IDE runs on a remote machine, localhost refers to that machine. Download and extract this folder on your own computer to use the launchers there.

## Optional environment configuration

The defaults work without an environment file. To customize them, copy `env.example` to `.env.local` in the project root (`cp env.example .env.local` on Linux/macOS, or `Copy-Item env.example .env.local` in PowerShell), edit it, and restart the dashboard.

`MAILDESK_DATA_DIR` selects the private database and encryption-key directory; `NEXT_TELEMETRY_DISABLED=1` disables Next.js telemetry. Enter your mailbox API token and dashboard password through the UI, not in the template. Changing the data directory does not move existing data: keep the current location unless you intend to migrate it or create a separate installation.

Existing systemd `Environment=` settings override `.env.local`. When changing the service's data directory, update both `Environment=MAILDESK_DATA_DIR=...` and `ReadWritePaths=` in the unit. Standalone Node scripts do not load `.env.local` automatically; for a custom data location, run the password-reset script with `node --env-file=.env.local --experimental-transform-types scripts/reset-password.mjs` while the dashboard is stopped.

## Connect business email accounts

Hostinger hPanel → Emails → your domain → Agentic Mail → API access → create a **Mail API token** scoped to your chosen mailboxes. Enter it only in the dashboard connection form. A general Hostinger account API token will not work. Repeat for separate email orders. Discover new mailboxes refreshes accounts available to your existing connections.

Until you connect, the dashboard uses clearly labeled sample emails. Simulate send never transmits an email. Live sending and receiving need verification using your own accounts.

## Your data

Data is saved inside `.maildesk/` in this folder: the SQLite database contains the local password hash, sessions, mailbox metadata, encrypted connection tokens, drafts, and follow-up statuses. `encryption.key` is necessary to read the saved tokens. Back up the **entire `.maildesk` directory while the app is stopped**, and keep that backup private. Do not upload this folder to a public repository or include it when sharing the app.

The server listens only on `127.0.0.1:4387`. Do not expose it through a public tunnel, reverse proxy, or network address: this edition is designed for loopback access. It accepts no ChatGPT identity headers. Passwords are scrypt-hashed; session tokens are hashed on disk; cookies use HttpOnly and SameSite=Strict. Cookie Secure is intentionally absent for loopback HTTP. Requests that change data require an exact local Origin. Failed logins are limited to 10 per 15 minutes.

To reset a forgotten local password, stop the dashboard and run:

```sh
node --experimental-transform-types scripts/reset-password.mjs
```

Type RESET, restart the app, and create a new password. Email connections and drafts remain intact.

## Behavior and limits

Mail stays at Hostinger. Drafts and follow-up statuses are stored in Maildesk, separately from Hostinger's folders. Saved drafts do not retain attachments; reattach them after reopening. Forwarding quotes the original text; add original files manually. Attachments are limited to 10 files and 5 MB total per outgoing message.

Email bodies are decoded from their original MIME source using declared transfer encodings and character sets. This avoids garbled text returned by Hostinger's rendered-text endpoint for some plain messages. Attachments are streamed and discarded while reading; opening a message does not save them locally. Messages with a source larger than 32 MB must be opened in Hostinger Webmail. HTML-only emails are still displayed as text.

Messages load in batches of 25 per account. Use Load older messages for more. The first page refreshes every 10 seconds while visible, waiting for an in-progress load to finish before scheduling another automatic refresh. Counters and follow-up filters apply to loaded messages. Sending success means Hostinger accepted the message; delivery failures may still occur. Check Sent before retrying an uncertain send.

## Development and validation

```sh
npm ci
npm run test
npm run check
npm run build
npm start
```

Use `npm run dev` for development. After changing source, run `npm run build` before using the launcher again. `MAILDESK_DATA_DIR` can select a different private data location for testing. The test suite uses temporary databases and simulated upstream requests; it never sends real email.

## Conversation view

The dashboard opens to **Conversations**. It groups loaded Inbox and Sent emails by mailbox and the complete visible participant set (sender, To, and Cc), with each email subject still shown. Separate mailboxes and different groups of participants are never merged. Search applies to loaded participants and subjects. Use Load older emails for more history. Archived messages are not fetched by this view.

Incoming messages appear on the left; your outgoing messages appear on the right. Write a reply at the bottom, optionally add files, then click Send reply (or Ctrl+Enter). The recipient addresses and sending mailbox are visible. For group conversations, replies go to the displayed participants. New mail refreshes every 10 seconds while the conversation view is active and the browser tab is visible. A refresh is skipped if the previous load is still running.

Statuses distinguish Sending, Accepted for sending (awaiting the Sent copy), In Sent, Not sent, and Sending status unknown. Acceptance and presence in Sent do not prove recipient delivery or reading. An uncertain send is never retried automatically; check Sent before copying it back into the reply box. Demo replies do not transmit email. Conversation text remains in memory while switching tabs; Save draft stores it persistently. Reattach files after reopening a saved draft.
