'use strict';
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

const inputPngPath = path.resolve(__dirname, '../icon.png');
const outputIcoPath = path.resolve(__dirname, '../icon.ico');

if (!fs.existsSync(inputPngPath)) {
  console.error('Source icon.png not found at:', inputPngPath);
  process.exit(1);
}

const baseImg = nativeImage.createFromPath(inputPngPath);
const sizes = [256, 128, 64, 48, 32, 16];

const pngBuffers = sizes.map(size => {
  const resized = baseImg.resize({ width: size, height: size, quality: 'best' });
  return {
    size,
    buffer: resized.toPNG()
  };
});

// Build ICO file format containing multiple PNG frames
const numImages = pngBuffers.length;
const headerSize = 6;
const dirEntrySize = 16;
const dataOffsetStart = headerSize + (numImages * dirEntrySize);

let currentOffset = dataOffsetStart;
const dirEntries = [];

for (const item of pngBuffers) {
  const widthByte = item.size === 256 ? 0 : item.size;
  const heightByte = item.size === 256 ? 0 : item.size;
  const entryBuf = Buffer.alloc(16);
  entryBuf.writeUInt8(widthByte, 0); // width
  entryBuf.writeUInt8(heightByte, 1); // height
  entryBuf.writeUInt8(0, 2); // color palette count
  entryBuf.writeUInt8(0, 3); // reserved
  entryBuf.writeUInt16LE(1, 4); // color planes
  entryBuf.writeUInt16LE(32, 6); // bits per pixel
  entryBuf.writeUInt32LE(item.buffer.length, 8); // size of image data
  entryBuf.writeUInt32LE(currentOffset, 12); // offset of image data

  dirEntries.push(entryBuf);
  currentOffset += item.buffer.length;
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon type = 1
header.writeUInt16LE(numImages, 4); // image count

const icoBuffer = Buffer.concat([
  header,
  ...dirEntries,
  ...pngBuffers.map(item => item.buffer)
]);

fs.writeFileSync(outputIcoPath, icoBuffer);
console.log(`Generated multi-resolution Windows icon at: ${outputIcoPath} (${icoBuffer.length} bytes)`);
process.exit(0);
