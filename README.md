# Kodama

> An administrative Discord bot for a community server — onboarding, lobby moderation, polls, and event announcements.

![Node.js](https://img.shields.io/badge/node-12--14-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-11.6.4-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

Kodama was the resident admin bot for a community Discord server. It ran 24/7 on a Raspberry Pi in my bedroom while the server was active, handling the server's front door: welcoming new members, verifying them out of a lobby, announcing events from a shared Google Calendar, and running polls for community decisions.

This repository is a **reference snapshot**. Server-specific IDs, channel names, and calendar details live in `config.json`; the values in the repository are placeholders, so it will not run until you supply your own configuration. See [Setup](#setup).

## Features

### Onboarding and the lobby

- DMs every new member a rules summary and a "how to get verified" walkthrough.
- Posts a welcome message to the introductions channel and a notification to the admin channel.
- Tracks new members in a 7-day lobby window; a midnight job kicks anyone who has not introduced themselves and DMs them a fresh invite.
- Admins verify members with a single reaction on the lobby message (or the `!admit` command), which assigns roles and clears the lobby entry.

### Polls

- Guided, stateful poll setup in an admin channel: title → description → duration → exclusive vs. multi-choice → options, each with an emoji.
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
| `help`, `h` | Members | Show the help menu. |
| `server-avatar`, `sa` | Members | Post the server's icon. |
| `avatar @user`, `a @user` | Members | Post a member's avatar. |
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

## Architecture

The bot is a single Node process built on `discord.js` v11:

```
index.js                     Discord client, event handlers, command router
config.js                    Loads, merges, and validates config.json
logger.js                    Dependency-free structured logger
lib/
  channels.js                Channel lookup by configured name or ID
  time.js                    Date and time formatting
models/
  poll.js                    Poll, PollOption, PollSetupData, OptionEmoji
store/
  jsonStore.js               JSON state loading and persistence
services/
  google.js                  OAuth, Calendar query, event embeds
config.json                  Server IDs, roles, channels, calendar (not committed)
.env                         Bot token and environment flags (not committed)
google_credentials.json      Google OAuth client (not committed)
token.json                   Google OAuth token, generated on first run (not committed)
data/                        Runtime JSON state (not committed)
  lobby.json                 Pending members and expiry dates
  open polls.json            Live polls and vote state
  unfinished polls.json      In-progress poll setup sessions
  announced events.json      Event IDs already announced
  kicked.json                Members removed by the lobby job
```

Major pieces:

- **Configuration** — `config.js` merges `config.json` over defaults, validates the required values, and fails fast with a list of anything missing.
- **Logging** — `logger.js` emits structured text or JSON lines with levels, timestamps, context, and serialized errors.
- **Poll engine** — `models/poll.js` holds `Poll`, `PollOption`, and `PollSetupData`; the message handlers in `index.js` advance the guided setup state machine, and `node-schedule` closes polls at their expiration.
- **State** — `store/jsonStore.js` centralizes reads and writes for every runtime JSON file, including `DATA_DIR` handling and error logging.
- **Google integration** — `services/google.js` performs the installed-app OAuth flow, queries the calendar, and maps events to embeds.
- **Lobby lifecycle** — `guildMemberAdd`/`guildMemberRemove` and the midnight job keep `lobby.json` in sync with Discord.
- **Scheduling** — `node-schedule` runs midnight maintenance, poll closures, and a keep-alive typing job.
- **Raw reaction handler** — a `raw` packet listener re-fetches uncached messages so reactions work on older messages.

## Requirements

- Node.js 12–14 (this snapshot targets `discord.js` v11, whose native dependencies do not build on newer Node releases; see the [roadmap](#roadmap))
- A Discord application and bot token
- A Google Cloud project with the **Calendar** API enabled and a Desktop OAuth client

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Discord bot

Create an application at <https://discord.com/developers/applications>, add a bot, and copy its token. Invite it to your server with the permissions it needs (manage roles, kick members, send messages, read message history).

### 3. Create Google credentials

In Google Cloud Console, enable the Calendar API, create an OAuth client of type **Desktop app**, and download the JSON. Save it as `google_credentials.json`:

```bash
cp google_credentials.example.json google_credentials.json
# then paste in your client_id, client_secret, and project_id
```

On first run Kodama prints an authorization URL. Visit it, paste the code back into the terminal, and it writes `token.json` for subsequent runs.

### 4. Configure the environment

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `BOT_TOKEN` | Discord bot token. |
| `DEV` | `true` to use a separate development state directory (`<DATA_DIR>/dev`). |
| `DATA_DIR` | Where runtime JSON state is stored. Defaults to `./data`. |
| `LOG_LEVEL` | Minimum level to log: `error`, `warn`, `info`, or `debug`. Defaults to `info`. |
| `LOG_FORMAT` | `text` for human-readable lines or `json` for one object per line. Defaults to `text`. |

### 5. Configure the server

```bash
cp config.example.json config.json
```

`config.json` is git-ignored. Kodama refuses to start until the required values are filled in and lists anything that is missing.

| Key | Description |
| --- | --- |
| `guildId` | ID of the server Kodama runs in. |
| `ownerId` | Your Discord user ID; enables owner-only commands. |
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

## Design notes

- **JSON files instead of a database.** The server was small and the data was tiny; flat files kept the Pi deployment to a single process with no services to run. The trade-off is no atomic writes and no concurrency control, which is the first thing I would change.
- **A state machine for poll setup.** Poll creation is a conversation, not a slash command: each message advances a stored `Poll` object. Modeling it explicitly kept the handler readable and made partial setups resumable.
- **Why the raw packet handler exists.** `discord.js` v11 does not emit reaction events for messages that are not cached, which matters for pinned lobby and poll messages after a restart.
- **Dependency-free logger.** A small local module keeps the pinned 2021 dependency stack unchanged while still supporting structured JSON output for journald on the Raspberry Pi.
- **Placeholders, not secrets.** The credential files in this repository's history were always redacted; real values were supplied at deploy time. They are now ignored outright.

## Roadmap

This is a faithful snapshot, not a maintained product. If I picked it up again:

- [ ] Migrate to `discord.js` v14 with intents and slash commands.
- [ ] Split the remaining handlers out of `index.js` into `commands/` and `events/`.
- [ ] Replace JSON persistence with SQLite and transaction-safe writes.
- [ ] Add unit tests for the poll state machine and lobby expiry logic.
- [ ] Replace `console.log` with structured logging.
- [ ] Add a Dockerfile and document the Raspberry Pi service unit.
- [ ] Add screenshots and a short demo recording.

## License

MIT — see [LICENSE](LICENSE).
