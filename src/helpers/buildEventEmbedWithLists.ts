import { EmbedBuilder } from "discord.js";

/** Safely join mentions into a field (<=1024 chars) and show a +N overflow if needed. */
function buildMentionField(mentions: string[], maxLen = 1024) {
  if (mentions.length === 0) return "—";
  let out = "";
  let used = 0;
  let i = 0;
  for (; i < mentions.length; i++) {
    const piece = (out ? ", " : "") + mentions[i];
    if ((out + piece).length > maxLen) break;
    out += piece;
    used++;
  }
  if (used < mentions.length) {
    const remaining = mentions.length - used;
    const suffix = `, +${remaining}`;
    if (out.length + suffix.length <= maxLen) out += suffix;
  }
  return out || "—";
}

/** Build the event embed including attendees & cohosts lists. */
export function buildEventEmbedWithLists(publishingEvent: any, attendees: string[], cohosts: string[]) {
  const dt = new Date(publishingEvent.startTime);
  const unix = Math.floor(dt.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(publishingEvent.title)
    .setColor(0x5865f2)
    .setDescription(publishingEvent.description ?? "No description provided.")
    .addFields(
      { name: "Host", value: `<@${publishingEvent.hostId}>`, inline: true },
      { name: "Start Time", value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: true },
      { name: "Type", value: publishingEvent.type, inline: true },
      { name: "Subtype", value: publishingEvent.subtype, inline: true },
      { name: "Scope", value: publishingEvent.scope ?? "—", inline: true },
      {
        name: "Capacity",
        value: `${publishingEvent.capacityBase}/${publishingEvent.capacityCap}`,
        inline: true,
      },
      {
        name: `Attendees (${attendees.length}/${publishingEvent.capacityCap})`,
        value: buildMentionField(attendees),
        inline: false,
      },
      {
        name: `Cohosts (${cohosts.length})`,
        value: buildMentionField(cohosts),
        inline: false,
      }
    );

  if (publishingEvent.imageUrl) {
    embed.setImage(publishingEvent.imageUrl);
  }

  return embed;
}
