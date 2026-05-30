import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import { Octokit } from "@octokit/rest";

const configUrl = new URL("./config.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));
const discordToken = process.env.DISCORD_TOKEN;
const githubToken = process.env.GITHUB_TOKEN;

if (!discordToken) throw new Error("Missing DISCORD_TOKEN in .env");
if (!githubToken) throw new Error("Missing GITHUB_TOKEN in .env");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const octokit = new Octokit({ auth: githubToken });
let updateTimer;

function cleanRank(rank, index = 0) {
  const safeName = rank.name || "Untitled Rank";
  return {
    name: safeName,
    roleId: rank.roleId,
    badge: rank.badge || safeName.slice(0, 2).toUpperCase(),
    note: rank.note || "Live Discord rank",
    tag: rank.tag || "LIVE",
    accent: rank.accent || ["founder", "cofounder", "headadmin", "t3", "t2", "t1", "testing"][index % 7],
    featured: Boolean(rank.featured)
  };
}

async function saveConfig() {
  await writeFile(configUrl, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function scheduleUpdate(reason) {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => updateRanks(reason).catch(console.error), 5000);
}

async function countRoleMembers(guild, roleId) {
  const members = await guild.members.fetch();
  return members.filter((member) => {
    const hasRank = member.roles.cache.has(roleId);
    const isInactive = config.inactiveRoleId && member.roles.cache.has(config.inactiveRoleId);
    return hasRank && !isInactive;
  }).size;
}

async function updateRanks(reason = "manual update") {
  const guild = await client.guilds.fetch(config.guildId);
  await guild.members.fetch();

  const ranks = [];
  for (const [index, rawRank] of config.ranks.entries()) {
    const rank = cleanRank(rawRank, index);
    ranks.push({
      name: rank.name,
      count: await countRoleMembers(guild, rank.roleId),
      badge: rank.badge,
      note: rank.note || "Live Discord rank",
      tag: rank.tag || "LIVE",
      accent: rank.accent || "t1",
      featured: Boolean(rank.featured)
    });
  }

  const content = `${JSON.stringify(ranks, null, 2)}\n`;
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const repo = config.github;
  let sha;

  try {
    const current = await octokit.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path: repo.path,
      ref: repo.branch
    });
    if (!Array.isArray(current.data)) sha = current.data.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: repo.owner,
    repo: repo.repo,
    path: repo.path,
    branch: repo.branch,
    sha,
    message: `Update rank counts from Discord (${reason})`,
    content: encoded
  });

  console.log(`Updated ${repo.owner}/${repo.repo}/${repo.path}: ${reason}`);
}

async function registerCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName("addrank")
      .setDescription("Add or update a rank that appears on the website.")
      .addStringOption((option) =>
        option.setName("name").setDescription("Rank name shown on the website").setRequired(true)
      )
      .addRoleOption((option) =>
        option.setName("role").setDescription("Discord role to count").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("badge").setDescription("Short badge text, like CM or T1").setRequired(false)
      )
      .addStringOption((option) =>
        option.setName("tag").setDescription("Small tag text, like CMD or LIVE").setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("removerank")
      .setDescription("Remove a rank from the website.")
      .addStringOption((option) =>
        option.setName("name").setDescription("Rank name to remove").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("listranks")
      .setDescription("Show the ranks currently tracked by the website.")
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(discordToken);
  await rest.put(Routes.applicationGuildCommands(clientId, config.guildId), { body: commands });
  console.log("Slash commands registered: /addrank, /removerank, /listranks");
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  registerCommands(readyClient.user.id).catch(console.error);
  scheduleUpdate("bot started");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== config.guildId) return;

  if (interaction.commandName === "listranks") {
    const list = config.ranks.map((rank) => `• ${rank.name}: ${rank.roleId}`).join("\n") || "No ranks saved yet.";
    await interaction.reply({ content: list, ephemeral: true });
    return;
  }

  const isOwner = Array.isArray(config.ownerUserIds) && config.ownerUserIds.includes(interaction.user.id);
  if (!isOwner && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: "You need Manage Roles permission to use this bot command.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "addrank") {
    const name = interaction.options.getString("name", true);
    const role = interaction.options.getRole("role", true);
    const badge = interaction.options.getString("badge") || name.slice(0, 2).toUpperCase();
    const tag = interaction.options.getString("tag") || "LIVE";
    const existingIndex = config.ranks.findIndex((rank) => rank.name.toLowerCase() === name.toLowerCase());
    const nextRank = cleanRank({ name, roleId: role.id, badge, tag }, Math.max(existingIndex, 0));

    if (existingIndex >= 0) config.ranks[existingIndex] = nextRank;
    else config.ranks.push(nextRank);

    await saveConfig();
    scheduleUpdate(`rank ${existingIndex >= 0 ? "updated" : "added"} by ${interaction.user.tag}`);
    await interaction.reply({ content: `Saved ${name} using role ${role.name}. The website will update soon.`, ephemeral: true });
  }

  if (interaction.commandName === "removerank") {
    const name = interaction.options.getString("name", true);
    const before = config.ranks.length;
    config.ranks = config.ranks.filter((rank) => rank.name.toLowerCase() !== name.toLowerCase());
    await saveConfig();
    scheduleUpdate(`rank removed by ${interaction.user.tag}`);
    await interaction.reply({
      content: before === config.ranks.length ? `I could not find ${name}.` : `Removed ${name}. The website will update soon.`,
      ephemeral: true
    });
  }

});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  if (newMember.guild.id !== config.guildId) return;
  const oldRoles = [...oldMember.roles.cache.keys()].sort().join(",");
  const newRoles = [...newMember.roles.cache.keys()].sort().join(",");
  if (oldRoles !== newRoles) scheduleUpdate("member roles changed");
});

client.on(Events.GuildRoleCreate, (role) => {
  if (role.guild.id === config.guildId) scheduleUpdate("role created");
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  if (newRole.guild.id === config.guildId) scheduleUpdate("role updated");
});

client.on(Events.GuildRoleDelete, (role) => {
  if (role.guild.id === config.guildId) scheduleUpdate("role deleted");
});

await client.login(discordToken);
