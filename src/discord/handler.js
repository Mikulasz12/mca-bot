import { authorizeScanExport } from '../access.js';
import { createThreadRecord } from '../export/record.js';
import { collectThreads } from '../scan/collect-threads.js';
import { selectStarterAndReplies } from '../scan/select-messages.js';

function isScanExportInteraction(interaction) {
  if (!interaction.isChatInputCommand?.()) return false;
  if (interaction.commandName !== 'scan') return false;

  try {
    return interaction.options.getSubcommand(false) === 'export';
  } catch {
    return false;
  }
}

function getRoleIds(interaction) {
  const cache = interaction.member?.roles?.cache;
  if (!cache?.keys) return [];
  return [...cache.keys()];
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function appliedTagsForThread(forum, thread) {
  const namesById = new Map((forum.availableTags ?? []).map((tag) => [tag.id, tag.name]));
  return (thread.appliedTagIds ?? []).map((id) => ({ id, name: namesById.get(id) ?? null }));
}

function summaryText({ threadCount, threadErrorCount, outputPath }) {
  const errorLabel = threadErrorCount === 1 ? 'thread error' : 'thread errors';
  return [
    `Export complete: ${threadCount} threads, ${threadErrorCount} ${errorLabel}.`,
    `Saved locally to: ${outputPath}`,
  ].join('\n');
}

export function createInteractionHandler({ config, adapter, writerFactory, now = () => new Date() }) {
  let scanRunning = false;

  return async function handleInteraction(interaction) {
    if (!isScanExportInteraction(interaction)) return false;

    const authorization = authorizeScanExport(
      {
        userId: interaction.user.id,
        guildId: interaction.guildId ?? null,
        roleIds: getRoleIds(interaction),
      },
      config,
    );

    if (!authorization.allowed) {
      await interaction.reply({
        content: 'You are not authorized to run this command here.',
        ephemeral: true,
      });
      return true;
    }

    if (scanRunning) {
      await interaction.reply({
        content: 'A scan export is already running.',
        ephemeral: true,
      });
      return true;
    }

    scanRunning = true;
    let writer;

    try {
      await interaction.deferReply({ ephemeral: Boolean(interaction.guildId) });

      const exportedAt = now();
      writer = await writerFactory({ exportDir: config.exportDir, now: exportedAt });
      let threadCount = 0;
      let threadErrorCount = 0;

      for (const channelId of config.forumChannelIds) {
        const forum = await adapter.openForum(channelId);
        const threads = await collectThreads({
          fetchActive: forum.fetchActive,
          fetchArchived: forum.fetchArchived,
        });

        for (const thread of threads) {
          threadCount += 1;
          const baseRecordInput = {
            exportedAt,
            guildId: config.allowedGuildId,
            forum: {
              id: forum.id,
              name: forum.name,
              tags: appliedTagsForThread(forum, thread),
            },
            thread,
          };

          try {
            const { starter, messages } = await forum.readThread(thread);
            const selected = selectStarterAndReplies(starter, messages, 5);
            await writer.append(
              createThreadRecord({
                ...baseRecordInput,
                starter: selected.starter,
                replies: selected.replies,
                errors: [],
              }),
            );
          } catch (error) {
            threadErrorCount += 1;
            await writer.append(
              createThreadRecord({
                ...baseRecordInput,
                starter: null,
                replies: [],
                errors: [errorMessage(error)],
              }),
            );
          }
        }
      }

      const outputPath = await writer.commit();
      const content = summaryText({ threadCount, threadErrorCount, outputPath });

      try {
        await interaction.editReply({ content, files: [outputPath] });
      } catch {
        await interaction.editReply({
          content: `${content}\nDiscord could not attach the export; it is saved locally.`,
        });
      }
    } catch (error) {
      await writer?.abort();
      await interaction.editReply({ content: `Scan failed: ${errorMessage(error)}` });
    } finally {
      scanRunning = false;
    }

    return true;
  };
}
