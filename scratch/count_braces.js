
import fs from 'fs';
const content = fs.readFileSync('g:/adia project/src/engine/xbridges/BlockDefinitions.ts', 'utf8');

let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;

for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (content[i] === '(') parenCount++;
    if (content[i] === ')') parenCount--;
    if (content[i] === '[') bracketCount++;
    if (content[i] === ']') bracketCount--;
}

console.log('Brace count:', braceCount);
console.log('Paren count:', parenCount);
console.log('Bracket count:', bracketCount);
