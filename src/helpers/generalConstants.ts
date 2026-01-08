import { eventSubType } from "@prisma/client";

const vrcGamingRoleId = `1416811955074891776`;
const vrcSocialRoleId = `1425104014084673556`;
const vrcCinemaRoleId = `1422352173622366358`;
const vrcArtRoleId = `1438102765141491814`;
const vrcWellnessId = `1438102558743859211`;
const discordGamingRoleId = `1416812117423816867`;
const discordSocialRoleId = `1419732188202533036`;
const discordCinemaRoleId = `1425104189444460636`;
const discordArtRoleId = `1438102730546876457`;
const discordWellnessId = `1438102680412360764`;
const cookieUpdatesRole = `1439614599514292316`;

export const oasisPremiumId = `1445880182274785380`;

export const allowedPingRolesEvents = [
	vrcGamingRoleId,
	vrcSocialRoleId,
	vrcCinemaRoleId,
	vrcArtRoleId,
	vrcWellnessId,
	discordGamingRoleId,
	discordSocialRoleId,
	discordCinemaRoleId,
	discordArtRoleId,
	discordWellnessId
];

export const allowedPingRolesCookies = [
	cookieUpdatesRole,
];

export const cookieUpdatesMentionString = `<@&${cookieUpdatesRole}>`;

export const pingMap: Record<string, Record<string, { value: string }>> = {
	VRCHAT: {
		GAMING: {
			value: `<@&${vrcGamingRoleId}>`,
		},
		SOCIAL: {
			value: `<@&${vrcSocialRoleId}>`,
		},
		CINEMA: {
			value: `<@&${vrcCinemaRoleId}>`,
		},
		ART: {
			value: `<@&${vrcArtRoleId}>`,
		},
		WELLNESS: {
			value: `<@&${vrcWellnessId}>`,
		},
	},
	DISCORD: {
		GAMING: {
			value: `<@&${discordGamingRoleId}>`,
		},
		SOCIAL: {
			value: `<@&${discordSocialRoleId}>`,
		},
		CINEMA: {
			value: `<@&${discordCinemaRoleId}>`,
		},
		ART: {
			value: `<@&${discordArtRoleId}>`,
		},
		WELLNESS: {
			value: `<@&${discordWellnessId}>`,
		},
	}
};

// Map for avatar performance requirement emojis
export const emojiMapRequirements: Record<string, { emoji: string; label: string, emojiText: string }> = {
	verypoor: {
		emoji: "<:VRChat_VeryPoor:1425560164798304307>",
		label: "No Restriction",
		emojiText: ":VRChat_VeryPoor:"
	},
	poor: {
		emoji: "<:VRChat_Poor:1425560228149334016>",
		label: "Poor or better",
		emojiText: ":VRChat_Poor:"
	},
	medium: {
		emoji: "<:VRChat_Medium:1425560237900828813>",
		label: "Medium or better",
		emojiText: ":VRChat_Medium:"
	},
	good: {
		emoji: "<:VRChat_Good:1425560249523507210>",
		label: "Good or better",
		emojiText: ":VRChat_Good:"
	},
	excellent: {
		emoji: "<:VRChat_Excellent:1425560260432892095>",
		label: "Excellent or better",
		emojiText: ":VRChat_Excellent:"
	},
};

// Map for platforms emojis
export const emojiMapPlatforms: Record<string, { emoji: string; label: string, emojiText: string }> = {
	pcvr: {
		emoji: "<:PCVRC:1437583595383296010>",
		label: "PCVRC",
		emojiText: ":PCVRC:"
	},
	android: {
		emoji: "<:AndroidVRC:1437583606632550410>",
		label: "Android",
		emojiText: ":AndroidVRC:"
	},
};

// Map for event type emojis
export const emojiMapTypes: Record<string, { emoji: string; label: string, emojiText: string }> = {
	DISCORD: {
		emoji: "<:DiscordLogo:1437580033312034846>",
		label: "Discord",
		emojiText: ":DiscordLogo:"
	},
	VRCHAT: {
		emoji: "<:VRCLogo:1437580004090445924>",
		label: "VRChat",
		emojiText: ":VRCLogo:"
	},
};

// --- Event subtype metadata
export const EVENT_SUBTYPE_META = {
	GAMING: { label: "Gaming", emoji: "🎮", googleColorId: "2" },
	SOCIAL: { label: "Social", emoji: "🧑‍🤝‍🧑", googleColorId: "11" },
	CINEMA: { label: "Cinema", emoji: "🎬", googleColorId: "1" },
	WELLNESS: { label: "Wellness", emoji: "🧘", googleColorId: "7" },
	ART: { label: "Art", emoji: "🎨", googleColorId: "5" },
} satisfies Record<eventSubType, { label: string; emoji: string; googleColorId: string }>;