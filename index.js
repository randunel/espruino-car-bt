'use strict';

/* global Serial1 A10 A9 A8 C9 C8 C7 C6 LED1 LED2 LED3 digitalPulse digitalWrite analogWrite E */

// rm output.txt; cat espruino.js | awk '{ print "send " $0; }' > commands.txt; minicom -b 9600 -D /dev/ttyACM0 -S commands.txt -C output.txt < escape.txt; cat output.txt

/**
 * BEGIN gamepad + bluetooth section
 */

function noop() {}

const gamepadArg1Handlers = [{
    bit: 0x01, // start
    event: 'gamepad-start'
}, {
    bit: 0x02, // select
    event: 'gamepad-select'
}, {
    bit: 0x04, // triangle
    event: 'gamepad-triangle'
}, {
    bit: 0x08, // circle
    event: 'gamepad-circle'
}, {
    bit: 0x10, // cross
    event: 'gamepad-cross'
}, {
    bit: 0x20, // square
    event: 'gamepad-square'
}];

const gamepadDigitalHandlers = [{
    bit: 0x01, // up
    event: 'gamepad-up'
}, {
    bit: 0x02, // down
    event: 'gamepad-down'
}, {
    bit: 0x04, // left
    event: 'gamepad-left'
}, {
    bit: 0x08, // right
    event: 'gamepad-right'
}];

function gamepadHandler(bytes) {
    // const gamepadDigitalBit2 = {
    //     up: 0,
    //     down: 1,
    //     left: 2,
    //     right: 3
    // };

    //Byte 2 in case of Analog/Accelerometer Mode GamePad
    //XXXXXYYY = XXXXX(*15) is angle in radians, YYY is radius
    console.log('gamepadHandler', bytes); /* eslint-disable-line no-console */

    const cmd1 = bytes[5];
    gamepadArg1Handlers.forEach(function(handler) {
        const position = cmd1 & handler.bit ? 'on' : 'off';
        E.emit(`${handler.event}-${position}`);
    });

    const cmd2 = bytes[6];
    if (bytes[2] & 0x01) { // digital mode
        gamepadDigitalHandlers.forEach(function(handler) {
            const position = cmd2 & handler.bit ? 'on' : 'off';
            E.emit(`${handler.event}-${position}`);
        });
    } else {
    }
}

const modules = {
    0x00: {
        name: 'dabble',
        bytes: 8,
        functions: {
            0x01: {
                name: 'connection'
            },
            0x02: {
                name: 'change input mode',
                handler: noop
            }
        }
    },
    0x01: {
        name: 'gamepad',
        bytes: 8,
        functions: {
            0x01: {
                name: 'digital',
                handler: gamepadHandler
            },
            0x02: {
                name: 'analog',
                handler: gamepadHandler
            },
            0x03: {
                name: 'accl',
                handler: gamepadHandler
            }
        }
    },
    0x04: {
        name: 'sensors',
        bytes: 10,
        functions: {
            0x01: {
                name: 'accelerometer',
                bytes: 20
            },
            0x02: {
                name: 'gyroscope',
                bytes: 20
            },
            0x03: {
                name: 'magnetometer',
                bytes: 20
            },
            0x04: {
                name: 'proximity',
                bytes: 10
            },
            0x05: {
                name: 'light',
                bytes: 10
            },
            0x06: {
                name: 'sound'
            },
            0x07: {
                name: 'temperature'
            },
            0x08: {
                name: 'barometer'
            },
            0x09: {
                name: 'gps',
                bytes: 15
            },
            0x0a: {
                name: 'speed'
            }
        }
    },
    0x05: {
        name: 'motor controls',
        bytes: 7,
        functions: {
            0x01: {
                name: 'motor1',
                bytes: 8
            },
            0x02: {
                name: 'motor2',
                bytes: 8
            },
            0x03: {
                name: 'servo1',
                bytes: 7
            },
            0x04: {
                name: 'servo2',
                bytes: 7
            }
        }
    }
};

let command;

function resetCommand() {
    command = {
        startedAt: 0,
        bytes: []
    };
}

resetCommand();

function handleChar(charCode) {
    if (charCode === 0xff) {
        if (command.startedAt < Date.now() - 1000) {
            // previous command older than 1s, this is a new command
            command = {
                startedAt: Date.now(),
                bytes: [charCode]
            };
            return;
        }

        const module = getModuleFunction(command.bytes);
        if (command.bytes.length >= module.bytes) {
            // previous command has finished
            command = {
                startedAt: Date.now(),
                bytes: [charCode]
            };
            return;
        }
    }

    if (command.startedAt < Date.now() - 1000) {
        // command older than 1s, abort
        // console.log('command too old, resetting.'); /*eslint-disable-line no-console*/
        resetCommand();
        return;
    }

    command.bytes.push(charCode);
    // console.log(command.bytes); /*eslint-disable-line no-console*/

    if (
        command.bytes.length >= 4 && // each command has at least 4 header bytes
        charCode === 0x00 // the ending char is always 0x00
    ) {
        // unsure whether the transmission has ended or not, check the protocol
        const module = getModuleFunction(command.bytes);
        if (!module) {
            // unknown module, best to end now
            const cmd = command;
            resetCommand();
            handleUnknownCommand(cmd);
            return;
        }
        if (command.bytes.length >= module.bytes) {
            // this command has a known set of arguments
            const cmd = command;
            resetCommand();
            handleCommand(cmd, module);
            return;
        }
        // transmission not over, wait for more bytes
    }
    // transmission not over, wait for more bytes
}

function getModuleFunction(bytes) {
    const module = modules[bytes[1]];
    if (!module) {
        return null;
    }
    const result = {
        name: module.name,
        bytes: module.bytes
    };
    const moduleFunction = module.functions[bytes[2]];
    if (!moduleFunction) {
        return result;
    }
    result.bytes = moduleFunction.bytes || result.bytes;
    result.function = moduleFunction;
    return result;
}

function handleUnknownCommand() {
    console.log('unknown cmd received'); /*eslint-disable-line no-console*/
}

function handleCommand(cmd, module) {
    if (!module.function.handler) {
        /*eslint-disable-next-line no-console*/
        console.log('missing function handler for', module, cmd);
        return;
    }
    module.function.handler(cmd.bytes);
}

Serial1.setup(9600, {
    rx: A10,
    tx: A9
});

Serial1.on('data', function(data) {
    for (let ci = 0; ci < data.length; ci += 1) {
        handleChar(data.charCodeAt(ci));
    }
});

Serial1.print('AT+VERS?');

/**
 * END gamepad + bluetooth section
 */

/**
 * BEGIN motors section
 */

function spinWheel(wheel, speed) {
    speed = speed || 0;
    if (speed > 100) {
        speed = 100;
    }
    let ia, ib;
    switch (wheel) {
        case 'left':
            ia = C6;
            ib = C7;
            break;
        case 'right':
            ia = C8;
            ib = C9;
            break;
        default:
            console.log('unknown wheel'); /*eslint-disable-line no-console*/
            return;
    }
    analogWrite(ia, speed / 100);
    analogWrite(ib, 0);
}

spinWheel('right', 100);
setTimeout(function() {
    spinWheel('right', 33);
}, 1000);
setTimeout(function() {
    spinWheel('right', 25);
}, 2000);
setTimeout(function() {
    spinWheel('right', 70);
}, 3000);
setTimeout(function() {
    spinWheel('right', 0);
}, 4000);

/**
 * END motors section
 */

/**
 * BEGIN servo section
 */

function createServoController(pin, options) {
    let interval, currentPos = options.currentPos || undefined;
    let offs = 1, mul = 1;
    if (options && options.range) {
        mul = options.range;
        offs = 1.5 - (mul / 2);
    }

    return {
        move: function(pos, time, callback) {
            if (time === undefined) {
                time = 1000;
            }
            let amt = 0;
            if (currentPos === undefined) {
                currentPos = pos;
            }
            if (interval) {
                clearInterval(interval);
            }
            const initial = currentPos;
            interval = setInterval(function() {
                if (amt > 1) {
                    clearInterval(interval);
                    interval = undefined;
                    amt = 1;
                    if (callback) {
                        callback();
                    }
                }
                currentPos = pos * amt + initial * (1 - amt);
                digitalPulse(pin, 1, offs + E.clip(currentPos, 0, 1) * mul);
                amt += 1000.0 / (20 * time);
            }, 20);
        },
        stop: function(callback) {
            if (interval) {
                clearInterval(interval);
                // TOD0: call other callbacks
            }
            if (callback) {
                callback();
            }
        }
    };
}

const servo = createServoController(A8, { range: 2, currentPos: 0.5 });
servo.move(0.5, 1000);

function startServoLeft() {
    servo.move(0, 2000);
    function abandon() {
        E.removeListener('gamepad-right-on', abandon);
        E.removeListener('gamepad-left-off', stop);
    }
    function stop() {
        E.removeListener('gamepad-right-on', abandon);
        E.removeListener('gamepad-left-off', stop);
        servo.stop();
    }
    E.on('gamepad-right-on', abandon);
    E.on('gamepad-left-off', stop);
}

function startServoRight() {
    servo.move(1, 2000);
    function abandon() {
        E.removeListener('gamepad-left-on', abandon);
        E.removeListener('gamepad-right-off', stop);
    }
    function stop() {
        E.removeListener('gamepad-left-on', abandon);
        E.removeListener('gamepad-right-off', stop);
        servo.stop();
    }
    E.on('gamepad-left-on', abandon);
    E.on('gamepad-right-off', stop);
}

/**
 * END servo section
 */

/**
 * BEGIN event listeners section
 */

E.on('gamepad-start-on', function() {
    digitalWrite(LED3, 1);
});

E.on('gamepad-start-off', function() {
    digitalWrite(LED3, 0);
});

E.on('gamepad-cross-on', function() {
    digitalWrite(LED1, 1);
});

E.on('gamepad-cross-off', function() {
    digitalWrite(LED1, 0);
});

E.on('gamepad-triangle-on', function() {
    digitalWrite(LED2, 1);
});

E.on('gamepad-triangle-off', function() {
    digitalWrite(LED2, 0);
});

E.on('gamepad-left-on', function() {
    startServoLeft();
});

E.on('gamepad-right-on', function() {
    startServoRight();
});

/**
 * END event listeners section
 */
