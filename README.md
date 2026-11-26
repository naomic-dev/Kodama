# Kodama

> An administrative Discord bot for a community server — onboarding, lobby moderation, polls, and event announcements.

![Node.js](https://img.shields.io/badge/node-12--14-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-11.6.4-5865F2?logo=discord&logoColor=white)
![CI](https://github.com/naomic-dev/Kodama/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)

Kodama was the resident admin bot for a community Discord server. It ran 24/7 on a Raspberry Pi at home while the server was active, handling the server's front door: welcoming new members, verifying them out of a lobby, announcing events from a shared Google Calendar, and running polls for community decisions.

This repository is a **reference snapshot**. Server-specific IDs, channel names, and calendar details live in `config.json` outside the checkout; the example file holds placeholders, so it will not run until you supply your own configuration. See [Setup](#setup).

## Features

### Onboarding and the lobby

- DMs every new member a rules summary and a "how to get verified" walkthrough.
- Posts a welcome message to the introductions channel and a notification to the admin channel.
- Tracks new members in a 7-day lobby window; a midnight job kicks anyone who has not introduced themselves and DMs them a short explanation, plus an invite link when `inviteUrl` is configured.
- Admins verify members with a single reaction on the lobby message (or the `!admit` command), which assigns roles and clears the lobby entry.

### Polls

- Guided, stateful poll setup in an admin channel: title → description → duration → exclusive vs. multi-choice → options, each with an emoji.
- `[cancel]` or `!cancel` abandons a setup at any step, marks the setup message as cancelled, and confirms in the channel where the command was typed.
- Starting `!poll` again while a setup is active is refused with a reminder instead of overwriting the title.
- Options can use server custom emojis; single-choice polls automatically retract previous votes.
- Polls close on schedule and post a final tally.
- In-progress and open polls survive restarts (JSON-backed).

### Events

- Pulls the next seven days of events from a Google Calendar.
- Parses lightweight metadata out of the calendar description (`[type:...]`, `[url:...]`, `[title note:...]`, `[desc note:...]`) to build branded embeds per event type.
- Announces each event once, de-duplicated across restarts.

### Utility and moderation

- Help, server avatar, and member avatar commands.
- Owner-only broadcast, event re-announcement, and lobby-inspection commands.
- Role backfill for vetted member groups.
- Forwards DMs sent to the bot into the admin channel, including attachments.

## Commands

Commands can be prefixed with `@Kodama`, `kodama!`, or `kod!`.

| Command | Scope | Description |
| --- | --- | --- |
| `help`, `h` | Members or Admin | Show the help menu. |
| `server-avatar`, `sa` | Members or Admin | Post the server's icon. |
| `avatar @user`, `a @user` | Members or Admin | Post a member's avatar. |
| `!admit @user` | Admin | Verify a member and assign roles. |
| `!poll [#channel]` | Admin | Start guided poll setup. |
| `!say #channel <text>` | Owner | Post an embed as the bot. |
| `!ping` | Owner | Health check. |
| `!announce-events` | Owner | Re-run the calendar announcement job. |
| `!event-tag-format` | Owner | Show calendar description tag syntax. |
| `!update-introduction` | Owner | Refresh the pinned introduction message. |
| `!add-to-lobby-list <name>` | Owner | Manually add a member to the lobby list. |
| `!check-lobby-list` | Owner | Dry-run the lobby expiry check. |

Reacting to a lobby entry with any emoji verifies that member; 👎 is logged as a rejection.

Utility commands are available to verified members and admins; the remaining commands require the admin role (and the owner-only commands additionally require `ownerId`).

## Demo

Illustrative transcript; names, IDs, dates, and vote counts are placeholders.

```text
<Admin> !poll #announcements
<Kodama> New Poll Set Up
         Creator: Admin
         Title:
         Description:
         Expiration Date:
         Options:

         Select a title for your poll

<Admin> Lunch?
<Kodama> By: Admin

         Title: Lunch?
         Description:
         Closes on:
         Options mutually exclusive:
         Options:

         Next: Type out a description for your poll.

<Admin> Pick a place
<Kodama> ... Next: Type out a poll duration.

<Admin> 1 hour
<Kodama> ... Next: Should options on this poll be mutually exclusive?

<Admin> no
<Kodama> ... Next: Type out a voting option for your poll.

<Admin> Pizza
<Kodama> ... Next: React with an emoji for this option.

<Admin> [reacts 🍕]
<Kodama> ... Next: Type out another voting option. Type [done] when finished.

<Admin> Sushi
<Kodama> ... Next: React with an emoji for this option.

<Admin> [reacts 🍣]
<Admin> [done]
<Kodama> Poll Set Up Complete!
<Kodama> Poll: Lunch?
         By Admin
         Closes on November 24, 2026 (02:00 PM)
         Pick a place

         🍕: `Pizza`

         🍣: `Sushi`
```

```text
<Kodama> Poll 'Lunch?' has closed!
         By Admin
         Pick a place

         __Final Results:__
         `Pizza`: **5**

         `Sushi`: **2**
```

```text
<Kodama> The Main Munch
         Friends, it's time for our largest monthly event...
         Date: December 6, 2026 (02:00 PM)
         Location: Visit our event page to get the address!
         Eligible Members: Everyone!
         Don't forget to RSVP! https://...
```

## Architecture

The bot is a single Node process built on `discord.js` v11:

```
index.js                     Bootstrap: client, event registration, login
config.js                    Loads, merges, and validates config.json
logger.js                    Dependency-free structured logger
.eslintrc.json               ESLint configuration
commands/
  admin.js                   Owner and admin commands
  pollSetup.js               Guided poll setup state machine
  utility.js                 Help and avatar commands
  index.js                   Command dispatcher exports
events/
  ready.js                   Startup, state loading, scheduling
  message.js                 DM forwarding and command routing
  members.js                 Join and leave lifecycle
  reactions.js               Poll votes, lobby reactions, raw packets
lib/
  channels.js                Channel lookup by configured name or ID
  oauth.js                   OAuth redirect parsing
  paths.js                   Config, credential, and state locations
  prefix.js                  Command prefix and mention parsing
  time.js                    Date and time formatting
models/
  poll.js                    Poll, PollOption, PollSetupData, OptionEmoji
store/
  jsonStore.js               JSON state loading and persistence
  state.js                   Shared in-memory state
services/
  google.js                  OAuth, Calendar query, event embeds
  lobby.js                   Admission and role backfill
  polls.js                   Poll closing and scheduling
  scheduler.js               Midnight maintenance job
test/
  harness.js                 Minimal async test runner
  poll.test.js               Poll model
  pollSetup.test.js          Guided poll setup state machine
  lobby.test.js              Lobby expiry
  oauth.test.js              OAuth redirect parsing
  prefix.test.js             Command prefix and mention parsing
  fixtures/test-config.json  Test configuration
Dockerfile                   Container image
.dockerignore                Build context exclusions
deploy/kodama.service        Raspberry Pi systemd unit
.github/workflows/ci.yml     Tests (Node 12/14) and lint (Node 14)
```

Nothing in that tree is secret or writable. Configuration, credentials, and state live outside the checkout:

```
~/.config/kodama/config.json              Server IDs, roles, channels, calendar
~/.config/kodama/.env                     Bot token and environment flags
~/.config/kodama/google_credentials.json  Google OAuth client
~/.config/kodama/token.json               Google OAuth token, created on first run
~/.local/share/kodama/                    Runtime JSON state
  lobby.json                              Pending members and expiry dates
  open polls.json                         Live polls and vote state
  unfinished polls.json                   In-progress poll setup sessions
  announced events.json                   Event IDs already announced
  kicked.json                             Members removed by the lobby job
```

`lib/paths.js` resolves those locations from `KODAMA_HOME` (default `~/.config/kodama`) and `DATA_DIR` (default `~/.local/share/kodama`), with per-file overrides for deployments.

Major pieces:

- **Configuration** — `config.js` merges `config.json` over defaults, validates the required values, and fails fast with a list of anything missing.
- **Logging** — `logger.js` emits structured text or JSON lines with levels, timestamps, context, and serialized errors.
- **Commands and events** — `events/` wires Discord events to `commands/`; the message handler only parses prefixes and dispatches.
- **Poll engine** — `models/poll.js` holds the poll classes, `commands/pollSetup.js` advances the guided setup state machine, and `services/polls.js` closes polls at their expiration.
- **State** — `store/jsonStore.js` centralizes reads and writes for every runtime JSON file, including `DATA_DIR` handling and error logging; `store/state.js` holds the live guild and poll/lobby lists.
- **Google integration** — `services/google.js` performs the installed-app OAuth flow, queries the calendar, and maps events to embeds.
- **Lobby lifecycle** — `events/members.js` and `services/scheduler.js` keep `lobby.json` in sync with Discord; `services/lobby.js` handles admission and role backfill.
- **Scheduling** — `services/scheduler.js` runs the midnight maintenance job and `services/polls.js` schedules poll closures.
- **Raw reaction handler** — `events/reactions.js` re-fetches uncached messages so reactions work on older messages.

## Requirements

- Node.js 12–14 (this snapshot targets `discord.js` v11, whose native dependencies do not build on newer Node releases; see the [roadmap](#roadmap))
- A Discord application and bot token
- A Google Cloud project with the **Calendar** API enabled and a Desktop OAuth client

## Setup

Local configuration and credentials live outside the repository, in `~/.config/kodama` by default. Create it with owner-only permissions before continuing:

```bash
mkdir -p ~/.config/kodama
chmod 700 ~/.config/kodama
```

Every step below writes there. Set `KODAMA_HOME` to use a different directory.

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Discord bot

Create an application at <https://discord.com/developers/applications>, add a bot, and copy its token. Invite it to your server with the permissions it needs (manage roles, kick members, send messages, read message history).

### 3. Create Google credentials

In Google Cloud Console, enable the Calendar API, create an OAuth client of type **Desktop app**, and download the JSON. Save it as `google_credentials.json` in `~/.config/kodama`:

```bash
cp google_credentials.example.json ~/.config/kodama/google_credentials.json
chmod 600 ~/.config/kodama/google_credentials.json
# then paste in your client_id and client_secret
```

A Desktop-app client file from Google contains more than Kodama reads:

| Field | Used | Notes |
| --- | --- | --- |
| `installed` | Yes | The wrapper key. Its presence confirms the client is type **Desktop app**; a Web application client has `web` instead and is rejected at startup. |
| `client_id`, `client_secret` | Yes | The only values passed to the OAuth client. |
| `redirect_uris` | No | Kodama listens on a random loopback port and sends that URI to Google directly, so the registered URIs — including the retired `urn:ietf:wg:oauth:2.0:oob` — are never used. |
| `project_id` | No | Informational; identifies the Cloud project for other tooling. |
| `auth_uri` | No | `googleapis` builds the authorization URL from its own fixed endpoint. |
| `token_uri` | No | The token exchange likewise uses Google's fixed token endpoint. |
| `auth_provider_x509_cert_url` | No | Certificate endpoint used by other Google client libraries, not by Kodama. |

Nothing needs deleting. Paste in the two values, leave the rest as downloaded, and the file remains usable by other Google tooling; any keys a newer download adds are ignored the same way.

On first run Kodama prints an authorization URL and waits. Open it and approve access; Google redirects the browser to a loopback server on the same machine, Kodama exchanges the code, and writes `~/.config/kodama/token.json` for subsequent runs. If the browser runs on a different machine (a headless Pi, or the container), the redirect page cannot load there — copy the full URL from the address bar and paste it at the terminal prompt instead.

### 4. Configure the environment

```bash
cp .env.example ~/.config/kodama/.env
chmod 600 ~/.config/kodama/.env
```

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Discord bot token. |
| `KODAMA_HOME` | Directory holding `config.json`, `.env`, `google_credentials.json`, and `token.json`. Defaults to `~/.config/kodama`. |
| `CONFIG_PATH`, `ENV_FILE`, `GOOGLE_CREDENTIALS_PATH`, `GOOGLE_TOKEN_PATH` | Optional overrides for one file, for deployments that do not keep them together. |
| `DATA_DIR` | Where runtime JSON state is stored. Defaults to `~/.local/share/kodama`. |
| `LOG_LEVEL` | Minimum level to log: `error`, `warn`, `info`, or `debug`. Defaults to `info`. |
| `LOG_FORMAT` | `text` for human-readable lines or `json` for one object per line. Defaults to `text`. |

### 5. Configure the server

```bash
cp config.example.json ~/.config/kodama/config.json
chmod 600 ~/.config/kodama/config.json
```

Kodama refuses to start until the required values are filled in and lists anything that is missing.

| Key | Description |
| --- | --- |
| `guildId` | ID of the server Kodama runs in. |
| `ownerId` | Your Discord user ID; enables owner-only commands. |
| `inviteUrl` | Optional invite link sent to members removed by the lobby job. |
| `roles.admin` | Role allowed to run admin commands and receive admin notifications. |
| `roles.member` | Role assigned to verified members. |
| `roles.dmsClosed` | Role assigned on admission. |
| `roles.vetted`, `roles.secretClub`, `roles.secretClubVetted` | Optional roles used by the nightly backfill job. |
| `roles.admitted` | Roles that count as already admitted for that job. |
| `channels.*` | Channel names (or IDs). Defaults match the names used by the original server. |
| `messages.introduction` | ID of the pinned introduction message. |
| `google.calendarId` | Calendar to read events from. |
| `google.eventQuery` | Optional title filter for calendar events. |
| `eventImages.*` | Optional image URLs for each event type. |

### 6. Run

```bash
npm start
```

## Tests

```bash
npm test
```

The suite uses Node's built-in `assert` and runs each file in a separate process, so it adds no dependencies. It covers the poll model, the guided setup state machine, expired-poll closure, lobby expiry, OAuth redirect parsing, and command prefix parsing. Tests point `CONFIG_PATH` at a fixture and use a temporary `DATA_DIR`.

The codebase is linted with ESLint, using the style the code is already written in (tabs, single quotes, Stroustrup braces, strict equality):

```bash
npm run lint
npm run lint:fix
```

CI runs `npm run lint` on Node 14 as a separate job, failing on any warning or error, and `npm test` on Node 12 and 14.

## Deployment

### Docker

The image keeps the application code read-only and runs from `/app/runtime`, where `KODAMA_HOME` points.

Build it:

```bash
docker build -t kodama .
```

Create the host directory the container reads from, and fill in the configuration:

```bash
mkdir -p ~/.config/kodama
chmod 700 ~/.config/kodama
cp config.example.json ~/.config/kodama/config.json
cp google_credentials.example.json ~/.config/kodama/google_credentials.json
printf 'BOT_TOKEN=your-bot-token-here\n' > ~/.config/kodama/.env
chmod 600 ~/.config/kodama/config.json ~/.config/kodama/google_credentials.json ~/.config/kodama/.env
# edit the two JSON files
```

The container runs as uid 1000 and writes `token.json` and `data/` into that directory, so make it writable by that user if your host uid differs:

```bash
sudo chown -R 1000:1000 ~/.config/kodama
```

Run once interactively to complete the Google OAuth flow and write `~/.config/kodama/token.json`:

```bash
docker run --rm -it -v "$HOME/.config/kodama:/app/runtime" kodama
```

The loopback listener lives inside the container, so the browser redirect will not load on the host; copy the URL from the browser's address bar and paste it at the prompt.

Then start it detached:

```bash
docker run -d --name kodama --restart unless-stopped \
  -v "$HOME/.config/kodama:/app/runtime" \
  kodama

docker logs -f kodama
```

`KODAMA_HOME` is `/app/runtime` inside the container, so `config.json`, `google_credentials.json`, `token.json`, and `.env` are read from the mounted directory; state is written to `/app/runtime/data`, which is `~/.config/kodama/data` on the host.

### Raspberry Pi (systemd)

Kodama originally ran 24/7 on a Raspberry Pi. The example unit is [`deploy/kodama.service`](deploy/kodama.service).

1. Install Node.js 12–14, then create the service user:
   ```bash
   sudo useradd --system --home /var/lib/kodama --shell /usr/sbin/nologin kodama
   ```

2. Install the code and dependencies:
   ```bash
   sudo git clone https://github.com/naomic-dev/Kodama.git /opt/kodama
   cd /opt/kodama
   sudo npm install --ignore-scripts
   ```

3. Create the runtime directory and copy the templates:
   ```bash
   sudo install -d -o kodama -g kodama -m 700 /var/lib/kodama
   sudo -u kodama cp /opt/kodama/config.example.json /var/lib/kodama/config.json
   sudo -u kodama cp /opt/kodama/google_credentials.example.json /var/lib/kodama/google_credentials.json
   sudo -u kodama sh -c 'printf "BOT_TOKEN=your-bot-token-here\n" > /var/lib/kodama/.env'
   sudo chmod 600 /var/lib/kodama/config.json /var/lib/kodama/google_credentials.json /var/lib/kodama/.env
   sudo -u kodama "${EDITOR:-vi}" /var/lib/kodama/config.json
   sudo -u kodama "${EDITOR:-vi}" /var/lib/kodama/google_credentials.json
   ```

4. Complete the Google OAuth flow once in the foreground. If the service is already running, stop it first.
   ```bash
   sudo -u kodama sh -c 'cd /var/lib/kodama && KODAMA_HOME=/var/lib/kodama DATA_DIR=/var/lib/kodama/data node /opt/kodama/index.js'
   ```
   Open the printed URL on a machine with a browser. The redirect page cannot load there, so copy the full URL from the address bar and paste it at the prompt. Press Ctrl+C once `token.json` has been written.

5. Install and start the unit:
   ```bash
   sudo cp /opt/kodama/deploy/kodama.service /etc/systemd/system/kodama.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now kodama
   sudo journalctl -u kodama -f
   ```

The unit sets `KODAMA_HOME=/var/lib/kodama` and `DATA_DIR=/var/lib/kodama/data`, reads `.env` from `/var/lib/kodama/.env`, expects `config.json` and the Google credentials in `/var/lib/kodama`, and writes state to `/var/lib/kodama/data`. If Node is installed via nvm rather than the system package manager, replace `/usr/bin/env node` in the unit with the absolute path to your Node binary.

Set `LOG_FORMAT=json` in `.env` to emit one JSON object per line for journald.

## Design notes

- **JSON files instead of a database.** The server was small and the data was tiny; flat files kept the Pi deployment to a single process with no services to run. The trade-off is no atomic writes and no concurrency control, which is the first thing I would change.
- **A state machine for poll setup.** Poll creation is a conversation, not a slash command: each message advances a stored `Poll` object. Modeling it explicitly kept the handler readable and made partial setups resumable.
- **Why the raw packet handler exists.** `discord.js` v11 does not emit reaction events for messages that are not cached, which matters for pinned lobby and poll messages after a restart.
- **Dependency-free logger.** A small local module keeps the pinned 2021 dependency stack unchanged while still supporting structured JSON output for journald on the Raspberry Pi.
- **Placeholders, not secrets.** The credential files in this repository's history were always redacted; real values were supplied at deploy time. They are now ignored outright.

## Roadmap

This is a faithful snapshot, not a maintained product. If I picked it up again:

- [ ] Migrate to `discord.js` v14 with intents and slash commands.
- [ ] Replace JSON persistence with SQLite and transaction-safe writes.
- [ ] Add Prettier once the code moves to `discord.js` v14.
- [ ] Add screenshots and a short recording to replace the text demo.

## License

MIT — see [LICENSE](LICENSE).
