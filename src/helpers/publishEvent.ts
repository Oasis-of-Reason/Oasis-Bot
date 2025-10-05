import { TextChannel, Client } from "discord.js";
import { prisma } from "../utils/prisma";
import { buildEventEmbedWithLists } from "./buildEventEmbedWithLists";
import { getEventButtons } from "./getEventButtons";
import { getEventById } from "./generalHelpers";

const PUBLISHING_CHANNEL_ID = "1423694714250465331";

export async function publishEvent(client: Client, eventId: number) {
  let channel;
    try {
      // Try cache first
      channel = client.channels.cache.get(PUBLISHING_CHANNEL_ID) as TextChannel;
      if (!channel) {
        // Fetch from API if not in cache
        channel = await client.channels.fetch(PUBLISHING_CHANNEL_ID) as TextChannel;
      }
    } catch (err) {
      console.error(`Failed to fetch channel ${PUBLISHING_CHANNEL_ID}:`, err);
    }
    const publishingEvent = await getEventById(eventId as number);
    const channelEmbed = await buildEventEmbedWithLists(client, publishingEvent, [], []);
    const components = getEventButtons(eventId as number);

    // Fire messages and create event (order important for desired order of messages in channel)
    const sentChannel = await channel?.send({ embeds: [channelEmbed], components });
    const thread = await channel?.threads.create({
      name: `Event: ${publishingEvent}`,
      autoArchiveDuration: 1440, // 24h
    });
    const sentThread = await thread?.send({ embeds: [channelEmbed], components });

    updatePublishedValues(eventId, PUBLISHING_CHANNEL_ID, thread?.id as string, sentChannel?.id as string, sentThread?.id as string);
}

async function updatePublishedValues(
  eventId: number,
  publishedChannelId: string,
  publishedThreadId: string,
  publishedChannelMessageId: string,
  publishedThreadMessageId: string
) {
  try {
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        published: true,
        publishedChannelId,
        publishedThreadId,
        publishedChannelMessageId,
        publishedThreadMessageId,
      },
    });

    console.log(`✅ Updated event #${eventId} as published`);
    return updatedEvent;
  } catch (error) {
    console.error(`❌ Failed to update published values for event #${eventId}:`, error);
    throw error;
  }
}