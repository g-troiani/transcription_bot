/************************************************************
 * config.js
 *
 * Loads environment variables, sets up OpenAI,
 * defines global sessions object, and exports constants.
 ************************************************************/

require('dotenv').config();
const OpenAI = require('openai');

// Create the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Inactivity threshold (3 minutes)
const INACTIVITY_LIMIT_MS = 3 * 60 * 1000;

/*
sessions[guildId] = {
  connection: <VoiceConnection> | null,
  isRecording: boolean,
  audioFilePath: string | null,
  fileStreams: Map<userId, pipeline>,
  transcripts: { [sessionIdNumber]: { text: string, summary: string } },
  currentSessionId: number,
  activeSessionStart: number | null,
  lastSpokeTimestamp: number | null,
  inactivityInterval: NodeJS.Timeout | null,
  listenersAttached: boolean
}
*/
const sessions = {};

// Export them for use in other files
module.exports = {
  openai,
  sessions,
  INACTIVITY_LIMIT_MS
};
