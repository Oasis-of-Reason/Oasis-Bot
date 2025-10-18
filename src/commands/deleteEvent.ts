import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
	GuildMember,
	TextChannel,
	ThreadChannel,
	Guild,
} from "discord.js";
import {
	userHasAllowedRoleOrId,
	getStandardRolesMod,
	getStandardRolesOrganizer,
} from "../helpers/securityHelpers";
import { PrismaClient } from "@prisma/client";
import { refreshPublishedCalender } from "../helpers/refreshPublishedCalender";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("delete-event")
		.setDescription("Delete an event (and its related messages/threads)")
		.addNumberOption((option) =>
			option
				.setName("id")
				.setDescription("ID of the event to delete")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used in a server!",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const id = interaction.options.getNumber("id");
		if (!id) {
			await interaction.reply({
				content: "❌ You must specify an event ID.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			const event = await prisma.event.findUnique({ where: { id } });

			if (!event) {
				await interaction.reply({
					content: `❌ No event found with ID **${id}**.`,
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			// Permission check: mod if published, organizer||event's host if not
			if ((!event.published && !userHasAllowedRoleOrId(interaction.member as GuildMember, getStandardRolesOrganizer(), [event.hostId]) ||
				!userHasAllowedRoleOrId(interaction.member as GuildMember, getStandardRolesMod()))
			) {
				await interaction.reply({
					content: "❌ You don't have permission for this command.",
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const client = interaction.client;

			let deletedPublishedMsg = false;
			let deletedPublishedThread = false;
			let deletedDraftMsg = false;
			let deletedDraftThread = false;

			// --- DELETE PUBLISHED MESSAGE & THREAD ---
			if (event.published && event.publishedChannelId) {
				try {
					const channel = (await client.channels.fetch(event.publishedChannelId)) as TextChannel;

					if (event.publishedChannelMessageId) { deleteRepliesToMessage(channel, event.publishedChannelMessageId) };

					// Delete published message
					if (channel && event.publishedChannelMessageId) {
						const msg = await channel.messages.fetch(event.publishedChannelMessageId).catch(() => null);
						if (msg) {
							await msg.delete().catch(() => { });
							deletedPublishedMsg = true;
						}
					}

					// Delete published thread
					if (event.publishedThreadId) {
						const thread = await client.channels.fetch(event.publishedThreadId).catch(() => null);
						if (thread && thread.isThread()) {
							await (thread as ThreadChannel).delete().catch(() => { });
							deletedPublishedThread = true;
						}
					}
				} catch (err) {
					console.warn(`⚠️ Failed to delete published items for event ${id}:`, err);
				}
			}

			// --- DELETE DRAFT MESSAGE & THREAD ---
			if (event.draftChannelId) {
				try {
					const draftChannel = (await client.channels.fetch(event.draftChannelId)) as TextChannel;

					// Delete draft message
					if (draftChannel && event.draftThreadMessageId) {
						const msg = await draftChannel.messages.fetch(event.draftThreadMessageId).catch(() => null);
						if (msg) {
							await msg.delete().catch(() => { });
							deletedDraftMsg = true;
						}
					}

					// Delete draft thread
					if (event.draftThreadId) {
						const thread = await client.channels.fetch(event.draftThreadId).catch(() => null);
						if (thread && thread.isThread()) {
							await (thread as ThreadChannel).delete().catch(() => { });
							deletedDraftThread = true;
						}
					}
				} catch (err) {
					console.warn(`⚠️ Failed to delete draft items for event ${id}:`, err);
				}
			}

			// --- DELETE DATABASE ENTRY ---
			const deletedEvent = await prisma.event.delete({ where: { id } });

			// --- FINAL REPLY ---
			await interaction.reply({
				content:
					`✅ **Event Deleted Successfully!**\n\n` +
					`**Event:** ${deletedEvent.title}\n` +
					`**Start:** ${deletedEvent.startTime.toLocaleString()}\n\n` +
					`🧹 **Cleanup Summary:**\n` +
					`• Published Message: ${deletedPublishedMsg ? "✅ Deleted" : "⚠️ Not Found"}\n` +
					`• Published Thread: ${deletedPublishedThread ? "✅ Deleted" : "⚠️ Not Found"}\n` +
					`• Draft Message: ${deletedDraftMsg ? "✅ Deleted" : "⚠️ Not Found"}\n` +
					`• Draft Thread: ${deletedDraftThread ? "✅ Deleted" : "⚠️ Not Found"}`,
				flags: MessageFlags.Ephemeral,
			});

			await refreshPublishedCalender(client, interaction.guildId as string, false);

		} catch (error: any) {
			console.error("Error deleting event:", error);
			if (error.code === "P2025") {
				await interaction.reply({
					content: `❌ No event found with ID **${id}**.`,
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					content: "❌ An unexpected error occurred while deleting the event.",
					flags: MessageFlags.Ephemeral,
				});
				await refreshPublishedCalender(interaction.client, interaction.guildId as string, false);
			}
		}
	},
};

async function deleteRepliesToMessage(channel: TextChannel, parentMessageId: string) {
	// Fetch a reasonable number of recent messages
	const messages = await channel.messages.fetch({ limit: 100 });

	// Filter for replies to the given message
	const replies = messages.filter(msg => msg.reference?.messageId === parentMessageId);

	console.log(`Found ${replies.size} replies to message ${parentMessageId}`);

	// Delete each reply (with safety)
	for (const [, reply] of replies) {
		try {
			await reply.delete();
			console.log(`Deleted reply ${reply.id}`);
		} catch (err) {
			console.warn(`Failed to delete reply ${reply.id}:`, err);
		}
	}
}