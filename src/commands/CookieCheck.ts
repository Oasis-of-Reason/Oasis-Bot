import {
	SlashCommandBuilder,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-check")
		.setDescription("Check how many cookies you have."),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply({
				content: "❌ This command can only be used inside a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guildId = ix.interaction.guild.id;
		const userId = ix.interaction.user.id;

		try {
			// Look up the user's cookie record
			const cookieUser = await prisma.cookiesUser.findUnique({
				where: {
					guildId_userId: { guildId, userId },
				},
			});

			const cookies = cookieUser?.cookies ?? 0;

			await ix.reply({
				content: `🍪 You currently have **${cookies} cookie${cookies === 1 ? "" : "s"}**.`,
				flags: MessageFlags.Ephemeral,
			});
		} catch (error) {
			console.error("Error fetching cookie count:", error);
			await ix.reply({
				content: "❌ Could not fetch your cookie count. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
