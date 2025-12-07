// src/commands/vrcCreateEvent.ts
import { AutoModerationRuleEventType, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { createGroupEvent, parseAndMapArray, platformMap, subtypeMap, VrcEventDescription } from "../helpers/vrcHelpers";

const API_BASE = "https://api.vrchat.cloud/api/1";
const API_KEY = process.env.VRC_API_KEY || "JlE5Jldo5Jibnk5O5hTx6XVqsJu4WJ26";

// Simple helper: check if a stored cookie still represents a logged-in session
async function isVrcCookieValid(cookie: string): Promise<boolean> {
	if (!cookie) return false;

	const http = axios.create({
		baseURL: API_BASE,
		withCredentials: true,
		headers: {
			"User-Agent": "OasisBot/1.0",
			Cookie: cookie,
		},
		params: { apiKey: API_KEY },
		validateStatus: () => true,
	});

	const res = await http.get("/auth/user");
	return res.status === 200; // 200 => logged in
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName("vrc-create-event")
		.setDescription("Create a VRChat group calendar event from a stored Event.")
		.addIntegerOption(o =>
			o
				.setName("event_id")
				.setDescription("Internal event ID")
				.setRequired(true)
		)
		.addStringOption(o =>
			o
				.setName("short_desc")
				.setDescription("Short desc max 1000 char")
				.setRequired(false)
		)
		.addBooleanOption(o =>
			o
				.setName("send_creation_notification")
				.setDescription("Whether to notify group")
				.setRequired(false)
		)
		.addStringOption(o =>
			o
				.setName("image_id")
				.setDescription("vrc image id for banner")
				.setRequired(false)
		)
		.addIntegerOption(o =>
			o
				.setName("host_join_before_time")
				.setDescription("Time in minutes before event host can join instance")
				.setRequired(false)
		)
		.addIntegerOption(o =>
			o
				.setName("guest_join_before_time")
				.setDescription("Time in minutes before event guests can join instance")
				.setRequired(false)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply("❌ This command can only be used in a server.");
			return;
		}

		const guildId = interaction.guildId!;
		const eventId = interaction.options.getInteger("event_id", true);
		const shortDesc = interaction.options.getString("short_desc", false);
		const sendCreationNotification = interaction.options.getBoolean("send_creation_notification", false);
		const imageId = interaction.options.getString("image_id", false);
		const hostJoinBeforeTime = interaction.options.getInteger("host_join_before_time", false);
		const guestJoinBeforeTime = interaction.options.getInteger("guest_join_before_time", false);

		await interaction.reply("⏳ Checking VRChat login and loading event…");

		try {
			// 1) Grab the VRChat cookie for this guild from GuildConfig
			const guildConfig = await prisma.guildConfig.findUnique({
				where: { id: guildId },
				select: { vrcLoginToken: true },
			});

			const cookie = guildConfig?.vrcLoginToken ?? null;

			if (!cookie) {
				await interaction.editReply(
					"❌ The bot is not logged into VRChat. Please run `/vrc-login` first."
				);
				return;
			}

			// 2) Check if cookie is still valid
			const valid = await isVrcCookieValid(cookie);
			if (!valid) {
				await interaction.editReply(
					"❌ VRChat session is no longer valid. Please run `/vrc-login` again."
				);
				return;
			}

			// 3) Load the Event record from Prisma
			const ev = await prisma.event.findUnique({
				where: { id: eventId },
				select: {
					id: true,
					published: true,
					scope: true,
					guildId: true,
					title: true,
					description: true,
					imageUrl: true,
					startTime: true,
					lengthMinutes: true,
					type: true,
					subtype: true,
					platforms: true,
				},
			});

			if (!ev || ev.guildId !== guildId) {
				await interaction.editReply(
					"❌ Could not find that event for this server."
				);
				return;
			}

			// Optional: ensure it's a VRC-type event
			if (ev.type.toLowerCase() !== "vrc") {
				await interaction.editReply(
					"❌ That event is not marked as a VRChat event."
				);
				return;
			}

			// 4) Build payload for createGroupEvent from Event fields
			const eventDesc = new VrcEventDescription(
				ev.title,
				shortDesc ?? ev.description ?? "",
				subtypeMap[ev.subtype.toLowerCase()],
				ev.startTime.toISOString(),
				ev.lengthMinutes ?? 60,
				imageId ?? "file_969fc1a3-be17-450b-9c7d-e3609358779e", // Temporary generic image
				parseAndMapArray(ev.platforms as string, platformMap),
				sendCreationNotification ?? false,
				hostJoinBeforeTime ?? 15, // host join before minutes
				guestJoinBeforeTime ?? 10 // guest join before minutes
			);

			const created = await createGroupEvent(cookie, eventDesc);

			const idText = created?.id ? ` (id: \`${created.id}\`)` : "";
			await interaction.editReply(
				`✅ Created VRChat event${idText} from Event #${ev.id}:\n` +
				`• **${ev.title}**\n` +
				`• Starts: \`${eventDesc.startAtISO}\`\n` +
				`• Duration: **${eventDesc.durationMinutes}m**`
			);
		} catch (err: any) {
			console.error("vrc-create-event error:", err?.response?.data ?? err);
			await interaction.editReply(
				`❌ Failed to create VRChat event: ${err?.message ?? "Unknown error"}`
			);
		}
	},
};
