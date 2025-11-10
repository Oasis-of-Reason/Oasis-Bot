const vrcGamingRoleId = `1416811955074891776`;
const vrcSocialRoleId = `1425104014084673556`;
const vrcCinemaRoleId = `1422352173622366358`;
const discordGamingRoleId = `1416812117423816867`;
const discordSocialRoleId = `1419732188202533036`;
const discordCinemaRoleId = `1425104189444460636`;

export const allowedPingRoles = [
	vrcGamingRoleId,
	vrcSocialRoleId,
	vrcCinemaRoleId,
	discordGamingRoleId,
	discordSocialRoleId,
	discordCinemaRoleId
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
	}
};

// Map for avatar performance requirement emojis
export const emojiMapRequirements: Record<string, { emoji: string; label: string }> = {
	verypoor: {
		emoji: "<:VeryPoor:1423045477242503319>",
		label: "No Restriction",
	},
	poor: {
		emoji: "<:Poor:1423045444354965527>",
		label: "Poor or better",
	},
	medium: {
		emoji: "<:Medium:1423045576567689226>",
		label: "Medium or better",
	},
	good: {
		emoji: "<:Good:1423045376423760092>",
		label: "Good or better",
	},
	excellent: {
		emoji: "<:VeryGood:1423045342760275989>",
		label: "Excellent or better",
	},
};

// Map for platforms emojis
export const emojiMapPlatforms: Record<string, { emoji: string; label: string }> = {
	pcvr: {
		emoji: "<:PCVRC:1437583595383296010>",
		label: "PCVR",
	},
	android: {
		emoji: "<:AndroidVRC:1437583606632550410>",
		label: "Android",
	},
};

// Map for event type emojis
export const emojiMapTypes: Record<string, { emoji: string; label: string }> = {
	discord: {
		emoji: "<:DiscordLogo:1437580033312034846>",
		label: "Discord",
	},
	vrchat: {
		emoji: "<:VRCLogo:1437580004090445924>",
		label: "VRChat",
	},
};