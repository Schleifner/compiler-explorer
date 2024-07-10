import {
    AsmResultLabel,
    AsmResultSource,
    ParsedAsmResult,
    ParsedAsmResultLine,
} from '../../types/asmresult/asmresult.interfaces';
import {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces';
import {assert} from '../assert';
import {PropertyGetter} from '../properties.interfaces';
import {ElfParserTool} from '../tooling/tasking-elfparse-tool';
import * as utils from '../utils';

import {AsmParser} from './asm-parser';
import {IAsmParser} from './asm-parser.interfaces';

interface Isntruction {
    addr: number;
    mcode: string[];
    operator: string;
    operands: string[];
    labels: string[];
}

export class AsmParserTasking extends AsmParser implements IAsmParser {
    sdeclRe: RegExp;
    sectRe: RegExp;
    instRe: RegExp;
    brInstRe: RegExp;
    brAddrRe: RegExp;
    filters: ParseFiltersAndOutputOptions;
    objpath: string;
    srcpath: string;
    elfParseTool: ElfParserTool;

    constructor(compilerProps?: PropertyGetter) {
        super(compilerProps);
        this.sdeclRe = /^\s*\.sdecl\s*'\.text\.(\b[\w.]+\b)',\s*CODE\s+AT\s0x([\da-f]{0,8})\s*$/;
        this.sectRe = /^\s*\.sect\s*'\.text\.\b[\w.]+\b'\s*$/;
        this.instRe = /([\da-f]{8})\s+((?:\s*[\da-f]{2})+)\s+([a-z]+(?:\.[a-z]+)?)(?:\s+(.+))?\s*$/;
        this.brInstRe = /^j.*$/;
        this.brAddrRe = /^0x([\da-f]{0,8})$/;
    }

    public setSrcPath(path: string) {
        this.srcpath = path;
    }

    parseWithoutLink(lines: string[]) {
        const sec_insts = new Map<string, Isntruction[]>();
        let sec_name = '__NONE_SECTION__';
        let cur_insts: Isntruction[] = [];
        for (const line of lines) {
            let ma_res = line.match(this.sdeclRe);
            if (ma_res) {
                assert(ma_res !== undefined && ma_res !== null);
                sec_name = ma_res[1];
                cur_insts = [];
                sec_insts.set(sec_name, cur_insts);
                continue;
            }
            ma_res = line.match(this.instRe);
            if (ma_res) {
                assert(ma_res !== undefined && ma_res !== null);
                const operands = ma_res[4] ? ma_res[4].split(',') : [];
                const addr = BigInt.asUintN(32, BigInt('0x' + ma_res[1]));
                cur_insts.push({
                    addr: Number(addr),
                    mcode: ma_res[2].split(' '),
                    operator: ma_res[3],
                    operands: operands,
                    labels: [],
                });
            }
        }
        return sec_insts;
    }

    parseLinked(lines: string[]) {
        let max_mcode_len = 0;
        const links = new Map<number, string>();
        const insts: Isntruction[] = [];
        for (const line of lines) {
            let ma_res = line.match(this.sdeclRe);
            if (ma_res) {
                assert(ma_res !== undefined && ma_res !== null);
                const sec_name = ma_res[1];
                const sec_addr = ma_res[2];
                const addr = BigInt.asUintN(32, BigInt('0x' + sec_addr));
                links.set(Number(addr), sec_name);
            }
            ma_res = line.match(this.instRe);
            if (ma_res) {
                assert(ma_res !== undefined && ma_res !== null);
                const operands = ma_res[4].split(',');
                max_mcode_len = ma_res[2].length > max_mcode_len ? ma_res[2].length : max_mcode_len;
                const addr = BigInt.asUintN(32, BigInt('0x' + ma_res[1]));
                insts.push({
                    addr: Number(addr),
                    mcode: ma_res[2].split(' '),
                    operator: ma_res[3],
                    operands: operands,
                    labels: [],
                });
            }
        }
        this.processLink(links, insts);

        return [links, insts];
    }

    processLink(link: Map<number, string>, insts: Isntruction[]) {
        const labels = new Map<number, string>();
        for (const inst of insts) {
            const ma_res = inst.operator.match(this.brInstRe);
            if (ma_res) {
                for (const [i, op] of inst.operands.entries()) {
                    const _ma_res = op.match(this.brAddrRe);
                    if (_ma_res === null) {
                        continue;
                    }
                    const addr = Number(BigInt.asUintN(32, BigInt('0x' + _ma_res[1])));
                    const target = link.get(addr);
                    if (target) {
                        inst.operands[i] = `<${target}>`;
                        inst.labels.push(inst.operands[i]);
                    } else {
                        const sec_addr = this.findAddrNest(link, addr);
                        const target = link.get(sec_addr);
                        assert(target !== undefined && target !== null);
                        inst.operands[i] = `<${target}+${addr - sec_addr}>`;
                        inst.labels.push(inst.operands[i]);
                        labels.set(addr, `${target}+${addr - sec_addr}`);
                    }
                }
            }
        }
        for (const [k, v] of labels.entries()) {
            link.set(k, v);
        }
    }

    findAddrNest(link: Map<number, string>, addr: number) {
        const sec_addrs = [...link.keys()].sort();
        let left = 0;
        let right = sec_addrs.length;
        let ptr = Math.floor((left + right) / 2);
        while (left < right) {
            if (sec_addrs[ptr] < addr) {
                left = ptr + 1;
            } else if (sec_addrs[ptr] > addr) {
                right = ptr - 1;
            } else {
                break;
            }
            ptr = Math.floor((left + right) / 2);
        }
        return sec_addrs[ptr];
    }

    composeAsmText(inst: Isntruction) {
        let text = '';
        if (!this.filters.directives) {
            text += this.elfParseTool.toAddrStr(inst.addr) + ' ';
            const mcode = inst.mcode.join(' ');
            text += mcode + ' '.repeat(20).substring(mcode.length, 20);
        }
        text += inst.operator;
        if (inst.operands.length > 0) {
            text += ' '.repeat(10 - inst.operator.length) + inst.operands.join(',');
        }
        return text;
    }

    isSrcSection(sec: string) {
        const srcname = this.elfParseTool.getSrcname();
        return sec.startsWith(srcname) && !sec.substring(srcname.length + 1).startsWith('.');
    }

    stripHeader(sec: string) {
        return sec.substring(sec.lastIndexOf('.') + 1);
    }

    override processAsm(asmResult: string, filters: ParseFiltersAndOutputOptions): ParsedAsmResult {
        this.filters = filters;
        if (filters.binaryObject) return this.processBinaryAsm(asmResult, filters);
        const startTime = process.hrtime.bigint();
        this.elfParseTool = new ElfParserTool(this.objpath, this.srcpath, filters.binaryObject, filters.libraryCode);
        const elf = this.elfParseTool.start();
        const asm: ParsedAsmResultLine[] = [];
        const labelDefinitions: Record<string, number> = {};

        const asmLines = utils.splitLines(asmResult);
        const startingLineCount = asmLines.length;

        const sec_insts = this.parseWithoutLink(asmLines);
        for (const sec of sec_insts.keys()) {
            if (!filters.libraryCode && !this.isSrcSection(sec)) {
                continue;
            }
            const src_map = elf.lineMap.get('.text.' + sec);
            const insts = sec_insts.get(sec);
            assert(insts !== undefined && insts !== null);
            asm.push({text: this.stripHeader(sec) + ':'});
            let last_line = -1;
            for (const inst of insts) {
                const addr = this.elfParseTool.toAddrStr(inst.addr);
                const line = src_map ? src_map.get(addr) : -1;
                if (line) {
                    last_line = line;
                }
                const src: AsmResultSource = {
                    file: null,
                    line: last_line,
                };
                asm.push({
                    text: this.composeAsmText(inst),
                    // opcodes: inst.mcode,
                    // address: inst.addr,
                    source: src,
                });
            }
        }

        const endTime = process.hrtime.bigint();
        return {
            asm: asm,
            labelDefinitions: labelDefinitions,
            parsingTime: ((endTime - startTime) / BigInt(1000000)).toString(),
            filteredCount: startingLineCount - asm.length,
        };
    }

    override processBinaryAsm(asmResult: string, filters: ParseFiltersAndOutputOptions): ParsedAsmResult {
        const startTime = process.hrtime.bigint();
        this.elfParseTool = new ElfParserTool(this.objpath, this.srcpath, filters.binaryObject, filters.libraryCode);
        const elf = this.elfParseTool.start();
        const asm: ParsedAsmResultLine[] = [];
        const labelDefinitions: Record<string, number> = {};

        const asmLines = utils.splitLines(asmResult);
        const startingLineCount = asmLines.length;

        const sec_insts = this.parseWithoutLink(asmLines);
        const src_map = elf.lineMap.get(this.srcpath);
        for (const sec of sec_insts.keys()) {
            if (!filters.libraryCode && !this.isSrcSection(sec)) {
                continue;
            }
            const insts = sec_insts.get(sec);
            assert(insts !== undefined && insts !== null);
            asm.push({text: this.stripHeader(sec) + ':'});
            let last_line = -1;
            for (const inst of insts) {
                const addr = this.elfParseTool.toAddrStr(inst.addr);
                const line = src_map ? src_map.get(addr) : -1;
                if (line) {
                    last_line = line;
                }
                const src: AsmResultSource = {
                    file: null,
                    line: last_line,
                };
                asm.push({
                    text: this.composeAsmText(inst),
                    // opcodes: inst.mcode,
                    // address: inst.addr,
                    source: src,
                });
            }
        }

        const endTime = process.hrtime.bigint();
        return {
            asm: asm,
            labelDefinitions: labelDefinitions,
            parsingTime: ((endTime - startTime) / BigInt(1000000)).toString(),
            filteredCount: startingLineCount - asm.length,
        };
    }
}
