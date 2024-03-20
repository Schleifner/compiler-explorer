import {
    AsmResultLabel,
    AsmResultSource,
    ParsedAsmResult,
    ParsedAsmResultLine,
} from '../../types/asmresult/asmresult.interfaces';
import {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces';
import {PropertyGetter} from '../properties.interfaces';
import {Elf32DebugLineSection, Elf32Parser} from '../tooling/tasking-elfparse-tool';
import * as utils from '../utils';

import {AsmParser} from './asm-parser';
import {IAsmParser} from './asm-parser.interfaces';
import {AsmRegex} from './asmregex';

class AsmTextSection {
    section: string;
    lines: Array<ParsedAsmResultLine>;
    constructor(section: string) {
        this.lines = [];
        this.section = section;
    }

    addAsm(addr: string, opcode: string, operands: string) {
        const line: ParsedAsmResultLine = {
            text: operands,
            opcodes: opcode.length === 0 ? undefined : opcode.trim().split(' '),
            address: parseInt(addr, 16),
            source: null,
        };
        this.lines.push(line);
    }

    attachDebugLine(debugLineSec: Elf32DebugLineSection) {
        const offset = debugLineSec.relaOffset;
        let lineno = 0;
        while (lineno < this.lines.length) {
            const line = this.lines[lineno];
            for (const debugLine of debugLineSec.decodedLines) {
                if (debugLine.opaddr + offset === line.address) {
                    line.source = {
                        file: '',
                        mainsource: true,
                        line: debugLine.line,
                    };
                }
            }
            lineno++;
        }
    }
}

export class AsmParserTasking extends AsmParser implements IAsmParser {
    sectionRe: RegExp;
    asmRe: RegExp;
    _elffilepath: string;
    testcpppath: string;

    constructor(compilerProps?: PropertyGetter) {
        super(compilerProps);
        this.sectionRe = /^\s*.sect\s+'(?<sect>.+)'/;
        this.asmRe = /(?<addr>[\da-f]{8})\s+(?<code>(?:[\da-f]{2}\s){1,4})\s+(?:\S*:)*\s*(?<opcode>.+)/;
    }

    override processAsm(asmResult: string, filters: ParseFiltersAndOutputOptions): ParsedAsmResult {
        if (asmResult === '<Compilation failed>') {
            return {
                parsingTime: '0',
                asm: [
                    {
                        text: asmResult,
                    },
                ],
            };
        }
        const startTime = process.hrtime.bigint();
        const labelDefinitions: Record<string, number> = {};
        const raw = JSON.parse(asmResult);
        const asmContent: string = raw.asm;
        const elfContent: Buffer = Buffer.from(raw.elf);
        const asmLines = utils.splitLines(asmContent);
        const textSecs: Array<AsmTextSection> = [];
        let asm: ParsedAsmResultLine[] = [];
        let match;
        for (const line of asmLines) {
            if (line.length === 0) {
                continue;
            } else if ((match = line.match(this.sectionRe))) {
                textSecs.push(new AsmTextSection(match.groups.sect));
            } else if ((match = line.match(this.asmRe))) {
                const textSec = textSecs[textSecs.length - 1];
                if (filters.binary && filters.binaryObject) {
                    textSec.addAsm(match.groups.addr, '', match.groups.opcode);
                } else {
                    textSec.addAsm(match.groups.addr, match.groups.code, match.groups.opcode);
                }
            }
        }
        const elfParser = new Elf32Parser(elfContent);
        for (const sec of textSecs) {
            for (const debugLineSec of elfParser.debugLines) {
                if (debugLineSec.relaSection === sec.section) {
                    sec.attachDebugLine(debugLineSec);
                }
            }
        }
        for (const sec of textSecs) {
            asm.push({text: `${sec.section}:`});
            asm = asm.concat(sec.lines);
        }
        const endTime = process.hrtime.bigint();
        return {
            asm: asm,
            labelDefinitions: labelDefinitions,
            parsingTime: ((endTime - startTime) / BigInt(1000000)).toString(),
            filteredCount: asmLines.length - asm.length,
        };
    }
}
