// Copyright (c) 2018, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import * as fs from 'fs';
import {fileURLToPath} from 'url';

import {uniqueId} from 'underscore';
import {add} from 'winston';

import {assert} from '../lib/assert';
import {AsmParser} from '../lib/parsers/asm-parser';
import {AsmParserTasking} from '../lib/parsers/asm-parser-tasking';
import {VcAsmParser} from '../lib/parsers/asm-parser-vc';
import {AsmRegex} from '../lib/parsers/asmregex';
import {ElfParser} from '../lib/tooling/readers/elf-parser';
import {ElfReader} from '../lib/tooling/readers/elf-reader';
import {ElfParserTool} from '../lib/tooling/tasking-elfparse-tool';

import {makeFakeParseFiltersAndOutputOptions} from './utils';

describe('ASM CL parser', () => {
    it('should work for error documents', () => {
        const parser = new VcAsmParser();
        const result = parser.process('<Compilation failed>', {
            directives: true,
        });

        result.asm.should.deep.equal([
            {
                source: null,
                text: '<Compilation failed>',
            },
        ]);
    });
});

describe('ASM regex base class', () => {
    it('should leave unfiltered lines alone', () => {
        const line = '     this    is    a line';
        AsmRegex.filterAsmLine(line, makeFakeParseFiltersAndOutputOptions({})).should.equal(line);
    });
    it('should use up internal whitespace when asked', () => {
        AsmRegex.filterAsmLine(
            '     this    is    a line',
            makeFakeParseFiltersAndOutputOptions({trim: true}),
        ).should.equal('  this is a line');
        AsmRegex.filterAsmLine('this    is    a line', makeFakeParseFiltersAndOutputOptions({trim: true})).should.equal(
            'this is a line',
        );
    });
    it('should keep whitespace in strings', () => {
        AsmRegex.filterAsmLine(
            'equs     "this    string"',
            makeFakeParseFiltersAndOutputOptions({trim: true}),
        ).should.equal('equs "this    string"');
        AsmRegex.filterAsmLine(
            '     equs     "this    string"',
            makeFakeParseFiltersAndOutputOptions({trim: true}),
        ).should.equal('  equs "this    string"');
        AsmRegex.filterAsmLine(
            'equs     "this    \\"  string  \\""',
            makeFakeParseFiltersAndOutputOptions({trim: true}),
        ).should.equal('equs "this    \\"  string  \\""');
    });
    it('should not get upset by mismatched strings', () => {
        AsmRegex.filterAsmLine(
            'a   "string    \'yeah',
            makeFakeParseFiltersAndOutputOptions({trim: true}),
        ).should.equal('a "string \'yeah');
    });
});

describe('ASM parser base class', () => {
    let parser;
    const filters = {};

    before(() => {
        parser = new AsmParser();
    });

    it('should recognize source column numbers', () => {
        const asm = `
    .text
    .intel_syntax noprefix
    .file	"tmp.cpp"
    .file	1 "/usr/include" "stdlib.h"
    .file	2 "/usr/bin/../lib/gcc/x86_64-linux-gnu/9/../../../../include/c++/9/bits" "std_abs.h"
    .file	3 "/usr/bin/../lib/gcc/x86_64-linux-gnu/9/../../../../include/c++/9" "cstdlib"
    .file	4 "/usr/lib/llvm-11/lib/clang/11.0.0/include" "stddef.h"
    .file	5 "/usr/bin/../lib/gcc/x86_64-linux-gnu/9/../../../../include/c++/9" "stdlib.h"
    .globl	main                            # -- Begin function main
    .p2align	4, 0x90
    .type	main,@function
main:                                   # @main
    .Lfunc_begin0:
    .file	6 "/home/necto/proj/compiler-explorer" "tmp.cpp"
    .loc	6 3 0                           # tmp.cpp:3:0
    .cfi_startproc
# %bb.0:                                # %entry
    push	rbp
    .cfi_def_cfa_offset 16
    .cfi_offset rbp, -16
    mov1	rbp, rsp
    .cfi_def_cfa_register rbp
    sub	rsp, 48
    mov2	dword ptr [rbp - 4], 0
.Ltmp0:
    .loc	6 4 20 prologue_end             # tmp.cpp:4:20
    mov3	edi, 16
    call	malloc
    .loc	6 4 9 is_stmt 0                 # tmp.cpp:4:9
    mov4	qword ptr [rbp - 16], rax
`;
        const output = parser.process(asm, filters);
        const push_line = output.asm.find(line => line.text.trim().startsWith('push'));
        const mov1_line = output.asm.find(line => line.text.trim().startsWith('mov1'));
        const call_line = output.asm.find(line => line.text.trim().startsWith('call'));
        const mov4_line = output.asm.find(line => line.text.trim().startsWith('mov4'));
        push_line.source.should.not.have.ownProperty('column');
        mov1_line.source.should.not.have.ownProperty('column');
        call_line.source.column.should.equal(20);
        mov4_line.source.column.should.equal(9);
    });

    it('should parse line numbers when a column is not specified', () => {
        const asm = `
        .section .text
.LNDBG_TX:
# mark_description "Intel(R) C Intel(R) 64 Compiler XE for applications running on Intel(R) 64, Version 12.1 Build 20120410";
        .file "iccKTGaIssTdIn_"
        .text
..TXTST0:
# -- Begin  main
# mark_begin;
       .align    16,0x90
        .globl main
main:
..B1.1:                         # Preds ..B1.0
..___tag_value_main.2:                                          #
..LN0:
  .file   1 "-"
   .loc    1  2  is_stmt 1
        pushq     %rbp                                          #2.12
`;
        const output = parser.process(asm, filters);
        const pushq_line = output.asm.find(line => line.text.trim().startsWith('pushq'));
        pushq_line.source.should.not.have.ownProperty('column');
        pushq_line.source.line.should.equal(2);
    });
});

describe('Elf parse tooling', () => {
    let tool: ElfParserTool;
    let parser: ElfParser;
    let elf_reader: ElfReader;
    let line_reader;
    let elfInfo;
    const ELFMAG: string = String.fromCodePoint(0x7f) + 'ELF';
    const file = fileURLToPath(new URL('tasking\\cpp_demo.cpp.o', import.meta.url));

    before(() => {
        tool = new ElfParserTool(file, false);
        tool.setSrcPath('cpp_demo.cpp');
        parser = new ElfParser();
        elf_reader = new ElfReader();
        parser.bindFile(file);
        elf_reader.readElf(fs.readFileSync(file));
        elfInfo = tool.start();
    });

    it('sections', () => {
        //read file
        const file1 = fileURLToPath(new URL('tasking\\section-name', import.meta.url));
        const secs = fs.readFileSync(file1).toString().split('\n');
        const sec_names: string[] = [];
        for (const sec of secs) {
            const name = sec.substring('section name: '.length);
            sec_names.push(name);
        }
        let i = 0;
        const elfgroups = elf_reader.getGroups();
        for (const group of elfgroups) {
            const sections = elf_reader.getSecsOf(group, (a: number) => {
                return true;
            });
            for (const section of sections) {
                elf_reader.readSecName(section).should.equal(sec_names[i]);
                i++;
            }
        }
    });

    it('section .debug_line', () => {
        //read file
        const file1 = fileURLToPath(new URL('tasking\\debug-line', import.meta.url));
        const secs = fs.readFileSync(file1).toString().split('\n');
        const sec_info: {offs: bigint; size: number}[] = [];
        for (const sec of secs) {
            sec_info.push({
                offs: BigInt(sec.split(' ')[0]),
                size: Number(sec.split(' ')[1]),
            });
        }

        const groups = elf_reader.getGroups();
        groups.length.should.equal(sec_info.length);
        for (const [i, element] of sec_info.entries()) {
            const dbg_secs = elf_reader.getDbgLineSecsOf(groups[i]);
            dbg_secs.length.should.equal(1);
            elf_reader.readSecName(dbg_secs[0]).startsWith('.debug_line').should.equal(true);
            dbg_secs[0].sh_offset.should.equal(element.offs);
            dbg_secs[0].sh_size.should.equal(element.size);
        }
    });

    //make sure line number
    it('line map', () => {
        //map
        const file1 = fileURLToPath(new URL('tasking\\line-map.json', import.meta.url));
        const json = JSON.parse(fs.readFileSync(file1).toString());
        const lineMap = new Map();
        for (const attr in json) {
            const map = new Map();
            for (const addr in json[attr]) {
                map.set(addr, json[attr][addr]);
            }
            lineMap.set(attr, map);
        }
        for (const key of lineMap.keys()) {
            elfInfo.lineSet.has(key).should.equal(true);
        }
        // map
        for (const key of lineMap.keys()) {
            const map1 = elfInfo.lineMap.get(key);
            const map2 = lineMap.get(key);
            assert<boolean>(map1 !== undefined && map1 !== null);
            assert<boolean>(map2 !== undefined && map2 !== null);
            for (const addr in map2) {
                map1.get(addr).should.equal(map2.get(addr));
            }
        }
    });
});
