import * as fs from 'fs';

import {DwarfLineReader, LineInfoItem} from './dwarf-line-reader';
import {ElfReader} from './elf-reader';
import { readFileAsync } from '@sentry/node/types/integrations/context';

export {LineInfoItem} from './dwarf-line-reader';

function pad(num_str: string) {
    const s = '00000000' + num_str;
    return s.substring(num_str.length);
}

export class ElfParser {
    protected declare elfPath: string;
    protected declare elfContent: Uint8Array;
    protected declare elfReader: ElfReader;
    protected declare lineReader: DwarfLineReader;

    bindFile(filepath: string) {
        this.elfPath = filepath;
        this.elfReader = new ElfReader();
        this.lineReader = new DwarfLineReader();
        const file_content = fs.readFileSync(filepath);
        this.elfReader.readElf(file_content);
        this.elfContent = file_content;
    }

    getSrcPaths() {
        const paths: string[] = [];
        for (const file_info of this.lineReader.fileInfo()) {
            paths.push(file_info.filename);
        }
        return paths;
    }

    getRelaMap() {
        const relaMap = new Map<string, Map<number, string>>();
        const rels = this.elfReader.getRelaocations();
        for (const [key, array] of Object.entries(rels)) {
            const record = new Map<number, string>();
            for (const rela of array) {
                record.set(Number(rela.r_offset), this.elfReader.readRelTargetName(rela));
            }
            relaMap.set(key, record);
        }
        return relaMap;
    }

    getLineMap(filter: (item: LineInfoItem) => boolean) {
        const lineMap = new Map<string, Map<string, number>>();
        const groups = this.elfReader.getGroups();
        for (const group of groups) {
            const debug_lines = this.elfReader.getDbgLineSecsOf(group);
            const texts = this.elfReader.getTextSecsOf(group);
            if (texts.length === 0 || debug_lines.length === 0) {
                continue ;
            }
            for (const sec of texts) {
                const text = this.elfReader.readSecName(sec);
                const record = new Map<string, number>();
                const contents = this.elfReader.getContentsOf(debug_lines);
                for (const content of contents) {
                    this.lineReader.readEntries(content);
                    for (const item of this.lineReader.lineInfo()) {
                        if (!filter(item)) { continue ; }
                        const addr_start = BigInt.asUintN(32, item.address_start).toString(16);
                        const addr_end = BigInt.asUintN(32, item.address_start).toString(16);
                        record.set(pad(addr_start), item.line);
                        record.set(pad(addr_end), item.line);
                        if (!lineMap.has(item.filepath)) {
                            lineMap.set(item.filepath, new Map<string, number>());
                        }
                        const map = lineMap.get(item.filepath)!;
                        map.set(pad(addr_start), item.line);
                        map.set(pad(addr_end), item.line);
                    }
                    this.lineReader.clearItems();
                }
                lineMap.set(text, record);
            }
        }
        return lineMap;
    }
}
