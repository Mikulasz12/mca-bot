import { SlashCommandBuilder } from 'discord.js';

import { buildInfoReply } from '../guidance/messages.js';

export const infoCommandData = new SlashCommandBuilder()
  .setName('info')
  .setDescription('Show how to find MCA, Minecraft, and log information');

export const uptimeCommandData = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Show how long the MCA bot has been online');

function formatUptime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds ?? 0) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

export async function handlePublicCommand(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'info') {
    await interaction.reply(buildInfoReply());
    return true;
  }

  if (interaction.commandName === 'uptime') {
    const uptime = formatUptime(interaction.client.uptime);
    const ping = Math.max(0, Math.round(interaction.client.ws.ping));
    await interaction.reply({ content: `Online for **${uptime}** • Discord gateway ping **${ping} ms**` });
    return true;
  }

  return false;
}
