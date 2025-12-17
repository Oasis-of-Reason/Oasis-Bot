import { PrismaClient, Event, eventSubType } from "@prisma/client";

// --- Event subtype metadata
export const EVENT_SUBTYPE_META = {
	GAMING: { label: "Gaming", emoji: "🎮", googleColorId: "2" },
	SOCIAL: { label: "Social", emoji: "🧑‍🤝‍🧑", googleColorId: "11" },
	CINEMA: { label: "Cinema", emoji: "🎬", googleColorId: "1" },
	WELLNESS: { label: "Wellness", emoji: "🧘", googleColorId: "7" },
	ART: { label: "Art", emoji: "🎨", googleColorId: "5" },
} satisfies Record<eventSubType, { label: string; emoji: string; googleColorId: string }>;