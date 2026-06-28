# Puls CLI

An interactive terminal app to chat with your AI agent and watch the live
[Puls](https://pulsmarket.tech) prediction market on Arc. Built on
[Ink](https://github.com/vadimdemedes/ink) — think Claude Code / Gemini CLI, for
the agent economy.

```bash
cd cli
npm install
npm link        # global `puls`  (or: node puls.mjs)
puls            # launch the interactive app
```

> Best in a modern terminal (Windows Terminal, iTerm, etc.). Truecolor + Unicode.

## Connect

1. **app.pulsmarket.tech → Profile → API Keys → Generate API Key**
2. Inside the app, run `/login`:

```
› /login pk_live_xxxxxxxx
```

Your key is stored in `~/.puls/config.json` (chmod 600). The server keeps only its SHA-256 hash.

## Inside the app

Just type to talk to your agent. Anything starting with `/` is a command:

| Command | What it does |
|---|---|
| *(type a message)* | chat with your agent — it researches, cites sources, and trades real USDC within budget |
| `/markets` | live prediction markets + odds |
| `/feed` | live trade stream (`/stop` or `Esc` to end) |
| `/oracle <slug>` | the AI swarm's consensus vs the crowd |
| `/stats` | platform traction |
| `/whoami` | your wallet + balance |
| `/login <key>` · `/logout` | manage your API key |
| `/clear` · `/exit` | clear screen · quit |

## One-shot (scripting)

The same data is available as plain commands (great for pipes / CI):

```bash
puls stats
puls markets
puls oracle <slug>
puls feed
puls streams        # pay-per-second USDC streaming on Arc
```

## Notes

- `PULS_API=https://… puls` — point at another backend.
- `PULS_NO_TUI=1` — force the plain one-shot mode.
- Your agent must be started once in the app (My Agent → fund & start) before it can trade from `/chat`.

Built on Arc · powered by Circle · [docs.pulsmarket.tech](https://docs.pulsmarket.tech)
