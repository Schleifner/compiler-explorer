import path from 'path';
import {fileURLToPath} from 'url';

import _ from 'underscore';

import {CompilationResult, ExecutionOptions} from '../../types/compilation/compilation.interfaces';
import {ParseFiltersAndOutputOptions} from '../../types/features/filters.interfaces';
import {BaseCompiler} from '../base-compiler';
import {TaskingHlObjdumper} from '../objdumper';
import {AsmParserTasking} from '../parsers/asm-parser-tasking';

export class TaskingCompiler extends BaseCompiler {
    protected override objdumperClass = TaskingHlObjdumper;
    protected override asm = new AsmParserTasking();
    protected srcpath: string;
    protected objpath: string;

    static get key() {
        return 'tasking';
    }

    protected override optionsForFilter(
        filters: ParseFiltersAndOutputOptions,
        outputFilename: string,
        userOptions?: string[] | undefined,
    ): string[] {
        const options: string[] = ['-g', '--core=tc1.8'];
        if (this.lang.id === 'c++') {
            options.push('--force-c++');
        }
        if (filters.binaryObject) {
            const cfd = path.dirname(fileURLToPath(import.meta.url));
            const script_path = path.resolve(cfd, '..\\..\\etc\\link-scripts\\tc49x.lsl');
            options.push('--lsl-core=tc0', '--lsl-file=' + script_path);
        } else {
            options.push('-co');
        }
        options.push('-o', outputFilename);
        return options;
    }

    override async runCompiler(
        compiler: string,
        options: string[],
        inputFilename: string,
        execOptions: ExecutionOptions,
    ): Promise<CompilationResult> {
        this.srcpath = inputFilename;
        return super.runCompiler(compiler, options, inputFilename, execOptions);
    }

    override async postProcess(result, outputFilename: string, filters: ParseFiltersAndOutputOptions) {
        this.objpath = outputFilename;
        return super.postProcess(result, outputFilename, filters);
    }

    override async processAsm(result: any, filters: any, options: any) {
        this.asm.objpath = this.objpath;
        this.asm.setSrcPath(this.srcpath);
        return this.asm.process(result, filters);
    }
}
