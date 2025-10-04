import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  TextChannel,
  PermissionFlagsBits, 
} from "discord.js";
import { prisma } from "../utils/prisma";
import { buildEventEmbedWithLists } from "../helpers/buildEventEmbedWithLists";
import { getEventButtons } from "../helpers/getEventButtons";

const PUBLISHING_CHANNEL_ID = "1424002983515127818";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("publishevent")
    .setDescription("Publish an existing draft event.")
    .addNumberOption(option =>
          option
            .setName('id')
            .setDescription('Id of the event to publish.')
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {

		const id = interaction.options.getNumber('id');
    if (!id) {
      await interaction.reply({
        content: "❌ Please enter a valid Id.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let channel;
    try {
      // Try cache first
      channel = interaction.client.channels.cache.get(PUBLISHING_CHANNEL_ID) as TextChannel;
      if (!channel) {
        // Fetch from API if not in cache
        channel = await interaction.client.channels.fetch(PUBLISHING_CHANNEL_ID) as TextChannel;
      }
    } catch (err) {
      console.error(`Failed to fetch channel ${PUBLISHING_CHANNEL_ID}:`, err);
    }

    const publishingEvent = await getEventById(id as number);
    const channelEmbed = await buildEventEmbedWithLists(interaction.client, publishingEvent, [], []);
    const components = getEventButtons(id as number);

    // Fire messages and create event (order important for desired order of messages in channel)
    const sentChannel = await channel?.send({ embeds: [channelEmbed], components });
    const thread = await channel?.threads.create({
      name: `Event: ${publishingEvent}`,
      autoArchiveDuration: 1440, // 24h
    });
    const sentThread = await thread?.send({ embeds: [channelEmbed], components });

    updatePublishedValues(id, PUBLISHING_CHANNEL_ID, thread?.id as string, sentChannel?.id as string, sentThread?.id as string);
  }, // end execute
}; // end module.exports

export async function getEventById(eventId: number): Promise<(any & { _count: { signups: number; interested: number } }) | null> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: {
          select: { signups: true, interested: true },
        },
        cohosts: true,   // optional: include cohosts relation
        signups: true,   // optional: include full signups list
        interested: true // optional: include interested users list
      },
    });

    return event;
  } catch (error) {
    console.error(`Error fetching event ${eventId}:`, error);
    return null;
  }
}

export async function updatePublishedValues(
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
