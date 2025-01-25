/************************************************************
 * recordingLogic.js
 *
 * Exports functions for:
 *  - Creating/managing sessions
 *  - Joining channels
 *  - Starting/stopping recordings
 *  - Converting and compressing audio
 *  - Calling Whisper & GPT
 *
 * NOTE: We still call OpenAI Whisper for transcription.
 *       We now call DeepSeek for summarization instead
 *       of the GPT-4o-mini model. We read the key from
 *       process.env.DEEPSEEK_API_KEY.
 *
 * Updated to fix the "ERR_REQUIRE_ESM" issue with node-fetch
 * by using dynamic import inside summarizeText().
 ************************************************************/

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const prism = require('prism-media');
const { spawn } = require('child_process');
// Removed the direct "require('node-fetch')" to avoid ESM error.
// We'll dynamically import node-fetch inside the summarizeText() function.

const { openai, sessions, INACTIVITY_LIMIT_MS } = require('./config');
const { convertPcmToWav, compressWav } = require('./audioUtils');
const { joinVoiceChannel, createAudioPlayer } = require('@discordjs/voice');

/**
 * createOrGetSession(guildId):
 * If no session object exists for the guild, create one.
 */
function createOrGetSession(guildId) {
  if (!sessions[guildId]) {
    sessions[guildId] = {
      connection: null,
      isRecording: false,
      audioFilePath: null,
      fileStreams: new Map(),
      transcripts: {},
      currentSessionId: 0,
      activeSessionStart: null,
      lastSpokeTimestamp: null,
      inactivityInterval: null,
      listenersAttached: false
    };
  }
  return sessions[guildId];
}

/**
 * joinVoiceChannelAndPrepare(guildId, voiceChannel):
 * Creates a VoiceConnection, sets up event listeners, etc.
 */
function joinVoiceChannelAndPrepare(guildId, voiceChannel) {
  const session = createOrGetSession(guildId);
  if (session.connection) {
    throw new Error('Already connected or session in progress.');
  }

  // Ensure the bot can hear and record
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  session.connection = connection;
  session.isRecording = false;
  session.activeSessionStart = null;
  session.lastSpokeTimestamp = null;

  // Attach speaking listeners ONCE if not already
  if (!session.listenersAttached) {
    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId) => {
      if (!session.isRecording) return;
      if (session.fileStreams.has(userId)) return;

      session.lastSpokeTimestamp = Date.now();
      console.log(`[DEBUG][${guildId}] speaking.on('start') => user ${userId}`);

      const opusStream = receiver.subscribe(userId, { end: 'manual' });
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960
      });

      if (!session.audioFilePath) {
        console.warn(`[DEBUG][${guildId}] No session.audioFilePath set!`);
        return;
      }

      console.log(`[DEBUG][${guildId}] Creating pipeline to file: ${session.audioFilePath}`);
      const outStream = fs.createWriteStream(session.audioFilePath, { flags: 'a' });

      const p = pipeline(opusStream, decoder, outStream, (err) => {
        if (err) {
          console.error(`[DEBUG][${guildId}] Pipeline error for user ${userId}:`, err);
        } else {
          console.log(`[DEBUG][${guildId}] Pipeline closed normally for user ${userId}.`);
        }
      });
      session.fileStreams.set(userId, p);
    });

    receiver.speaking.on('end', (userId) => {
      if (!session.isRecording) return;
      console.log(`[DEBUG][${guildId}] speaking.on('end') => user ${userId}`);
      const p = session.fileStreams.get(userId);
      if (p) {
        session.fileStreams.delete(userId);
        console.log(`[DEBUG][${guildId}] Pipeline removed for user ${userId}`);
      }
    });

    session.listenersAttached = true;
  }

  // Optionally create an audio player
  const player = createAudioPlayer();
  connection.subscribe(player);
}

/**
 * startRecording(guildId):
 * Begin the transcription recording (sets up inactivity auto-stop).
 */
function startRecording(guildId) {
  const session = createOrGetSession(guildId);

  console.log(`[DEBUG][${guildId}] startRecording called. __dirname=${__dirname}`);

  if (!session.connection) {
    throw new Error('No voice connection to record from.');
  }
  if (session.isRecording) {
    throw new Error('Already recording.');
  }

  session.currentSessionId += 1;
  const sid = session.currentSessionId;
  const fileName = `session_${guildId}_${sid}.pcm`;

  // Store in the same folder as this file
  const fullPath = path.join(__dirname, fileName);
  console.log(`[DEBUG][${guildId}] Will store PCM at: ${fullPath}`);

  // Create an empty file to ensure it exists
  fs.writeFileSync(fullPath, '');
  console.log(`[DEBUG][${guildId}] Created empty PCM file at: ${fullPath}`);

  session.audioFilePath = fullPath;
  session.isRecording = true;
  session.activeSessionStart = Date.now();
  session.lastSpokeTimestamp = Date.now();
  console.log(`[${guildId}] Starting recording -> ${fileName}`);

  // Inactivity auto-stop
  if (session.inactivityInterval) {
    clearInterval(session.inactivityInterval);
  }
  session.inactivityInterval = setInterval(async () => {
    if (!session.isRecording) return;
    if (Date.now() - session.lastSpokeTimestamp > INACTIVITY_LIMIT_MS) {
      console.log(`[${guildId}] Inactivity reached, stopping transcription...`);
      clearInterval(session.inactivityInterval);
      session.inactivityInterval = null;
      try {
        const text = await stopRecordingAndTranscribe(guildId);
        const summary = await summarizeText(guildId, text);
        session.transcripts[session.currentSessionId] = { text, summary };
        leaveVoiceChannel(guildId);
      } catch (err) {
        console.error('Error stopping due to inactivity:', err);
      }
    }
  }, 20000);
}

/**
 * stopRecordingAndTranscribe(guildId) -> final transcript text
 */
async function stopRecordingAndTranscribe(guildId) {
  const session = createOrGetSession(guildId);
  if (!session.isRecording) {
    throw new Error('Not currently recording.');
  }

  session.isRecording = false;
  for (const [userId] of session.fileStreams.entries()) {
    session.fileStreams.delete(userId);
  }

  if (session.inactivityInterval) {
    clearInterval(session.inactivityInterval);
    session.inactivityInterval = null;
  }

  console.log(`[${guildId}] Recording ended. Now calling OpenAI Whisper API...`);

  const pcmPath = session.audioFilePath;
  if (!pcmPath || !fs.existsSync(pcmPath)) {
    throw new Error(`Audio file not found at ${pcmPath}`);
  }

  // Convert PCM -> WAV
  const wavPath = pcmPath.replace('.pcm', '.wav');
  try {
    await convertPcmToWav(pcmPath, wavPath);
  } catch (err) {
    console.error(`[DEBUG][${guildId}] Error converting PCM to WAV: ${err}`);
    return '[Conversion to WAV failed]';
  }

  // Compress to 16 kHz mono
  const compressedWavPath = wavPath.replace('.wav', '.compressed.wav');
  try {
    await compressWav(wavPath, compressedWavPath);
    console.log(`[DEBUG][${guildId}] Compressed ${wavPath} to ${compressedWavPath}`);
  } catch (err) {
    console.error('[DEBUG] Compression failed:', err);
    return '[Compression failed]';
  }

  // ---- Check final duration before calling Whisper ----
  const duration = await getAudioDuration(compressedWavPath);
  console.log(`[DEBUG][${guildId}] Duration of compressed file: ${duration.toFixed(2)}s`);
  if (duration < 0.1) {
    console.log(`[DEBUG][${guildId}] Audio too short or ffprobe output invalid. Skipping Whisper.`);
    return '[No usable audio recorded or too short]';
  }

  // Call Whisper
  let transcriptionText = '';
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(compressedWavPath),
      model: 'whisper-1'
    });
    transcriptionText = (transcription.text || '').trim();
    console.log(`[DEBUG][${guildId}] Whisper success. Transcript:\n${transcriptionText}`);
  } catch (err) {
    console.error(`[DEBUG][${guildId}] Error calling Whisper API:`, err);
    transcriptionText = '[Transcription failed or returned empty]';
  }

  return transcriptionText;
}

/**
 * summarizeText(guildId, text):
 * Replaces old "gpt-4o-mini" summarization with a DeepSeek call.
 * Use dynamic import for node-fetch to avoid ESM error.
 */
async function summarizeText(guildId, text) {
  if (!text || !text.trim()) {
    return '[No text to summarize]';
  }

  console.log(`[${guildId}] Summarizing transcript with DeepSeek...`);
  try {
    // Dynamically import node-fetch (ESM) in a CommonJS file
    const { default: fetch } = await import('node-fetch');

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-reasoner",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that summarizes conversation transcripts."
          },
          {
            role: "user",
            content: `Please summarize this conversation:\n\n${text}`
          }
        ],
        stream: false
      })
    });

    const result = await response.json();
    let deepSeekSummary = '[Summary failed]';
    if (result.choices && result.choices.length > 0 && result.choices[0].message) {
      deepSeekSummary = result.choices[0].message.content.trim();
    }
    return deepSeekSummary;
  } catch (err) {
    console.error(`[DEBUG][${guildId}] Error calling DeepSeek for summary:`, err);
    return '[Summary failed]';
  }
}

/**
 * leaveVoiceChannel(guildId):
 * Leaves the channel, discarding unfinalized data if still recording.
 */
function leaveVoiceChannel(guildId) {
  const session = sessions[guildId];
  if (!session || !session.connection) {
    throw new Error('Not connected to a channel in this guild.');
  }
  if (session.isRecording) {
    console.warn(`Guild ${guildId} forcibly leaving while still recording.`);
    session.isRecording = false;
    session.fileStreams.clear();
  }
  if (session.inactivityInterval) {
    clearInterval(session.inactivityInterval);
    session.inactivityInterval = null;
  }
  session.connection.destroy();
  session.connection = null;
  console.log(`[${guildId}] Left the voice channel.`);
}

// ---- Modified getAudioDuration: Return 0 if we can't parse ----
async function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-i', filePath,
      '-show_entries', 'format=duration',
      '-v', 'quiet',
      '-of', 'csv=p=0'
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (errData) => {
      console.error('[DEBUG] ffprobe stderr:', errData.toString());
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const val = parseFloat(output.trim());
        if (isNaN(val)) {
          console.log(`[DEBUG] Could not parse duration from ffprobe output: "${output.trim()}"`);
          // Return 0 if parsing fails
          resolve(0);
        } else {
          resolve(val);
        }
      } else {
        console.log(`[DEBUG] ffprobe exited with code ${code}. Treating as 0 duration.`);
        resolve(0);
      }
    });
  });
}

module.exports = {
  createOrGetSession,
  joinVoiceChannelAndPrepare,
  startRecording,
  stopRecordingAndTranscribe,
  summarizeText,
  leaveVoiceChannel
};
