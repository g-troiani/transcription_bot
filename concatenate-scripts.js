/**
 * combine-scripts.js
 *
 * Usage:
 *   node combine-scripts.js
 *
 * Description:
 *   Reads multiple JS files, concatenates them (omitting environment vars,
 *   node_modules, logs, etc.), and writes the combined code to combined_code.txt
 *   in the current directory.
 *
 * Modify the "filesToConcat" array to include any other JS files you want to combine.
 */

const fs = require('fs');
const path = require('path');

// List the files you want to concatenate:
const filesToConcat = [
  {
    name: 'deploy-commands.js',
    relativePath: './commands/deploy-commands.js'
  },
  {
    name: 'app.js',
    relativePath: './app.js'
  }
];

// The output file in the same directory:
const outputFile = 'concatenated_scripts.txt';

// Build the result string by reading and appending each file's contents
let combinedResult = '';

for (const file of filesToConcat) {
  // Prepare a header comment for each file
  combinedResult += `/*\nFile: ${file.name}\nPath: ${file.relativePath}\n*/\n\n`;

  // Read the file contents
  const filePath = path.join(__dirname, file.relativePath);
  const fileContents = fs.readFileSync(filePath, 'utf-8');

  // Append to the result
  combinedResult += fileContents + '\n\n';
}

// Write the concatenated code to cconcatenated_scripts.txt
const outputPath = path.join(__dirname, outputFile);
fs.writeFileSync(outputPath, combinedResult, 'utf-8');

console.log(`Combined code written to ${outputFile}`);
