import axios from "axios";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

const API_BASE = "https://api.vrchat.cloud/api/1";
const API_KEY = process.env.VRC_API_KEY || "JlE5Jldo5Jibnk5O5hTx6XVqsJu4WJ26";

function extractCookie(setCookie: string[] | undefined): string[] {
  if (!setCookie?.length) return [];
  // keep only name=value
  return setCookie.map(c => c.split(";")[0]).filter(Boolean);
}
function mergeCookies(...lists: (string | null | undefined | string[])[]): string {
  const parts = new Map<string, string>(); // name -> value
  for (const list of lists) {
    const arr = Array.isArray(list) ? list : (list ? [list as string] : []);
    for (const cookie of arr) {
      const [name, value] = cookie.split("=");
      if (name && value) parts.set(name.trim(), value.trim());
    }
  }
  return Array.from(parts.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function loginToVRChat(username: string, password: string, otpCode?: string) {
  const base = axios.create({
    baseURL: API_BASE,
    withCredentials: true,
    headers: { "User-Agent": "OasisBot/1.0" },
    params: { apiKey: API_KEY },
    validateStatus: () => true,
  });

  // 1) Seed session using Basic Auth
  const res1 = await base.get("/auth/user", { auth: { username, password } });
  const cookies1 = extractCookie(res1.headers["set-cookie"]);
  const requires = (res1.data?.requiresTwoFactorAuth ?? []) as string[];

  // No 2FA required
  if (res1.status === 200 && cookies1.length && requires.length === 0) {
    // Double-check session works
    const cookie = mergeCookies(cookies1);
    const check = await base.get("/auth/user", { headers: { Cookie: cookie } });
    if (check.status === 200) return { cookie };
    throw new Error(`Unexpected auth check failure (${check.status})`);
  }

  // 2FA required
  if (res1.status === 200 && requires.length) {
    if (!otpCode) {
      throw new Error(`2FA required (${requires.join(", ")}). Provide otp_code.`);
    }
    if (!cookies1.length) throw new Error("No initial auth cookie from /auth/user.");

    const hasTotp = requires.includes("totp");
    const hasEmail = requires.includes("emailOtp") || requires.includes("otp");
    const verifyPath = hasTotp
      ? "/auth/twofactorauth/totp/verify"
      : hasEmail
      ? "/auth/twofactorauth/emailotp/verify"
      : null;

    if (!verifyPath) throw new Error(`Unsupported 2FA methods: ${requires.join(", ")}`);

    // submit 2FA with the initial cookie
    const res2 = await base.post(
      verifyPath,
      { code: otpCode },
      { headers: { Cookie: mergeCookies(cookies1) } }
    );
    const cookies2 = extractCookie(res2.headers["set-cookie"]);
    if (!(res2.status >= 200 && res2.status < 300)) {
      throw new Error(`2FA submit failed (${res2.status}): ${JSON.stringify(res2.data)}`);
    }

    // 3) Finalize session: call /auth/user with combined cookies, no Basic
    const cookieMerged = mergeCookies(cookies1, cookies2);
    const res3 = await base.get("/auth/user", { headers: { Cookie: cookieMerged } });
    const cookies3 = extractCookie(res3.headers["set-cookie"]);
    if (res3.status !== 200) {
      throw new Error(`Post-2FA auth check failed (${res3.status}): ${JSON.stringify(res3.data)}`);
    }

    // return merged cookie from all steps
    return { cookie: mergeCookies(cookieMerged, cookies3) };
  }

  // Anything else is a failure
  throw new Error(`Login failed (${res1.status}): ${JSON.stringify(res1.data)}`);
}


// ====== Create Group Calendar Event (unchanged) ======
async function createGroupEvent(cookie: string, {
	groupId,
	name,
	description,
	startAtISO,
	durationMinutes,
	worldId,
	instanceId,
	imageUrl,
}: {
	groupId: string;
	name: string;
	description?: string;
	startAtISO: string;
	durationMinutes: number;
	worldId?: string | null;
	instanceId?: string | null;
	imageUrl?: string | null;
}) {
	const start = new Date(startAtISO);
	//const end = new Date(start.getTime() + durationMinutes * 60_000).toISOString();

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

	// POST /calendar/{groupId}/event
	const res = await http.post(`/calendar/${"grp_99651034-24b5-495d-a21e-e11d00e813c6"}/event`, {
		title:"TEST NAME",
		description: "TEST DESC",
		startsAt: "2025-11-11T17:02:37Z",
		endsAt: "2025-11-11T18:03:37Z",
		category: "performance",
		accessType: "group",
		worldId: worldId ?? null,
		instanceId: instanceId ?? null,
		imageUrl: imageUrl ?? null,
	});

	if (res.status >= 200 && res.status < 300) return res.data;
	throw new Error(`VRC_CREATE_EVENT_FAILED (${res.status}): ${JSON.stringify(res.data)}`);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName("vrc-create-event")
		.setDescription("Create a VRChat group calendar event (via VRChat API)")
		// REQUIRED FIRST
		.addStringOption(o => o.setName("group_id").setDescription("VRChat Group ID (grp_...)").setRequired(true))
		.addStringOption(o => o.setName("name").setDescription("Event title").setRequired(true))
		.addStringOption(o => o.setName("start_at").setDescription("Start time (ISO8601)").setRequired(true))
		.addIntegerOption(o => o.setName("duration_minutes").setDescription("Duration in minutes").setRequired(true))
		// OPTIONAL AFTER
		.addStringOption(o => o.setName("description").setDescription("Description"))
		.addStringOption(o => o.setName("world_id").setDescription("World ID"))
		.addStringOption(o => o.setName("instance_id").setDescription("Instance ID"))
		.addStringOption(o => o.setName("image_url").setDescription("Image URL"))
		.addStringOption(o => o.setName("otp_code").setDescription("2FA code (if needed)"))
		.setDMPermission(false),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply("❌ This command can only be used in a server.");
			return;
		}

		const username = process.env.VRC_USERNAME;
		const password = process.env.VRC_PASSWORD;
		if (!username || !password) {
			await interaction.reply("❌ Missing VRChat credentials in environment variables.");
			return;
		}

		const groupId = interaction.options.getString("group_id", true);
		const name = interaction.options.getString("name", true);
		const startAtISO = interaction.options.getString("start_at", true);
		const durationMinutes = interaction.options.getInteger("duration_minutes", true);
		const description = interaction.options.getString("description") ?? "";
		const worldId = interaction.options.getString("world_id") ?? null;
		const instanceId = interaction.options.getString("instance_id") ?? null;
		const imageUrl = interaction.options.getString("image_url") ?? null;
		const otpCode = interaction.options.getString("otp_code") ?? undefined;

		await interaction.reply("⏳ Logging into VRChat…");

		try {
			const { cookie } = await loginToVRChat(username, password, otpCode);
			const created = await createGroupEvent(cookie, {
				groupId,
				name,
				description,
				startAtISO,
				durationMinutes,
				worldId,
				instanceId,
				imageUrl,
			});

			const idText = created?.id ? ` (id: \`${created.id}\`)` : "";
			await interaction.editReply(
				`✅ Created VRChat event${idText}:\n` +
				`• **${name}**\n` +
				`• Starts: \`${startAtISO}\`\n` +
				`• Duration: **${durationMinutes}m**`
			);
		} catch (err: any) {
			console.error("vrc-create-event error:", err?.response?.data ?? err);
			await interaction.editReply(`❌ Failed to create VRChat event: ${err?.message ?? "Unknown error"}`);
		}
	},
};
