import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits, 
} from "discord.js";
import { publishEvent } from "../helpers/publishEvent";
import { refreshPublishedCalender } from "../helpers/refreshPublishedCalender";

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

    await publishEvent(interaction.client, id);
    await refreshPublishedCalender(interaction.client, interaction.guildId as string, true);
    interaction.reply({ content: `Successfully published event: ${id}.`, flags: MessageFlags.Ephemeral })
  }, 
}; 