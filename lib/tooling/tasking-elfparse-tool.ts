import fs from 'fs';
import path from 'path';

import {ElfParser, LineInfoItem} from './readers/elf-parser';

export class ElfParserTool {
    public declare _elf_examplepathc: string;
    public declare _elf_examplepathcpp: string;
    protected declare elfParser: ElfParser;
    protected declare libraryCode: boolean;
    protected declare srcPath: string;
    protected declare srcname: string;

    constructor(filepath: string, libraryCode: boolean) {
        this.elfParser = new ElfParser();
        if (!path.isAbsolute(filepath)) {
            filepath = path.resolve(filepath);
        }
        this.elfParser.bindFile(filepath);
        const basename = filepath.substring(0, filepath.search(/((\.c|\.cpp|\.cxx|)\.o)$/g));
        this.srcname = path.basename(basename);
        this._elf_examplepathc = basename + '.c';
        this._elf_examplepathcpp = basename + '.cpp';
        if(fs.existsSync(this._elf_examplepathc)) {
            this.srcPath = this._elf_examplepathc;
        } else {
            this.srcPath = this._elf_examplepathcpp;
        }
        this.libraryCode = libraryCode;
    }

    setSrcPath(path: string) {
        this.srcPath = path;
    }

    start() {
        const srcPath = this.srcPath;
        const lineMap = this.elfParser.getLineMap((item: LineInfoItem) => {
            return item.filepath === srcPath;
        });
        const relaMap = this.elfParser.getRelaMap();
        if (!this.libraryCode) {
            for (const text of lineMap.keys()) {
                if (!text.startsWith('.text.' + this.srcname) && text !== srcPath) {
                    lineMap.delete(text);
                }
            }
        }
        return {
            lineMap: lineMap,
            lineSet: new Set<string>(lineMap.keys()),
            relaMap: relaMap,
            srcPath: this._elf_examplepathcpp,
        };
    }
}
