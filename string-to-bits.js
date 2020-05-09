'use strict';

function test(data) {
    var bits = [];
    for (var ci = 0; ci < data.length; ci++) {
        var char = data.charAt(ci);
        console.log(char, char.charCodeAt(0).toString(2));
        for (var i = 64; i >= 0; i--) {
            var bit = char & (1 << i) ? 1 : 0;
            bits.push(bit);
        }
    }
    console.log(bits);
}

test('asd');
