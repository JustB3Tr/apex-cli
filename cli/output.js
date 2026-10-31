import {stripVTControlCharacters} from 'node:util';

// Model, peer, filename and tool text is data, never a terminal command channel.
export function terminalText(value='') {
 const text=String(value).replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c|$)|(?:\x1b[P_^X]|[\x90\x98\x9e\x9f])[\s\S]*?(?:\x1b\\|\x9c|$)/g,'');
 return stripVTControlCharacters(text).replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
}
