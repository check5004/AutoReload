import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32,zip,png} from '../scripts/binary.mjs';
test('release archive has deterministic ZIP central directory and CRCs',()=>{assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);const entries=[['AutoReload/manifest.json','{"manifest_version":3}'],['INSTALL.md','導入手順']];const a=zip(entries);assert.deepEqual(a,zip(entries));assert.equal(a.readUInt32LE(0),0x04034b50);const end=a.length-22;assert.equal(a.readUInt32LE(end),0x06054b50);assert.equal(a.readUInt16LE(end+10),2);const central=a.readUInt32LE(end+16);assert.equal(a.readUInt32LE(central),0x02014b50);assert.equal(a.readUInt32LE(central+16),crc32(Buffer.from(entries[0][1])));});
test('icons are valid PNG containers',()=>{const image=png(16,16,()=>[34,88,232,255]);assert.equal(image.subarray(1,4).toString(),'PNG');assert.equal(image.readUInt32BE(16),16);assert.equal(image.readUInt32BE(20),16);assert(image.includes(Buffer.from('IEND')));});
