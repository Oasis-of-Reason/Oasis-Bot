import axios from "axios";
import { start } from "repl";

const API_BASE = "https://api.vrchat.cloud/api/1";
const API_KEY = process.env.VRC_API_KEY || "JlE5Jldo5Jibnk5O5hTx6XVqsJu4WJ26";

export const platformMap: Record<string, string> = {
	pcvr: "standalonewindows",
	android: "android",
};

export const subtypeMap: Record<string, string> = {
	gaming: "gaming",
	social: "hangout",
	cinema: "film & media",
	art: "arts",
	mindfulness: "wellness",
};

export class VrcEventDescription {
	constructor(
		public title: string,
		public description: string,
		public category: string,
		public startAtISO: string,
		public durationMinutes: number,
		public imageId: string | null,
		public platforms: string[] | null,
		public sendCreationNotification: boolean | null,
		public hostEarlyJoinMinutes: number | null,
		public guestEarlyJoinMinutes: number | null,
	) { }
}

export async function isVrcCookieValid(cookie: string): Promise<boolean> {
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
	// 200 = logged-in user, anything else = invalid/expired/needs auth
	return res.status === 200;
}

export function parseAndMapArray(
	raw: string,
	dict: Record<string, string>
): string[] {
	if (!raw) return [];

	let arr: string[];

	try {
		// Parse JSON string into array
		const parsed = JSON.parse(raw);

		// Must be an array of strings
		if (!Array.isArray(parsed)) return [];
		arr = parsed.map(x => String(x));
	} catch {
		// Invalid JSON
		return [];
	}

	// Map through dictionary, ignore unknown values
	const result: string[] = [];
	for (const key of arr) {
		if (dict[key.toLowerCase()] !== undefined) {
			result.push(dict[key.toLowerCase()]);
		}
	}

	return result;
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
export async function createGroupEvent(cookie: string, eventDesc: VrcEventDescription) {
	const start = new Date(eventDesc.startAtISO);

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
		title: eventDesc.title,
		description: truncateLongString(eventDesc.description),
		startsAt: eventDesc.startAtISO,//"2025-12-11T17:02:37Z",
		endsAt: addMinutesToISO(eventDesc.startAtISO, eventDesc.durationMinutes),
		category: eventDesc.category,
		imageId: eventDesc.imageId ?? null,
		languages: ["eng"],
		sendCreationNotification: eventDesc.sendCreationNotification,
		usesInstanceOverflow: true,
		platforms: eventDesc.platforms,
		accessType: "group",
		hostEarlyJoinMinutes: eventDesc.hostEarlyJoinMinutes ?? 15,
		guestEarlyJoinMinutes: eventDesc.guestEarlyJoinMinutes ?? 10,
	});

	if (res.status >= 200 && res.status < 300) return res.data;
	throw new Error(`VRC_CREATE_EVENT_FAILED (${res.status}): ${JSON.stringify(res.data)}`);
}

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

function addMinutesToISO(startISO: string, minutes: number): string {
	const start = new Date(startISO);
	const end = new Date(start.getTime() + minutes * 60_000);
	return end.toISOString();
}

function truncateLongString(str: string, max = 1000): string {
	if (str.length <= max) return str;

	// Reserve 3 chars for "..."
	const cutoff = max - 3;
	return str.slice(0, cutoff) + "...";
}