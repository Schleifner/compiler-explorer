import { ElfParser } from "./readers/ElfParser";

export class ElfParserTool {
    declare public _elf_examplepathc: string;
    declare public _elf_examplepathcpp: string;
    declare protected elfParser: ElfParser;

    constructor (filepath: string) {
        this.elfParser = new ElfParser();
        this.elfParser.bindFile(filepath);
        const basename = filepath.substring(0, filepath.lastIndexOf('.'));
        this._elf_examplepathc = basename  + '.c';
        this._elf_examplepathcpp = basename  + '.cpp';
    }

    start() {
        return {
            lineSet: this.elfParser.getLineSet(),
            lineMap: this.elfParser.getLineMap(),
            relaMap: this.elfParser.getRelaMap(),
            srcPath: this._elf_examplepathcpp
        }
    }
}
