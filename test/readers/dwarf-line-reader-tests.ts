import {assert} from '../../lib/assert';
import {DwarfLineReader, LineInfoItem} from '../../lib/tooling/readers/dwarf-line-reader';

describe('test DwarfLineReader', () => {
    const lineReader = new DwarfLineReader();

    it('test lineReader.header', () => {
        lineReader.resetAll();
        const file_name = Array.from('test-cpp.cpp').map(letter => {
            const val = letter.codePointAt(0);
            assert(val !== undefined && val !== null);
            return val;
        });
        const entry = new Uint8Array(
            [72, 0, 0, 0].concat(
                // unit_len <32-bit>
                [3, 0], // version <16-bit>
                [32, 0, 0, 0], // head_len <32-bit>
                [2, 1, -4, 9, 10], // machine initial value <byte[4]>
                [0, 1, 1, 1, 1, 0, 0, 0, 1], // std opcode args <byte[opbase - 1]>
                [0], // include directories <strings with endle 0>
                file_name,
                [0], // filepath <strings with endle 0>
                [0, 0, 0, 0], // file attributes <byte[4]>
                [
                    5, 56, 7, 0, 5, 2, 0, 0, 0, 0, 1, 5, 88, 1, 5, 21, 9, 6, 0, 3, 1, 1, 5, 1, 3, 1, 1, 7, 9, 6, 0, 0,
                    1, 1,
                ], // opcode <byte[?]>
            ),
        );
        lineReader.readEntries(entry);

        const header = lineReader.getHeader();

        header.unit_len.should.equal(72);
        header.version.should.equal(3);
        header.header_len.should.equal(32);

        header.min_inst_len.should.equal(2);
        header.dft_is_stmt.should.equal(1);
        header.line_base.should.equal(-4);
        header.line_range.should.equal(9);
        header.opcode_base.should.equal(10);

        const std_op_argcs = [0, 1, 1, 1, 1, 0, 0, 0, 1];
        header.std_op_lens.length.should.equal(std_op_argcs.length);
        for (let i = 0; i < header.std_op_lens.length; i++) {
            header.std_op_lens[i].should.equal(std_op_argcs[i]);
        }

        header.include_dirs.length.should.equal(0);

        header.file_names.length.should.equal(1);
        for (const file of header.file_names) {
            file.filename.should.equal('test-cpp.cpp');
            file.include_dir.should.equal('');
            file.inc_dir_index.should.equal(0n);
            file.modified_time.should.equal(0n);
            file.file_length.should.equal(0n);
        }

        header.op_begin.should.equal(38);
        header.op_length.should.equal(34);
    });

    it('test lineReader read opcode', () => {
        lineReader.resetAll();
        const file_name = Array.from('test-cpp.cpp').map(letter => {
            const val = letter.codePointAt(0);
            assert(val !== undefined && val !== null);
            return val;
        });
        const entry = new Uint8Array(
            [72, 0, 0, 0].concat(
                // unit_len <32-bit>
                [3, 0], // version <16-bit>
                [32, 0, 0, 0], // head_len <32-bit>
                [2, 1, -4, 9, 10], // machine initial value <byte[4]>
                [0, 1, 1, 1, 1, 0, 0, 0, 1], // std opcode args <byte[opbase - 1]>
                [0], // include directories <strings with endle 0>
                file_name,
                [0], // filepath <strings with endle 0>
                [0, 0, 0, 0], // file attributes <byte[4]>
                [
                    5, 56, 7, 0, 5, 2, 0, 0, 0, 0, 1, 5, 88, 1, 5, 21, 9, 6, 0, 3, 1, 1, 5, 1, 3, 1, 1, 7, 9, 6, 0, 0,
                    1, 1,
                ], // opcode <byte[?]>
            ),
        );
        lineReader.readEntries(entry);
        const lineInfoItems_expected: LineInfoItem[] = [
            {address_start: 0x0n, address_end: 0x0n, line: 1, column: 56, inc_dir: '', srcpath: 'test-cpp.cpp'},
            {address_start: 0x0n, address_end: 0x6n, line: 1, column: 88, inc_dir: '', srcpath: 'test-cpp.cpp'},
            {address_start: 0x6n, address_end: 0x6n, line: 2, column: 21, inc_dir: '', srcpath: 'test-cpp.cpp'},
            {address_start: 0x6n, address_end: 0xcn, line: 3, column: 1, inc_dir: '', srcpath: 'test-cpp.cpp'},
            {address_start: 0xcn, address_end: 0x0n, line: 3, column: 1, inc_dir: '', srcpath: 'test-cpp.cpp'},
        ];
        const lineInfoItems_actual = lineReader.lineInfo();
        lineInfoItems_actual.length.should.equal(lineInfoItems_expected.length);
        for (const [i, lineInfo_actual] of lineInfoItems_actual.entries()) {
            const lineInfo_expected = lineInfoItems_expected[i];
            lineInfo_actual.address_start.should.equal(lineInfo_expected.address_start);
            lineInfo_actual.address_end.should.equal(lineInfo_expected.address_end);
            lineInfo_actual.line.should.equal(lineInfo_expected.line);
            lineInfo_actual.column.should.equal(lineInfo_expected.column);
            lineInfo_actual.inc_dir.should.equal(lineInfo_expected.inc_dir);
            lineInfo_actual.srcpath.should.equal(lineInfo_expected.srcpath);
        }
    });
});
