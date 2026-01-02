import { 
	ChatInputCommandInteraction, 
	SlashCommandBuilder 
} from "discord.js";
import axios from "axios";
import { prisma } from "../utils/prisma";
import {
	createOrUpdateGroupEvent,
	parseAndMapArray,
	platformMap,
	subtypeMap,
	VrcEventDescription,
} from "../helpers/vrcHelpers";
import { getVrcGroupId } from "../helpers/discordHelpers";
import { TrackedInteraction } from "../utils/interactionSystem";

const API_BASE = "https://api.vrchat.cloud/api/1";
const API_KEY = process.env.VRC_API_KEY || "JlE5Jldo5Jibnk5O5hTx6XVqsJu4WJ26";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("vrc-create-event")
		.setDescription("Create or update a VRChat group calendar event from a stored Event.")
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
		),

	async execute(ix: TrackedInteraction) {

		if (!ix.interaction.guild) {
			await ix.reply("❌ This command can only be used in a server.");
			return;
		}

		const guildId = ix.guildId!;
		const interaction = ix.interaction as ChatInputCommandInteraction;
		const eventId = interaction.options.getInteger("event_id", true);
		const shortDesc = interaction.options.getString("short_desc", false);
		const sendCreationNotification = interaction.options.getBoolean(
			"send_creation_notification",
			false
		);
		const imageId = interaction.options.getString("image_id", false);

		await ix.reply("⏳ Checking VRChat login and loading event…");

		try {
			// 1) Grab the VRChat cookie for this guild from GuildConfig
			const guildConfig = await prisma.guildConfig.findUnique({
				where: { id: guildId },
				select: { vrcLoginToken: true },
			});

			const groupId = await getVrcGroupId(ix.guildId!);

			if (!groupId) {
				return ix.reply("❌ No VRChat Group ID is set for this server.");
			}

			const cookie = guildConfig?.vrcLoginToken ?? null;

			if (!cookie) {
				await ix.editReply(
					"❌ The bot is not logged into VRChat. Please run `/vrc-login` first."
				);
				return;
			}

			// 2) Check if cookie is still valid
			const valid = await isVrcCookieValid(cookie);
			if (!valid) {
				await ix.editReply(
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
					vrcCalenderEventId: true,
					vrcSendNotification: true,
					vrcDescription: true,
					vrcImageId: true,
					vrcGroupId: true,
				},
			});

			if (!ev || ev.guildId !== guildId) {
				await ix.editReply(
					"❌ Could not find that event for this server."
				);
				return;
			}

			// Optional: ensure it's a VRC-type event
			if (ev.type.toLowerCase() !== "VRCHAT") {
				await ix.editReply(
					"❌ That event is not marked as a VRChat event."
				);
				return;
			}

			// 4) Compute the final VRChat-specific values we will both send and store
			const finalVrcDescription =
				shortDesc ?? ev.vrcDescription ?? ev.description ?? "";
			const finalVrcSendNotification =
				sendCreationNotification ?? ev.vrcSendNotification ?? false;
			const finalVrcImageId =
				imageId ??
				ev.vrcImageId ??
				"file_969fc1a3-be17-450b-9c7d-e3609358779e"; // Temporary generic image

			// 5) Build payload for createOrUpdateGroupEvent from Event fields
			const eventDesc = new VrcEventDescription(
				ev.title,
				finalVrcDescription,
				subtypeMap[ev.subtype.toLowerCase()],
				ev.startTime.toISOString(),
				ev.lengthMinutes ?? 60,
				finalVrcImageId,
				parseAndMapArray(ev.platforms as string, platformMap),
				finalVrcSendNotification,
				15, // host join before minutes
				10 // guest join before minutes
			);

			// 6) Create or update the VRChat calendar event
			const createdOrUpdated = await createOrUpdateGroupEvent(
				cookie,
				groupId,
				eventDesc,
				ev.vrcCalenderEventId ?? undefined
			);

			// 7) Persist VRChat-related values back to the Event row
			await prisma.event.update({
				where: { id: ev.id },
				data: {
					vrcCalenderEventId: createdOrUpdated?.id,
					vrcGroupId: groupId
				},
			});

			const idText = createdOrUpdated?.id
				? ` (id: \`${createdOrUpdated.id}\`)`
				: "";
			await ix.editReply(
				`✅ Created/updated VRChat event${idText} from Event #${ev.id}:\n` +
					`• **${ev.title}**\n` +
					`• Starts: \`${eventDesc.startAtISO}\`\n` +
					`• Duration: **${eventDesc.durationMinutes}m**`
			);
		} catch (err: any) {
			console.error("vrc-create-event error:", err?.response?.data ?? err);
			await ix.editReply(
				`❌ Failed to create/update VRChat event: ${
					err?.message ?? "Unknown error"
				}`
			);
		}
	},
};

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