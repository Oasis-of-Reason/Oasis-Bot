const vrcGamingRoleId = `1416811955074891776`;
const vrcSocialRoleId = `1425104014084673556`;
const vrcCinemaRoleId = `1422352173622366358`;
const vrcArtRoleId = `1438102765141491814`;
const vrcMindfulnessId = `1438102558743859211`;
const discordGamingRoleId = `1416812117423816867`;
const discordSocialRoleId = `1419732188202533036`;
const discordCinemaRoleId = `1425104189444460636`;
const discordArtRoleId = `1438102730546876457`;
const discordMindfulnessId = `1438102680412360764`;

export const allowedPingRoles = [
	vrcGamingRoleId,
	vrcSocialRoleId,
	vrcCinemaRoleId,
	vrcArtRoleId,
	vrcMindfulnessId,
	discordGamingRoleId,
	discordSocialRoleId,
	discordCinemaRoleId,
	discordArtRoleId,
	discordMindfulnessId
];

export const pingMap: Record<string, Record<string, { value: string }>> = {
	vrc: {
		gaming: {
			value: `<@&${vrcGamingRoleId}>`,
		},
		social: {
			value: `<@&${vrcSocialRoleId}>`,
		},
		cinema: {
			value: `<@&${vrcCinemaRoleId}>`,
		},
		art: {
			value: `<@&${vrcArtRoleId}>`,
		},
		mindfulness: {
			value: `<@&${vrcMindfulnessId}>`,
		},
	},
	discord: {
		gaming: {
			value: `<@&${discordGamingRoleId}>`,
		},
		social: {
			value: `<@&${discordSocialRoleId}>`,
		},
		cinema: {
			value: `<@&${discordCinemaRoleId}>`,
		},
		art: {
			value: `<@&${discordArtRoleId}>`,
		},
		mindfulness: {
			value: `<@&${discordMindfulnessId}>`,
		},
	}
};

// Map for avatar performance requirement emojis
export const emojiMapRequirements: Record<string, { emoji: string; label: string, emojiText: string }> = {
	verypoor: {
		emoji: "<:VeryPoor:1423045477242503319>",
		label: "No Restriction",
		emojiText: ":VeryPoor:"
	},
	poor: {
		emoji: "<:Poor:1423045444354965527>",
		label: "Poor or better",
		emojiText: ":Poor:"
	},
	medium: {
		emoji: "<:Medium:1423045576567689226>",
		label: "Medium or better",
		emojiText: ":Medium:"
	},
	good: {
		emoji: "<:Good:1423045376423760092>",
		label: "Good or better",
		emojiText: ":Good:"
	},
	excellent: {
		emoji: "<:VeryGood:1423045342760275989>",
		label: "Excellent or better",
		emojiText: ":VeryGood:"
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
	discord: {
		emoji: "<:DiscordLogo:1437580033312034846>",
		label: "Discord",
		emojiText: ":DiscordLogo:"
	},
	vrchat: {
		emoji: "<:VRCLogo:1437580004090445924>",
		label: "VRChat",
		emojiText: ":VRCLogo:"
	},
};