import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits, 
} from "discord.js";
import { publishEvent } from "../helpers/publishEvent";

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

    publishEvent(interaction.client, id);
  }, 
}; 




