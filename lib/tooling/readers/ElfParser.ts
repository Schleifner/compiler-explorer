import * as fs from "fs"
import { ElfReader } from "./ElfReader";
import { DwarfLineReader } from "./DwarfReader";
import { add } from "cypress/types/lodash";


function pad(num_str: string) {
    const s = "00000000" + num_str;
    return s.substring(num_str.length);
}

export class ElfParser {
    declare protected elfPath:string;
    declare protected elfContent: Uint8Array;
    declare protected elfReader: ElfReader;
    declare protected lineReader: DwarfLineReader;

    bindFile(filepath: string) {
        this.elfPath = filepath;
        this.elfReader = new ElfReader();
        this.lineReader = new DwarfLineReader();
        const file_content = fs.readFileSync(filepath);
        this.elfReader.readElf(file_content);
        this.elfContent = file_content;
    }

    getLineSet() {
        const lineMap = this.getLineMap();
        return new Set<string>(lineMap.keys());
    }
    getSrcPaths() {
        const paths: string[] = [];
        for(const file_info of this.lineReader.fileInfo()) {
            paths.push(file_info.filename);
        }
        return paths;
    }

    getRelaMap() {
        const relaMap = new Map<string, Map<number, string>>();
        const rels = this.elfReader.getRelaocations();
        Object.entries(rels).forEach(([key, array]) => {
            const record: Record<number, string> = {};
            for (const rela of array) {
                record[Number(rela.r_offset)] = this.elfReader.readRelTargetName(rela);
            }
            relaMap[key] = record;
        });
        return relaMap;
    }

    getLineMap() {
        const lineMap = new Map<string, Map<string, number>>();
        const groups = this.elfReader.getGroups();
        for (const group of groups) {
            const debug_lines = this.elfReader.getDbgLineSecsOf(group);
            const text = this.elfReader.readSecName(this.elfReader.getTextSecsOf(group)[0]);
            const record = new Map<string, number>();
            const contents = this.elfReader.getContentsOf(debug_lines);
            for (const content of contents) {
                this.lineReader.readEntries(content);
                for (const item of this.lineReader.lineInfo()) {
                    const addr_start = BigInt.asUintN(32, item.address_start).toString(16);
                    const addr_end = BigInt.asUintN(32, item.address_start).toString(16);
                    record.set(pad(addr_start), item.line);
                    record.set(pad(addr_end), item.line);
                    
                    if (!lineMap.has(item.filepath)) {
                        lineMap.set(item.filepath, new Map<string, number>());
                    }
                    const map = lineMap.get(item.filepath);
                    map!.set(pad(addr_start), item.line);
                    map!.set(pad(addr_end), item.line);
                }
                this.lineReader.clearItems();
            }
            lineMap.set(text, record);
        }
        return lineMap
    }
}