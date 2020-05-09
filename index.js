'use strict';

/* global Serial1 A10 A9 A8 C9 C8 C7 C6 digitalPulse analogWrite E */

// rm output.txt; cat espruino.js | awk '{ print "send " $0; }' > commands.txt; minicom -b 9600 -D /dev/ttyACM0 -S commands.txt -C output.txt < escape.txt; cat output.txt

const moduleIds = {
    dabble: 0x00,
    gamepad: 0x01,
    terminal: 0x02,
    pinmonitor: 0x03,
    sensors: 0x04,
    controls: 0x05,
    camera: 0x06,
    eviveinterfaces: 0x09,
    ledcontrol: 0x0a,
    colordetector: 0x0b,
    datalogger: 0x0c,
    notification: 0x0d,
    music: 0x0e,
    roboticarm: 0x0f,
    homeautomation: 0x10,
    internet: 0x11
};

const dabbleFunctions = {
    connection: 0x01,
    disconnection: 0x02
};

const gamepadFunctions = {
    digital: 0x01,
    analog: 0x02,
    accl: 0x03
};

const gamepadBit1 = {
    start: 0,
    select: 1,
    triangle: 2 ,
    circle: 3,
    cross: 4,
    square: 5
};

const gamepadDigitalBit2 = {
    up: 0,
    down: 1,
    left: 2,
    right: 3
};

//Byte 2 in case of Analog/Accelerometer Mode GamePad
//XXXXXYYY = XXXXX(*15) is angle in radians, YYY is radius

let command;

function resetCommand() {
    command = {
        startedAt: 0,
        bytes: []
    };
}

resetCommand();

function handleChar(char) {
    if (char === 0xff) {
        // start of command
        command = {
            startedAt: Date.now(),
            bytes: [char]
        };
        return;
    }

    if (command.bytes.length >= 8) {
        // data received is not part of a command
        return;
    }

    if (command.startedAt < Date.now() - 1000) {
        // command older than 1s, abort
        console.log('command too old, resetting.'); /*eslint-disable-line no-console*/
        resetCommand();
        return;
    }

    command.bytes.push(char);

    if (command.bytes.length === 8) {
        handleCommand(command);
    }
}

function handleCommand(command) {
    resetCommand();

    console.log('command received', command);
}

Serial1.setup(9600, {
    rx: A10,
    tx: A9
});

Serial1.on('data', function(data) {
    for (let ci = 0; ci < data.length; ci += 1) {
        handleChar(data.charAt(ci));
    }
});

Serial1.print('AT+VERS?');

// -----
// -----
// -----
// -----
// -----

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
        }
    };
}

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

const servo = createServoController(A8, { range: 2, currentPos: 0.5 });
servo.move(0.5, 1000);
servo.move(0, 4000, function() {
    servo.move(1, 3000, function() {
        servo.move(0, 2000, function() {
            servo.move(0.5, 0, function() {
            });
        });
    });
});
