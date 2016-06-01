/*
    jcadmin.js  -  by Don Cross

    https://github.com/cosinekitty/jcadmin
*/
var path = require('path');
var fs = require('fs');
var express = require('express');
var app = express();
var logprefix = require('log-prefix');

function ZeroPad(n, d) {
    var s = '' + n;
    while (s.length < d) {
        s = '0' + s;
    }
    return s;
}

var DaysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

logprefix(function(){
    var now = new Date();
    var text = '[' + now.getFullYear();
    text += '-' + ZeroPad(now.getMonth() + 1, 2);
    text += '-' + ZeroPad(now.getDate(), 2);
    text += ' ' + ZeroPad(now.getHours(), 2);
    text += ':' + ZeroPad(now.getMinutes(), 2);
    text += ':' + ZeroPad(now.getSeconds(), 2);
    text += '.' + ZeroPad(now.getMilliseconds(), 3);
    text += ' ' + DaysOfWeek[now.getDay()];
    text += '] %s';
    return text;
});

// Parse the command line for configuration parameters.
// Usage:  node jcadmin.js port path
var port = 9393;
var jcpath = '.';

if (process.argv.length > 2) {
    port = parseInt(process.argv[2]);
}

if (process.argv.length > 3) {
    jcpath = process.argv[3];
}

var jcLogFile = path.join(jcpath, 'callerID.dat');

// Validate the given path to make sure it contains the callerID.dat file.
try {
    var jcLogStat = fs.statSync(jcLogFile);
    console.log('Caller ID modified %s', JSON.stringify(jcLogStat.mtime));
} catch (e) {
    console.log('FATAL ERROR: file does not exist: %s', jcLogFile);
    console.log('Try adjusting the path passed on the command line.');
    process.exit(1);
}

console.log('Monitoring jcblock path %s', jcpath);


app.use(express.static('public'));

app.get('/', (request, response) => {
    response.sendFile(__dirname + '/index.html');
});

function MakeDateTimeString(date, time) {
    // date = '011916', time = '1623'  ==>  '2016-01-19 16:23'
    var year = (2000 + parseInt(date.substr(4, 2), 10)) + '';
    return year + '-' + date.substr(0, 2) + '-' + date.substr(2, 2) + ' ' + time.substr(0, 2) + ':' + time.substr(2, 2);
}

function FilterNameNumber(text) {
    text = text.trim();
    if (text == "O") {
        return "";
    }
    return text;
}

function ParseCallLine(line) {
    // Examples of caller ID data:
    // B-DATE = 011916--TIME = 1616--NMBR = 8774845967--NAME = TOLL FREE CALLE--
    // --DATE = 011916--TIME = 1623--NMBR = O--NAME = O--
    var m = line.match(/([WB\-])-DATE = (\d{6})--TIME = (\d{4})--NMBR = ([^\-]*)--NAME = ([^\-]*)--/);
    if (m) {
        return {
            'status':   m[1],     // W, B, -; whitelisted, blocked, neither
            'when':     MakeDateTimeString(m[2], m[3]),
            'number':   FilterNameNumber(m[4]),
            'name':     FilterNameNumber(m[5])
        };
    }
    return null;
}

function ParseRecentCalls(text, start, limit) {
    var lines = text.split('\n');
    var calls = [];
    var total = 0;
    for (var i = lines.length - 1; i >= 0; --i) {
        var c = ParseCallLine(lines[i]);
        if (c) {
            if (total >= start && calls.length < limit) {
                calls.push(c);
            }
            ++total;
        }
    }

    return {
        'total': total,
        'start': start,
        'limit': limit,
        'calls': calls
    };
}

function ParseIntParam(text, fallback) {
    var value = parseInt(text);
    if (isNaN(value)) {
        return fallback;
    }
    return value;
}

app.get('/api/poll', (request, response) => {
    // https://nodejs.org/api/fs.html#fs_fs_stat_path_callback
    // https://nodejs.org/api/fs.html#fs_class_fs_stats
    // http://stackoverflow.com/questions/7559555/last-modified-file-date-in-node-js
    fs.stat(jcLogFile, (err, stats) => {
        var reply;
        if (err) {
            reply = {'error': err};
        } else {
            reply = {
                'callerid': {
                    'modified': stats.mtime
                }
            };
        }
        response.type('json');
        response.end(JSON.stringify(reply));
    });
});

app.get('/api/calls/:start/:limit', (request, response) => {
    var start = ParseIntParam(request.params.start, 0);
    var limit = ParseIntParam(request.params.limit, 1000000000);
    fs.readFile(jcLogFile, 'utf8', (err, data) => {
        var replyJson = err ? { 'error' : err } : ParseRecentCalls(data, start, limit);
        response.type('json');
        response.end(JSON.stringify(replyJson));
    });
});

function PhoneListContainsNumber(data, number) {
    var lines = data.split('\n');
    for (var i=0; i < lines.length; ++i) {
        if (!lines[i].startsWith('#')) {
            var limit = lines[i].indexOf('?');
            if (limit < 0) limit = 19;
            var entry = lines[i].substr(0, limit).trim();
            if (number === entry) {
                return true;
            }
        }
    }
    return false;
}

app.get('/api/number/:phonenumber', (request, response) => {
    response.type('json');
    var phonenumber = request.params.phonenumber;
    var whiteListFileName = path.join(jcpath, 'whitelist.dat');
    fs.readFile(whiteListFileName, 'utf8', (werr, wdata) => {
        if (werr) {
            response.end(JSON.stringify({'error' : werr}));
        } else {
            // Search whitelist for phone number.
            // If found, return immediately that the number is whitelisted.
            if (PhoneListContainsNumber(wdata, phonenumber)) {
                response.end(JSON.stringify({'status' : 'W'}));
            } else {
                // Search blacklist for the phone number.
                // If found, the phone number is blocked, otherwise it is neither
                // whitelisted nor blocked.
                var blackListFileName = path.join(jcpath, 'blacklist.dat');
                fs.readFile(blackListFileName, 'utf8', (berr, bdata) => {
                    if (berr) {
                        response.end(JSON.stringify({'error': berr}));
                    } else {
                        var blacklisted = PhoneListContainsNumber(bdata, phonenumber);
                        response.end(JSON.stringify({
                            'status' : blacklisted ? 'B' : '-'
                        }));
                    }
                });
            }
        }
    });
});

function MakePhoneNumberRecord(phonenumber) {
    if (phonenumber.length > 18) {
        phonenumber = phonenumber.substring(0, 18);
    }
    var record = phonenumber + '?';
    while (record.length < 19) {
        record += ' ';
    }
    record += '++++++        Blocked by jcadmin\n';
    return record;
}

app.get('/api/block/:phonenumber', (request, response) => {
    var phonenumber = request.params.phonenumber;
    console.log('Received request to block %s', phonenumber);

    var whiteListFileName = path.join(jcpath, 'whitelist.dat');
    fs.readFile(whiteListFileName, 'utf8', (werr, wdata) => {
        if (werr) {
            response.end(JSON.stringify({'error' : werr}));
        } else {
            // Search whitelist for number. If present, fail the request.
            if (PhoneListContainsNumber(wdata, phonenumber)) {
                response.end(JSON.stringify({'error' : 'Refusing to block phone number because it is whitelisted.'}));
            } else {
                // Search blacklist for number. If absent, add it.
                var blackListFileName = path.join(jcpath, 'blacklist.dat');
                fs.readFile(blackListFileName, 'utf8', (berr, bdata) => {
                    if (berr) {
                        console.log('Blacklist file error');
                        response.end(JSON.stringify({'error': berr}));
                    } else {
                        //console.log('Blacklist file success');
                        if (PhoneListContainsNumber(bdata, phonenumber)) {
                            // Already blacklisted, so immediately succeed.
                            console.log('Already blacklisted');
                            response.end(JSON.stringify({'status' : 'B'}));
                        } else {
                            // Append a new line to the blacklist file.
                            var record = MakePhoneNumberRecord(phonenumber);
                            fs.appendFile(blackListFileName, record, 'utf8', (aerr) => {
                                if (aerr) {
                                    console.log('Error appending to file!');
                                    response.end(JSON.stringify({'error': aerr}));
                                } else {
                                    console.log('Appended record to blacklist');
                                    response.end(JSON.stringify({'status' : 'B'}));
                                }
                            });
                        }
                    }
                });
            }
        }
    });
});

const server = app.listen(port, () => {
    console.log('jcadmin server listening on port %s', port);
});
