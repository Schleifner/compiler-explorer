import * as fsPromise from 'fs/promises';
import path from 'path';

import {ExecutionOptions} from '../../types/compilation/compilation.interfaces';
import {CompilerInfo} from '../../types/compiler.interfaces';
import {BasicExecutionResult, UnprocessedExecResult} from '../../types/execution/execution.interfaces';
import {CompilerOutputOptions, ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces';
import {ResultLine} from '../../types/resultline/resultline.interfaces';
import {BaseCompiler} from '../base-compiler';
import {CompilationEnvironment} from '../compilation-env';
import {AsmParserTasking} from '../parsers/asm-parser-tasking';
import * as utils from '../utils';

function parseSeverity(message: string): number {
    if (message.startsWith('W')) return 2;
    if (message.startsWith('E')) return 3;
    return 1;
}

function parseOutput(output: string, inputFilename?: string): ResultLine[] {
    const ansiColoursRe = /\x1B\[[\d;]*[Km]/g;
    const sourceRe = /\s+(?<level>\w+):\s*\["<source>"\s*(?<lineno>\d+)\/(?<column>\d+)]\s+(?<msg>.+)/;
    const result: ResultLine[] = [];
    utils.eachLine(output, line => {
        if (inputFilename) line = line.split(inputFilename).join('<source>');
        if (line !== null) {
            const lineObj: ResultLine = {text: line};
            const filteredline = line.replace(ansiColoursRe, '');
            const match = filteredline.match(sourceRe);
            if (match && match.groups) {
                const message = match.groups.msg.trim();
                lineObj.tag = {
                    line: parseInt(match.groups.lineno),
                    column: parseInt(match.groups.column || '0'),
                    text: message,
                    severity: parseSeverity(match.groups.level),
                    file: inputFilename ? path.basename(inputFilename) : undefined,
                };
            }
            result.push(lineObj);
        }
    });
    return result;
}

export class TaskingCompiler extends BaseCompiler {
    override asm: AsmParserTasking;
    filtersBinary: boolean;
    compileOptions: Array<string>;

    static get key() {
        return 'tasking';
    }

    constructor(info: CompilerInfo, env: CompilationEnvironment) {
        super(info, env);
        this.asm = new AsmParserTasking(this.compilerProps);
        this.compileOptions = ['-g', '--core=tc1.8', '-c', '-O0'];
        if (info.lang === 'c++') {
            this.compileOptions.push('--force-c++', '--pending-instantiations=200');
        }
    }

    override optionsForFilter(filters, outputFilename) {
        if (!filters.binary && !filters.binaryObject) {
            filters.binaryObject = true;
            filters.binary = true;
        }
        return this.compileOptions.concat(['-o', outputFilename]);
    }

    override processExecutionResult(input: UnprocessedExecResult, inputFilename?: string): BasicExecutionResult {
        const start = performance.now();
        const stdout = parseOutput(input.stdout, inputFilename);
        const stderr = parseOutput(input.stderr, inputFilename);
        const end = performance.now();
        return {
            ...input,
            stdout,
            stderr,
            processExecutionResultTime: end - start,
        };
    }

    override preProcess(source: string, filters: CompilerOutputOptions): string {
        if (filters.binaryObject && !this.stubRe.test(source)) {
            source += `\n${this.stubText}\n`;
        }
        return source;
    }

    protected override getSharedLibraryPathsAsArguments(libraries: any): string[] {
        return [];
    }

    async disassembleElf(outputFilename: string): Promise<string> {
        outputFilename = this.filename(outputFilename);
        const options = ['-cc', '-FCdFHMNSY', outputFilename];
        const execOptions: ExecutionOptions = {
            maxOutput: this.env.ceProps('max-asm-size', 64 * 1024 * 1024),
            customCwd: path.dirname(outputFilename),
        };
        const hldumptc = path.join(path.dirname(this.compiler.exe), 'hldumptc.exe');
        const objResult = await this.exec(hldumptc, options, execOptions);
        if (objResult.code === 0) {
            return objResult.stdout;
        } else {
            return '';
        }
    }

    override async objdump(
        outputFilename: string,
        result: any,
        maxSize: number,
        intelAsm: boolean,
        demangle: boolean,
        staticReloc: boolean,
        dynamicReloc: boolean,
        filters: ParseFiltersAndOutputOptions,
    ) {
        const start = performance.now();
        outputFilename = this.getObjdumpOutputFilename(outputFilename);

        if (!(await utils.fileExists(outputFilename))) {
            result.asm = '<No output file ' + outputFilename + '>';
            return result;
        }
        const elf = await fsPromise.readFile(outputFilename);
        const asm = await this.disassembleElf(outputFilename);
        const end = performance.now();
        result.objdumpTime = (end - start).toString();
        result.asm = JSON.stringify({
            elf: elf,
            asm: asm,
        });
        return result;
    }
}
