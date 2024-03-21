enum StandardOpCode {
    DW_LNS_copy = 1,
    DW_LNS_advance_pc = 2,
    DW_LNS_advance_line = 3,
    DW_LNS_set_file = 4,
    DW_LNS_set_column = 5,
    DW_LNS_negate_stmt = 6,
    DW_LNS_set_basic_block = 7,
    DW_LNS_const_add_pc = 8,
    DW_LNS_fixed_advance_pc = 9,
    DW_LNS_set_prologue_end = 10,
    DW_LNS_set_epilogue_begin = 11,
    DW_LNS_set_isa = 12,
}

enum ExtendedOpCode {
    DW_LNE_end_sequence = 1,
    DW_LNE_set_address = 2,
    DW_LNE_define_file = 3,
    DW_LNE_set_discriminator = 4,
}

class DebugLineInfo {
    line: number;
    opaddr: number;
    filename: string;
}

class Elf32Header {
    shoff: number;
    shentsize: number;
    shnum: number;
    shstrndx: number;

    parse(content: Buffer) {
        this.shoff = content.readUInt32LE(32);
        this.shentsize = content.readUInt16LE(46);
        this.shnum = content.readUInt16LE(48);
        this.shstrndx = content.readUInt16LE(50);
    }
}

class Elf32Section {
    name_off: number;
    type: number;
    flags: number;
    addr: number;
    offset: number;
    size: number;
    link: number;
    info: number;
    addralign: number;
    entsize: number;
    name: string;
    content: Buffer;
    ptr: number;

    parseHeader(content: Buffer, elfHeader: Elf32Header, index: number) {
        const offset = elfHeader.shoff + index * elfHeader.shentsize;
        this.name_off = content.readUInt32LE(offset);
        this.type = content.readUInt32LE(offset + 4);
        this.flags = content.readUInt32LE(offset + 8);
        this.addr = content.readUInt32LE(offset + 12);
        this.offset = content.readUInt32LE(offset + 16);
        this.size = content.readUInt32LE(offset + 20);
        this.link = content.readUInt32LE(offset + 24);
        this.info = content.readUInt32LE(offset + 28);
        this.addralign = content.readUInt32LE(offset + 32);
        this.entsize = content.readUInt32LE(offset + 36);
    }

    parseContent(content: Buffer) {
        this.content = content.subarray(this.offset, this.offset + this.size);
        this.ptr = 0;
    }

    parseName(content: Buffer, shstrsec: Elf32Section) {
        shstrsec.seek(this.name_off);
        this.name = shstrsec.readString();
    }

    seek(pos: number) {
        this.ptr = pos;
    }

    where() {
        return this.ptr;
    }

    isEnd() {
        return this.ptr >= this.size;
    }

    readString() {
        let str = '';
        while (this.content[this.ptr] !== 0) {
            str += String.fromCodePoint(this.content[this.ptr]);
            this.ptr++;
        }
        this.ptr++;
        return str;
    }

    readLEB128(signedInt: boolean) {
        let result = 0;
        let bitsWritten = 0;
        let byte = 0xff;
        let byteCount = 0;
        while (byteCount < 6) {
            byte = this.content.readUInt8(this.ptr);
            result += (byte & 0x7f) << bitsWritten;
            bitsWritten += 7;
            byteCount++;
            this.ptr++;
            if ((byte & 0x80) === 0) {
                break;
            }
        }
        const mask = 1 << (bitsWritten - 1);
        if (signedInt && (result & mask)) {
            result = - (result & (mask - 1) ^ (mask - 1)) - 1
        }
        return result;
    }

    readFixed32(littleEndian: boolean, signed: boolean) {
        let ret;
        if (littleEndian) {
            if (signed) {
                ret = this.content.readInt32LE(this.ptr);
            } else {
                ret = this.content.readUInt32LE(this.ptr);
            }
        } else {
            if (signed) {
                ret = this.content.readInt32BE(this.ptr);
            } else {
                ret = this.content.readUInt32BE(this.ptr);
            }
        }
        this.ptr += 4;
        return ret;
    }

    readFixed16(littleEndian: boolean, signed: boolean) {
        let ret;
        if (littleEndian) {
            if (signed) {
                ret = this.content.readInt16LE(this.ptr);
            } else {
                ret = this.content.readUInt16LE(this.ptr);
            }
        } else {
            if (signed) {
                ret = this.content.readInt16BE(this.ptr);
            } else {
                ret = this.content.readUInt16BE(this.ptr);
            }
        }
        this.ptr += 2;
        return ret;
    }

    readByte(signed: boolean) {
        let ret;
        if (signed) {
            ret = this.content.readInt8(this.ptr);
        } else {
            ret = this.content.readUint8(this.ptr);
        }
        this.ptr += 1;
        return ret;
    }
}

export class Elf32DebugLineSection {
    unit_length: number;
    version: number;
    header_length: number;
    minimum_instruction_length: number;
    maximum_operations_per_instruction: number;
    default_is_stmt: number;
    line_base: number;
    line_range: number;
    opcode_base: number;
    standard_opcode_lengths: Array<number>;
    include_libs: Array<string>;
    source_files: Array<any>;
    lines: Array<any>;
    decodedLines: Array<DebugLineInfo>;
    relaSection: string;
    relaOffset: number;

    constructor(section?: Elf32Section) {
        this.source_files = [];
        this.lines = [];
        this.decodedLines = new Array<DebugLineInfo>();
        if (section) {
            this.parse(section);
        }
    }

    parseIncludeLibs(section: Elf32Section) {
        let str = ' ';
        while (str.length > 0) {
            str = section.readString();
            if (str.length > 0) {
                this.include_libs.push(str);
            }
        }
    }

    parseSourceFiles(section: Elf32Section) {
        let foundFile = true;
        while (foundFile) {
            const filename = section.readString();
            if (filename.length > 0) {
                const dir_ind = section.readLEB128(false);
                const mtime = section.readLEB128(false);
                const file_len = section.readLEB128(false);
                this.source_files.push({
                    filename: filename,
                    mtime: mtime,
                    length: file_len,
                });
                foundFile = true;
            } else {
                foundFile = false;
            }
        }
    }

    parseHeader(regs: object, section: Elf32Section) {
        section.seek(0);
        this.unit_length = section.readFixed32(true, false);
        this.version = section.readFixed16(true, false);
        this.header_length = section.readFixed32(true, false);
        this.minimum_instruction_length = section.readByte(true);
        regs['is_stmt'] = section.readByte(true);
        this.line_base = section.readByte(true);
        this.line_range = section.readByte(true);
        this.opcode_base = section.readByte(true);
        this.standard_opcode_lengths = new Array<any>();
        for (let i = 1; i < this.opcode_base; i++) {
            const opCodeArgumentLength = section.readByte(false);
            this.standard_opcode_lengths.push(opCodeArgumentLength);
        }
        this.include_libs = [];
        this.parseIncludeLibs(section);
        this.parseSourceFiles(section);
        return section.ptr;
    }

    parse(section: Elf32Section) {
        const regs = {
            address: 0,
            file: 1,
            line: 1,
            column: 0,
            filename: '',
        };
        const opmachine = [
            (regs, content, offset) => {
                return 0;
            },
            this.execDWLNSCopy.bind(this),
            this.execDWLNSAdvancePc,
            this.execDWLNSAdvanceLine,
            this.execDWLNSSetFile,
            this.execDWLNSSetColumn,
            this.execNOP,
            this.execNOP,
            this.execDWLNSConstAddPc,
            this.execDWLNSFixedAdvancePc,
            this.execNOP,
            this.execNOP,
            this.execNOP,
        ];
        const offset = this.parseHeader(regs, section);
        while (!section.isEnd()) {
            const opcode = section.readByte(false);
            if (opcode >= this.opcode_base) {
                const addr_inc = ((opcode - this.opcode_base) / this.line_range) * this.minimum_instruction_length;
                const line_inc = this.line_base + ((opcode - this.opcode_base) % this.line_range);
                regs['address'] += addr_inc;
                regs['line'] += line_inc;
            } else if (opcode > 0) {
                opmachine[opcode](regs, section, offset);
            } else {
                const cmd_len = section.readLEB128(false);
                const subOpcode = section.readByte(false);
                const extendedOpCode: ExtendedOpCode = subOpcode;
                switch (extendedOpCode) {
                    case ExtendedOpCode.DW_LNE_end_sequence: {
                        regs['address'] = 0;
                        regs['line'] = 1;
                        continue;
                    }
                    case ExtendedOpCode.DW_LNE_set_address: {
                        regs['address'] = section.readFixed32(true, false);
                        break;
                    }
                    case ExtendedOpCode.DW_LNE_set_discriminator: {
                        const discriminator = section.readLEB128(false);
                        break;
                    }
                }
            }
        }
    }

    execNOP(regs: object, section: Elf32Section) {
        return 0;
    }

    execDWLNSCopy(regs: object, content: Buffer) {
        this.decodedLines.push({
            line: regs['line'],
            filename: this.source_files[regs['file'] - 1]['filename'],
            opaddr: regs['address'],
        });
        return 0;
    }

    execDWLNSAdvancePc(regs: object, section: Elf32Section) {
        const operand = section.readLEB128(false);
        const addr_inc = operand * this.minimum_instruction_length;
        regs['address'] += addr_inc;
    }

    execDWLNSAdvanceLine(regs: object, section: Elf32Section) {
        const operand = section.readLEB128(true);
        const line_inc = operand;
        regs['line'] += line_inc;
    }

    execDWLNSSetFile(regs: object, section: Elf32Section) {
        regs['file'] = section.readLEB128(false);
    }

    execDWLNSSetColumn(regs: object, section: Elf32Section) {
        regs['column'] += section.readLEB128(false);
    }

    execDWLNSConstAddPc(regs: object, section: Elf32Section) {
        regs['address'] = ((255 - this.opcode_base) / this.line_range) * this.minimum_instruction_length;
    }

    execDWLNSFixedAdvancePc(regs: object, section: Elf32Section) {
        regs['address'] += section.readFixed16(true, false);
    }

    relocation(sec: Elf32Section, symtab: Elf32SymbolTableSection) {
        const relaSec = new Elf32RelocationSection();
        relaSec.parse(sec, symtab);
        this.relaSection = relaSec.relocation_info[0]['symbol'];
        this.relaOffset = relaSec.relocation_info[0]['addedend'];
    }
}

class Elf32SymbolTableSection {
    symbolTable: Array<string>;
    constructor() {
        this.symbolTable = [];
    }

    loadStringFromStrTab(offset: number, strtab: Elf32Section) {
        let str = '';
        while (strtab.content[offset] !== 0) {
            str += String.fromCodePoint(strtab.content[offset]);
            offset++;
        }
        return str;
    }

    parse(symtabSec: Elf32Section, strtab: Elf32Section) {
        let offset = 0;
        while (offset < symtabSec.size) {
            const st_name = symtabSec.content.readUInt32LE(offset);
            strtab.seek(st_name);
            const name = strtab.readString();
            offset += 16;
            this.symbolTable.push(name);
        }
    }
}

class Elf32RelocationSection {
    relocation_info: Array<any>;
    constructor() {
        this.relocation_info = [];
    }

    parse(sec: Elf32Section, symtab: Elf32SymbolTableSection) {
        let offset = 0;
        while (offset < sec.size) {
            const r_offset = sec.readFixed32(true, false);
            const r_info = sec.readFixed32(true, false);
            const r_addend = sec.readFixed32(true, false);
            const symbol = symtab.symbolTable[r_info >> 8];
            this.relocation_info.push({
                offset: r_offset,
                symbol: symbol,
                addedend: r_addend,
            });
            offset += 12;
        }
    }
}

export class Elf32Parser {
    sections: Array<Elf32Section>;
    debugLines: Array<Elf32DebugLineSection>;
    textSecs: Array<Elf32Section>;
    textRelaSecs: Array<Elf32RelocationSection>;
    symtab: Elf32SymbolTableSection;
    strtab: Elf32Section;

    constructor(content?: Buffer) {
        this.sections = [];
        this.debugLines = [];
        this.textSecs = [];
        this.textRelaSecs = [];
        if (content) {
            this.parse(content);
        }
    }

    parse(content: Buffer) {
        const elfHeader = new Elf32Header();
        elfHeader.parse(content);
        for (let i = 0; i < elfHeader.shnum; i++) {
            const sec = new Elf32Section();
            sec.parseHeader(content, elfHeader, i);
            sec.parseContent(content);
            this.sections.push(sec);
        }
        for (const sec of this.sections) {
            sec.parseName(content, this.sections[elfHeader.shstrndx]);
            if (sec.name === '.strtab') {
                this.strtab = sec;
            }
            if (sec.name === '.symtab') {
                this.symtab = new Elf32SymbolTableSection();
                this.symtab.parse(sec, this.strtab);
            }
        }
        this.parseDebugLines();
        this.parseText();
    }

    parseDebugLines() {
        for (const sec of this.sections) {
            if (sec.name === '.debug_line') {
                this.debugLines.push(new Elf32DebugLineSection(sec));
            } else if (sec.name === '.rela.debug_line') {
                this.debugLines[this.debugLines.length - 1].relocation(sec, this.symtab);
            }
        }
    }

    parseText() {
        for (const sec of this.sections) {
            if (sec.name.startsWith('.text')) {
                this.textSecs.push(sec);
            }
        }
        for (const sec of this.sections) {
            if (sec.name.startsWith('.rela.text')) {
                const rela = new Elf32RelocationSection();
                rela.parse(sec, this.symtab);
                this.textRelaSecs.push(rela);
            }
        }
    }
}
