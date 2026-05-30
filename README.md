# Discord Rank Web Updater

This bot watches your Discord server roles and updates `ranks.json` in your GitHub Pages repo. Your `rankformat.html` page reads that file, so the website updates when ranks change or when someone gets an inactive role.

## What You Need

- A Discord bot token
- A GitHub token that can edit your `Ranks` repository
- Node.js installed
- Your website repo should contain:
  - `index.html`
  - `ranks.json`

## Setup

1. Copy `.env.example` to `.env`.
2. Put your Discord bot token in `DISCORD_TOKEN`.
3. Put your GitHub token in `GITHUB_TOKEN`.
4. `config.json` is already set to track the Commander role.
5. Fill in `inactiveRoleId` only if you have an inactive role.
6. `ownerUserIds` can use add/remove commands even without Manage Roles.
7. Run:

```bash
npm install
npm start
```

## Adding Ranks Later

Once the bot is running in your server, use these Discord slash commands:

```text
/addrank name:Commander role:@Commander badge:CM tag:CMD
/removerank name:Commander
/listranks
```

You can add any new rank whenever you want. The bot saves it in `config.json`, counts that role, and updates `ranks.json` on the website.

## Important Discord Settings

In the Discord Developer Portal, enable the bot's **Server Members Intent**. The bot needs it so it can count members in roles.

Invite the bot to your server with permission to view members and roles.

## Bot Image

To use the same image as your server, open this link, save the image, then upload it as the bot avatar in the Discord Developer Portal:

https://cdn.discordapp.com/icons/1475700930333900915/770e5b75f93065e8c6aac72bfcf17ba9.webp?size=1024

## Invite Link

Use this link to add the bot to your server:

https://discord.com/oauth2/authorize?client_id=1510112914730913894&scope=bot%20applications.commands&permissions=0

## Hosting

This bot needs to keep running somewhere online if you want automatic updates while your PC is off. Good beginner options:

- Railway
- Render
- Fly.io
- A VPS

GitHub Pages hosts the website, but it does not run the Discord bot.
