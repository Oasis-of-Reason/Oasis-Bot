// src/commands/vrc-login.ts
import {
	ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { isVrcCookieValid, loginToVRChat } from "../helpers/vrcHelpers";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("vrc-login")
		.setDescription("Log in the bot to VRChat (stores session cookie in the DB).")
		.addStringOption(o =>
			o
				.setName("otp_code")
				.setDescription("2FA code (if needed)")
				.setRequired(false)
		),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply("❌ This command can only be used in a server.");
			return;
		}

		const guildId = ix.guildId!;
		const username = process.env.VRC_USERNAME;  
		const password = process.env.VRC_PASSWORD; 

		if (!username || !password) {
			await ix.reply("❌ Missing VRChat credentials in environment variables.");
			return;
		}

		const interaction = ix.interaction as ChatInputCommandInteraction;
		const otpCode = interaction.options.getString("otp_code") ?? undefined;

		await ix.reply({content:"⏳ Checking VRChat session…", flags: MessageFlags.Ephemeral});

		try {
			// 1) Look up existing cookie from DB
			const config = await prisma.guildConfig.findUnique({
				where: { id: guildId },
				select: { vrcLoginToken: true },
			});

			let cookie = config?.vrcLoginToken ?? null;
			let reusedExisting = false;

			// 2) If we have a cookie, test if it's valid
			if (cookie) {
				const stillValid = await isVrcCookieValid(cookie);
				if (stillValid) {
					reusedExisting = true;
				} else {
					cookie = null;
				}
			}

			// 3) If not logged in, perform login and store cookie
			if (!cookie) {
				await ix.editReply("⏳ Existing session invalid or missing — logging into VRChat…");

				const result = await loginToVRChat(username, password, otpCode);
				cookie = result.cookie;

				// Save cookie in GuildConfig
				await prisma.guildConfig.upsert({
					where: { id: guildId },
					update: { vrcLoginToken: cookie },
					create: {
						id: guildId,
						vrcLoginToken: cookie,
					},
				});
			}

			// 4) Final confirmation
			if (reusedExisting) {
				await ix.editReply("✅ VRChat session is already valid. No new login was needed.");
			} else {
				await ix.editReply("✅ Logged into VRChat and stored the new session in the database.");
			}
		} catch (err: any) {
			console.error("vrc-login error:", err?.response?.data ?? err);
			await ix.editReply(
				`❌ VRChat login failed: ${err?.message ?? "Unknown error"}`
			);
		}
	},
};
