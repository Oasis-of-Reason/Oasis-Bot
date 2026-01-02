import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../utils/prisma";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("vrc-set-group-id")
		.setDescription("Set the VRChat Group ID for this Discord server.")
		.addStringOption(o =>
			o
				.setName("group_id")
				.setDescription("The VRChat Group ID (e.g., grp_xxxxxxx)")
				.setRequired(true)
		),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply("❌ This command can only be used inside a server.");
			return;
		}

		const guildId = ix.guildId!;
		const interaction = ix.interaction as ChatInputCommandInteraction;
		const groupId = interaction.options.getString("group_id", true).trim();

		await ix.reply("⏳ Updating VRChat Group ID…");

		try {
			// Upsert ensures the row exists even if guild didn't have a config yet
			const updated = await prisma.guildConfig.upsert({
				where: { id: guildId },
				update: { vrcGroupId: groupId },
				create: {
					id: guildId,
					vrcGroupId: groupId,
				},
			});

			await ix.editReply(
				`✅ VRChat Group ID has been set to:\n\`${updated.vrcGroupId}\``
			);
		} catch (err: any) {
			console.error("set-vrc-group-id error:", err);
			await ix.editReply(
				`❌ Failed to update VRChat Group ID: ${err?.message ?? "Unknown error"}`
			);
		}
	},
};
