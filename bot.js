/************************************************************
 * bot.js
 * Main entry point. Sets up the Discord client, slash commands,
 * voiceStateUpdate handling, and logs in to Discord.
 *
 * Usage:
 *   node bot.js
 ************************************************************/

const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType
  } = require('discord.js');
  
  const {
    createOrGetSession,
    joinVoiceChannelAndPrepare,
    startRecording,
    stopRecordingAndTranscribe,
    summarizeText,
    leaveVoiceChannel
  } = require('./recordingLogic');
  
  const { sessions } = require('./config');
  
  // Create the Discord client
  const client = new Client({
    intents: [
      // NOTE: Added GuildMembers so the bot can see actual members in voice channels
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
  });
  
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;
    const guildId = interaction.guildId;
  
    // Old Example: join-transcription
    if (commandName === 'join-transcription') {
      const voiceChannel = interaction.options.getChannel('channel');
      if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
        return interaction.reply({ content: 'Please specify a valid voice channel.', ephemeral: true });
      }
      try {
        joinVoiceChannelAndPrepare(guildId, voiceChannel);
        await interaction.reply(`Joined ${voiceChannel.name}. (Old join-transcription)`);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: `Failed to join: ${error.message}`, ephemeral: true });
      }
      return;
    }
  
    if (commandName === 'stop-transcription') {
      // Old "stop-transcription" command
      const session = sessions[guildId];
      if (!session || !session.connection) {
        return interaction.reply({ content: 'Not currently in a voice channel.', ephemeral: true });
      }
      if (!session.isRecording) {
        leaveVoiceChannel(guildId);
        return interaction.reply('Stopped (old command) and left the channel.');
      }
      try {
        await interaction.deferReply();
        const text = await stopRecordingAndTranscribe(guildId);
        const summary = await summarizeText(guildId, text);
        const sid = session.currentSessionId;
        session.transcripts[sid] = { text, summary };
  
        await interaction.editReply({
          content: `**[Old stop-transcription]**\nTranscript #${sid}:\n\`\`\`${text.slice(0,1500)}\`\`\`\nSummary:\n${summary}`
        });
        leaveVoiceChannel(guildId);
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: `Error stopping: ${error.message}` });
      }
      return;
    }
  
    // --------------------------
    // New Commands
    // --------------------------
  
    if (commandName === 'record') {
      const voiceChannel = interaction.options.getChannel('channel');
      if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
        return interaction.reply({ content: 'Please select a valid voice channel.', ephemeral: true });
      }
      const session = createOrGetSession(guildId);
      if (session.connection) {
        return interaction.reply({ content: 'Bot is already connected in this guild.', ephemeral: true });
      }
      try {
        joinVoiceChannelAndPrepare(guildId, voiceChannel);
        startRecording(guildId);
        await interaction.reply(`Recording started in ${voiceChannel.name}.`);
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: `Failed to record: ${err.message}`, ephemeral: true });
      }
      return;
    }
  
    else if (commandName === 'start-transcription') {
      const session = sessions[guildId];
      if (!session.connection) {
        return interaction.reply({ content: 'Bot is not in a voice channel.', ephemeral: true });
      }
      if (session.isRecording) {
        return interaction.reply({ content: 'Already recording.', ephemeral: true });
      }
      try {
        startRecording(guildId);
        await interaction.reply('Started transcription manually.');
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
      }
      return;
    }
  
    else if (commandName === 'stop-transcription') {
      // New "stop-transcription" command
      const session = sessions[guildId];
      if (!session || !session.connection) {
        return interaction.reply({ content: 'Not in a voice channel.', ephemeral: true });
      }
      if (!session.isRecording) {
        leaveVoiceChannel(guildId);
        return interaction.reply('No active recording. Bot left the channel.');
      }
      try {
        await interaction.deferReply();
        const text = await stopRecordingAndTranscribe(guildId);
        const summary = await summarizeText(guildId, text);
        const sid = session.currentSessionId;
        session.transcripts[sid] = { text, summary };
  
        await interaction.editReply({
          content: `**[Stop-Transcription]**\nTranscript (#${sid}):\n\`\`\`${text.slice(0,1500)}\`\`\`\n\nSummary:\n${summary}`
        });
        leaveVoiceChannel(guildId);
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: `Error stopping: ${error.message}` });
      }
      return;
    }
  
    else if (commandName === 'transcript') {
      const requestedId = interaction.options.getString('id');
      const session = sessions[guildId];
      if (!session) {
        return interaction.reply({ content: 'No transcripts found here.', ephemeral: true });
      }
      let sid;
      if (!requestedId) {
        sid = session.currentSessionId;
      } else if (requestedId.toLowerCase() === 'recent') {
        sid = session.currentSessionId;
      } else {
        sid = parseInt(requestedId, 10);
        if (isNaN(sid)) {
          return interaction.reply({ content: 'Invalid session ID.', ephemeral: true });
        }
      }
      const data = session.transcripts[sid];
      if (!data) {
        return interaction.reply({ content: `No transcript for session #${sid}`, ephemeral: true });
      }
      return interaction.reply({
        content: `**Transcript (#${sid}):**\n\`\`\`${data.text.slice(0,1500)}\`\`\``
      });
    }
  
    else if (commandName === 'summary') {
      const requestedId = interaction.options.getString('id');
      const session = sessions[guildId];
      if (!session) {
        return interaction.reply({ content: 'No transcripts found in this guild.', ephemeral: true });
      }
      let sid;
      if (!requestedId) {
        sid = session.currentSessionId;
      } else if (requestedId.toLowerCase() === 'recent') {
        sid = session.currentSessionId;
      } else {
        sid = parseInt(requestedId, 10);
        if (isNaN(sid)) {
          return interaction.reply({ content: 'Invalid session ID.', ephemeral: true });
        }
      }
      const data = session.transcripts[sid];
      if (!data) {
        return interaction.reply({ content: `No transcript for #${sid}`, ephemeral: true });
      }
      await interaction.reply({ content: `**Summary (#${sid}):**\n${data.summary}` });
      return;
    }
  
    else if (commandName === 'leave-voice') {
      try {
        leaveVoiceChannel(guildId);
        await interaction.reply('Left the voice channel and discarded unfinalized data.');
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: `Error leaving: ${err.message}`, ephemeral: true });
      }
      return;
    }
  });
  
  // VoiceStateUpdate for Channel-Empty Auto-Stop
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = oldState.guild.id;
    const session = sessions[guildId];
    if (!session || !session.connection) return;
  
    const botChannelId = session.connection.joinConfig.channelId;
    if (!botChannelId) return;
    const voiceChannel = oldState.guild.channels.cache.get(botChannelId);
    if (!voiceChannel) return;
  
    // If no non-bot members remain
    const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
    if (nonBotMembers.size === 0) {
      console.log(`Auto-stop: Channel empty in guild ${guildId}`);
      try {
        if (session.isRecording) {
          const text = await stopRecordingAndTranscribe(guildId);
          const summary = await summarizeText(guildId, text);
          session.transcripts[session.currentSessionId] = { text, summary };
        }
      } catch (err) {
        console.error('Error auto-stopping:', err);
      } finally {
        leaveVoiceChannel(guildId);
      }
    }
  });
  
  // Bot login
  client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Bot is online.`);
  });
  
  client.login(process.env.DISCORD_TOKEN);
  
  // Optional: catch unhandled rejections
  process.on('unhandledRejection', (reason) => {
    console.error('[DEBUG] Unhandled Rejection:', reason);
  });
  