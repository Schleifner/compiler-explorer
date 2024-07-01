import { bool } from 'aws-sdk/clients/signer';
import {ElfParser} from './readers/elf-parser';
import * as path from 'path';

export class ElfParserTool {
    public declare _elf_examplepathc: string;
    public declare _elf_examplepathcpp: string;
    protected declare elfParser: ElfParser;
    protected declare libraryCode: boolean;

    constructor(filepath: string, libraryCode: boolean) {
        this.elfParser = new ElfParser();
        if (!path.isAbsolute(filepath)) {
            filepath = __dirname + '\\' + filepath;
        }
        this.elfParser.bindFile(filepath);
        const basename = filepath.substring(0, filepath.lastIndexOf('.'));
        this._elf_examplepathc = basename + '.c';
        this._elf_examplepathcpp = basename + '.cpp';
        this.libraryCode = libraryCode;
    }

    start() {
        return {
            lineMap: this.elfParser.getLineMap(this.libraryCode),
            lineSet: this.elfParser.getLineSet(this.libraryCode),
            relaMap: this.elfParser.getRelaMap(this.libraryCode),
            srcPath: this._elf_examplepathcpp,
        };
    }
}
