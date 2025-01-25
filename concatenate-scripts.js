/************************************************************
 * concatenate-scripts.js
 *
 * This script concatenates multiple .js files in this folder
 * into a single text file named "concatenate-scripts.txt".
 *
 * Changes:
 * - Removed "app.js" from the files array to prevent ENOENT.
 * - Output is now "concatenate-scripts.txt" instead of "merged.js".
 ************************************************************/

const fs = require('fs');
const path = require('path');

// List of files to concatenate.
// Removed 'app.js' because it doesn't exist in your folder.
const files = [
  'config.js',
  'audioUtils.js',
  'recordingLogic.js',
  'bot.js'
];

// Generate a .txt output with the same base name as this script.
const scriptBaseName = path.basename(__filename, '.js');
const outputFile = `${scriptBaseName}.txt`;

let mergedContent = '';

files.forEach(file => {
  const filePath = path.join(__dirname, file);

  // Optional: Check if file actually exists before reading
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing file: ${file}`);
    return;
  }

  // Read the file content
  const fileData = fs.readFileSync(filePath, 'utf8');

  // Append to mergedContent with a comment header
  mergedContent += `\n/************************************************************\n * ${file}\n ************************************************************/\n\n`;
  mergedContent += fileData + '\n';
});

// Write out the final file as text
fs.writeFileSync(outputFile, mergedContent);
console.log(`Scripts concatenated into "${outputFile}".`);
