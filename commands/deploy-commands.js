require('dotenv').config();
const { REST, Routes } = require('discord.js');

// Existing commands retained, plus new ones added from the plan.
// Now with shortened '/record' description to avoid the 100-char limit error.

const commands = [
  // -------------------------------------------------------------------------
  // Existing Example Commands (Unchanged, to avoid breaking any existing code)
  // -------------------------------------------------------------------------
  {
    name: 'join-transcription',
    description: 'Join a voice channel (old example command).'
    // If this command is used in your code, keep it as is. 
    // Otherwise, you can remove or rename it later if no longer needed.
  },
  {
    name: 'stop-transcription',
    description: 'Stop transcription and leave the channel (old example command).'
    // Retained from existing code, updated description is optional if you desire.
  },

  // --------------------------------------
  // New Commands from Your Detailed Plan
  // --------------------------------------

  // 1) /record <channel>
  {
    name: 'record',
    // Shortened description to be under 100 characters:
    description: 'Join a voice channel, start transcription, and later post the transcript & summary.',
    options: [
      {
        name: 'channel',
        description: 'Voice channel to join and transcribe',
        type: 7,  // CHANNEL type
        required: true
      }
    ]
  },

  // 2) /start-transcription
  {
    name: 'start-transcription',
    description: 'If the bot is in a voice channel, start transcription manually.'
    // No options needed
  },

  // 3) /stop-transcription
  //    (Already exists above. If you want to unify, you can remove the old one 
  //    or update it to match the plan. To avoid breaking anything, we’re keeping 
  //    the existing one above. If you ONLY want one version, remove/merge manually.)

  // 4) /transcript [ID or recent]
  {
    name: 'transcript',
    description: 'Fetch the transcript of the most recent or a specific session.',
    options: [
      {
        name: 'id',
        description: 'Session ID or "recent". If omitted, fetch the latest transcript.',
        type: 3, // STRING
        required: false
      }
    ]
  },

  // 5) /summary [ID or recent]
  {
    name: 'summary',
    description: 'Retrieve the summary for the given or most recent transcript.',
    options: [
      {
        name: 'id',
        description: 'Session ID or "recent". If omitted, fetch the latest summary.',
        type: 3, // STRING
        required: false
      }
    ]
  },

  // 6) /leave-voice
  {
    name: 'leave-voice',
    description: 'Force the bot to exit the voice channel, discarding any unfinalized transcription.'
    // No options needed
  }
];

// Create and configure REST client for slash command registration
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    // Adjust to applicationGuildCommands(...) if you're testing in a single guild
    await rest.put(
      Routes.applicationCommands(process.env.YOUR_CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
})();
