import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../utils/prisma";

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

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply("❌ This command can only be used inside a server.");
			return;
		}

		const guildId = interaction.guildId!;
		const groupId = interaction.options.getString("group_id", true).trim();

		await interaction.reply("⏳ Updating VRChat Group ID…");

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

			await interaction.editReply(
				`✅ VRChat Group ID has been set to:\n\`${updated.vrcGroupId}\``
			);
		} catch (err: any) {
			console.error("set-vrc-group-id error:", err);
			await interaction.editReply(
				`❌ Failed to update VRChat Group ID: ${err?.message ?? "Unknown error"}`
			);
		}
	},
};
