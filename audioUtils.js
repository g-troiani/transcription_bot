/************************************************************
 * audioUtils.js
 *
 * Contains FFmpeg-based helper functions for converting PCM
 * to WAV and compressing WAV for Whisper uploads.
 ************************************************************/

const { spawn } = require('child_process'); // For ffmpeg
const fs = require('fs');

/**
 * Helper function to convert PCM -> WAV using ffmpeg
 */
function convertPcmToWav(pcmFile, wavFile) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',            // Overwrite
      '-f', 's16le',   // PCM 16-bit little-endian
      '-ar', '48000',  // sample rate
      '-ac', '2',      // stereo
      '-i', pcmFile,
      wavFile
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Helper function to compress a WAV file to 16 kHz, mono.
 * Now with '-f wav' to ensure a valid WAV container
 */
function compressWav(inputWav, outputWav) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', inputWav,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-f', 'wav',               // <-- FIX: ensure output is a WAV container
      outputWav
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  convertPcmToWav,
  compressWav
};
