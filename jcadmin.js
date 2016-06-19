/*
    jcadmin.js  -  by Don Cross

    https://github.com/cosinekitty/jcadmin
*/

'use strict';

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

var jcLogFile = ValidateFileExists(path.join(jcpath, 'callerID.dat'));
var whiteListFileName = ValidateFileExists(path.join(jcpath, 'whitelist.dat'));
var blackListFileName = ValidateFileExists(path.join(jcpath, 'blacklist.dat'));

var MaxNameLength = 80;
var database = InitDatabase(path.join(jcpath, 'jcadmin.json'));
console.log('Monitoring jcblock path %s', jcpath);

app.use(express.static('public'));

app.get('/', (request, response) => {
    response.sendFile(path.join(__dirname, 'index.html'));
});

function SafeFileStat(filename) {
    try {
        return fs.statSync(filename);
    } catch (e) {
        return null;
    }
}

function ValidateFileExists(filename) {
    try {
        fs.statSync(filename);
        return filename;
    } catch (e) {
        console.log('FATAL ERROR: file does not exist: %s', filename);
        console.log('Try adjusting the path passed on the command line.');
        process.exit(1);
    }
}

function IsPhoneNumber(pattern) {
    return pattern && pattern.match(/^[0-9]{7,11}$/);
}

function LoadCallerLog(data, filename) {
    for (var line of SplitLines(fs.readFileSync(filename, 'utf8'))) {
        var call = ParseCallLine(line);
        if (call && call.callid && IsPhoneNumber(call.number)) {
            data.callername[call.number] = call.callid;
        }
    }
}

function LoadListFile(data, filename) {
    // This is at startup, and we want to complete before continuing,
    // so we use synchronous I/O.  We *want* to crash and die if there are any errors!
    for (var line of SplitLines(fs.readFileSync(filename, 'utf8'))) {
        var record = ParseRecord(line);
        if (record && record.comment && IsPhoneNumber(record.pattern)) {
            data.callername[record.pattern] = record.comment;
        }
    }
}

function InitDatabase(filename) {
    var data;
    if (SafeFileStat(filename)) {
        data = JSON.parse(fs.readFileSync(filename, 'utf8'));
        console.log('Loaded database from file: %s', filename);
    } else {
        // Order is important: the last entry we see overrides any previous entry.
        // So process caller ID first, blacklist second, whitelist last.
        // We want the whitelist entry to trump the blacklist entry if both are present
        // for the same phone number.  That should never happen, but we can't prevent it.
        data = { callername: {} };
        LoadCallerLog(data, jcLogFile);
        LoadListFile(data, blackListFileName);
        LoadListFile(data, whiteListFileName);
        fs.writeFileSync(filename, JSON.stringify(data), 'utf8');
        console.log('Created database file: %s', filename);
    }

    return {
        filename: filename,
        data: data
    };
}

function GetName(number) {
    return database.data.callername[number] || '';
}

function SetName(number, name) {
    if (!IsPhoneNumber(number)) {
        throw `Not a valid phone number: "${number}"`;
    }

    if (name) {
        // Non-blank name, so store in database.
        database.data.callername[number] = name;
    } else {
        // Blank name, so delete callername entry from database (saves space).
        delete database.data.callername[number];
    }
}

function MakeDateTimeString(date, time) {
    // date = '011916', time = '1623'  ==>  '2016-01-19 16:23'
    var year = (2000 + parseInt(date.substr(4, 2), 10)) + '';
    return year + '-' + date.substr(0, 2) + '-' + date.substr(2, 2) + ' ' + time.substr(0, 2) + ':' + time.substr(2, 2);
}

function FilterNameNumber(text) {
    text = text.trim();
    if (text == 'O') {
        return '';
    }
    return text;
}

function ParseCallLine(line) {
    // Examples of caller ID data:
    // B-DATE = 011916--TIME = 1616--NMBR = 8774845967--NAME = TOLL FREE CALLE--
    // --DATE = 011916--TIME = 1623--NMBR = O--NAME = O--
    var m = line.match(/^([WB\-])-DATE = (\d{6})--TIME = (\d{4})--NMBR = ([^\-]*)--NAME = ([^\-]*)--$/);
    if (m) {
        return {
            status:   {W:'safe', B:'blocked'}[m[1]] || 'neutral',
            when:     MakeDateTimeString(m[2], m[3]),
            number:   FilterNameNumber(m[4]),
            callid:   FilterNameNumber(m[5])
        };
    }
    return null;
}

function SplitLines(text) {
    var lines = text.split('\n');

    // This usually leaves us with a false blank line at the end. (After the last '\n'.)
    // Delete that fake line if present.
    if (lines.length > 0) {
        if (lines[lines.length - 1] === '') {
            --lines.length;
        }
    }

    return lines;
}

function ParseRecentCalls(text, start, limit) {
    var calls = [];
    var total = 0;
    var count = {};
    var names = {};     // user name for each phone number, with most recent caller ID as fallback
    var callid = {};    // most recent call ID associated with each phone number
    for (var line of SplitLines(text).reverse()) {
        var c = ParseCallLine(line);
        if (c) {
            if (IsPhoneNumber(c.number)) {
                count[c.number] = (count[c.number] || 0) + 1;
                if (!names[c.number]) {
                    names[c.number] = GetName(c.number) || c.callid || '';
                }
                if (c.callid && !callid[c.number]) {
                    callid[c.number] = c.callid || '';
                }
            }
            if (total >= start && calls.length < limit) {
                calls.push(c);
            }
            ++total;
        }
    }

    return {
        total: total,
        start: start,
        limit: limit,
        calls: calls,
        count: count,
        names: names,
        callid: callid,
    };
}

function ParseIntParam(text, fallback) {
    var value = parseInt(text);
    if (isNaN(value)) {
        return fallback;
    }
    return value;
}

function FailResponse(response, error, template) {
    template = template || {};
    template.error = error;
    console.log('FailResponse: %s', template);
    response.json(template);
}

app.get('/api/poll', (request, response) => {
    // https://nodejs.org/api/fs.html#fs_fs_stat_path_callback
    // https://nodejs.org/api/fs.html#fs_class_fs_stats
    // http://stackoverflow.com/questions/7559555/last-modified-file-date-in-node-js

    var reply = {};

    // Start multiple async requests. The the first one to encounter an error
    // or the last one to succeed ends the response for us.

    function LaterStat(a, b) {
        return (a.modified > b.modified) ? a : b;
    }

    function StatCallback(err, stats, reply, field) {
        if (err) {
            FailResponse(response, err, {field:field});
        } else {
            if (!reply.error) {
                reply[field] = {modified : stats.mtime};
                if (reply.callerid && reply.safe && reply.blocked && reply.database) {
                    // The database (jcadmin.json) and the callerID.dat are conceptually
                    // a single model from the client's point of view: together they provide
                    // a list of all the phone calls along with user-defined names for each call.
                    // So for the purposes of polling, we pick the most recent modification
                    // of (callerid, database) modified date and report it as callerid modified date.
                    // In simpler terms, when either changes, the client wants to reload
                    // /api/calls to get latest calls and names.

                    response.json({
                        callerid: LaterStat(reply.callerid, reply.database),
                        safe: reply.safe,
                        blocked: reply.blocked
                    });
                }
            }
        }
    }

    fs.stat(jcLogFile,         (err, stats) => StatCallback(err, stats, reply, 'callerid' ));
    fs.stat(whiteListFileName, (err, stats) => StatCallback(err, stats, reply, 'safe'));
    fs.stat(blackListFileName, (err, stats) => StatCallback(err, stats, reply, 'blocked'));
    fs.stat(database.filename, (err, stats) => StatCallback(err, stats, reply, 'database'));
});

app.get('/api/calls/:start/:limit', (request, response) => {
    var start = ParseIntParam(request.params.start, 0);
    var limit = ParseIntParam(request.params.limit, 1000000000);
    fs.readFile(jcLogFile, 'utf8', (err, data) => {
        if (err) {
            FailResponse(response, err);
        } else {
            response.json(ParseRecentCalls(data, start, limit));
        }
    });
});

app.delete('/api/caller/:phonenumber', (request, response) => {
    // Validate that the parameter looks like a valid phone number.
    if (!IsPhoneNumber(request.params.phonenumber)) {
        FailResponse(response, 'Not a valid phone number.');
        return;
    }

    fs.readFile(jcLogFile, 'utf8', (err, data) => {
        if (err) {
            FailResponse(response, err);
        } else {
            // Prevent deletion of any phone number that exists in the caller history.
            var recent = ParseRecentCalls(data, 0, 1000000000);
            for (var i=0; i < recent.calls.length; ++i) {
                var call = recent.calls[i];
                if (call.number === request.params.phonenumber) {
                    FailResponse(response, 'Cannot delete phone number because it exists in the call history.');
                    return;
                }
            }

            // Deletion is a 3-step process, each of which is performed ascynchronously:
            // 1. Remove any entry from the safe list.
            // 2. Remove any entry from the blocked list.
            // 3. Remove any name entry from the database and save the database to disk.

            SetName(request.params.phonenumber, null);     // delete name entry if any exists
            RemovePhoneNumberFromFile(whiteListFileName, request.params.phonenumber, response, function(){
                RemovePhoneNumberFromFile(blackListFileName, request.params.phonenumber, response, function(){
                    fs.writeFile(database.filename, JSON.stringify(database.data), 'utf8', (err) => {
                        if (err) {
                            FailResponse(response, err);
                        } else {
                            console.log(`Deleted phone number ${request.params.phonenumber}`);
                            response.json({deleted: true});
                        }
                    });
                });
            });
        }
    });
});

app.get('/api/caller/:phonenumber', (request, response) => {
    if (!IsPhoneNumber(request.params.phonenumber)) {
        FailResponse(response, 'Not a valid phone number.');
        return;
    }

    // Search for any information we know about this phone number.
    // Process the entire caller ID log and see if the number is there.
    fs.readFile(jcLogFile, 'utf8', (err, data) => {
        if (err) {
            FailResponse(response, err);
        } else {
            var recent = ParseRecentCalls(data, 0, 1000000000);
            var callTimesList = [];
            var mostRecentCall;
            for (var i=0; i < recent.calls.length; ++i) {
                var call = recent.calls[i];
                if (call.number === request.params.phonenumber) {
                    if (!mostRecentCall) {
                        mostRecentCall = call;
                    }
                    callTimesList.push(call.when);
                }
            }

            if (!mostRecentCall) {
                // Create the data stucture for an unreceived caller.
                // This happens when a phone number has been manually entered
                // and that number has never yet actually called.
                mostRecentCall = {
                    status:   'neutral',
                    when:     '',   // never called
                    number:   request.params.phonenumber,
                    callid:   '',   // never called
                    name:     GetName(request.params.phonenumber)
                };
            }

            response.json({
                call: mostRecentCall,
                history: callTimesList
            });
        }
    });
});

app.get('/api/fetch/:filetype', (request, response) => {
    var filename;
    switch (request.params.filetype) {
        case 'safe':     filename = whiteListFileName;  break;
        case 'blocked':  filename = blackListFileName;  break;
        default:
            FailResponse(response, 'Invalid filetype ' + request.params.filetype);
            return;
    }

    fs.readFile(filename, 'utf8', (err, data) => {
        if (err) {
            FailResponse(response, err);
        } else {
            var reply = {table: {}};
            for (var line of SplitLines(data)) {
                var record = ParseRecord(line);
                if (record) {
                    reply.table[record.pattern] = record.comment;
                }
            }
            response.json(reply);
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
    record += `++++++        ${GetName(phonenumber)}\n`;
    return record;
}

function ParseRecord(line) {
    if (!line.startsWith('#') && (line.length >= 25)) {
        var limit = line.indexOf('?');
        if (limit < 0) limit = 19;
        return {
            pattern: line.substr(0, limit).trim(),
            comment: line.substr(25).trim()
        };
    }
    return null;
}

function RemovePhoneNumberFromFile(filename, phonenumber, response, callback) {
    fs.readFile(filename, 'utf8', (err,data) => {
        if (err) {
            FailResponse(response, err);
        } else {
            var lines = SplitLines(data);
            var updated = '';
            var numChanges = 0;
            for (var line of lines) {
                var record = ParseRecord(line);
                if (record && record.pattern===phonenumber) {
                    ++numChanges;
                } else {
                    updated += line + '\n';
                }
            }

            if (numChanges > 0) {
                // Write 'updated' back to the file.
                fs.writeFile(filename, updated, 'utf8', (err) => {
                    if (err) {
                        FailResponse(response, err);
                    } else {
                        callback();
                    }
                });
            } else {
                callback();
            }
        }
    });
}

function AddPhoneNumberToFile(filename, phonenumber, response, callback) {
    fs.readFile(filename, 'utf8', (err,data) => {
        if (err) {
            console.log('Error reading from file %s: %s', filename, err);
            FailResponse(response, err);
        } else {
            var lines = SplitLines(data);
            for (var line of lines) {
                var record = ParseRecord(line);
                if (record && record.pattern===phonenumber) {
                    callback();
                    return;
                }
            }

            // Append new record to file.
            // Append a new line to the blacklist file.
            var record = MakePhoneNumberRecord(phonenumber);
            fs.appendFile(filename, record, 'utf8', (aerr) => {
                if (aerr) {
                    console.log('Error appending to file %s: %s', filename, aerr);
                    FailResponse(response, aerr);
                } else {
                    callback();
                }
            });
        }
    });
}

app.post('/api/rename/:phonenumber/:name?', (request, response) => {
    var number = request.params.phonenumber;
    if (!IsPhoneNumber(number)) {
        FailResponse(response, 'Invalid phone number');
    } else {
        var success = {status: 'OK'};     // idempotence: same reply whether state changed or not
        var oldname = GetName(number);
        var newname = (request.params.name || '').trim();
        if (newname === oldname) {
            // Avoid unnecessary file I/O: nothing has changed, so no need to save.
            response.json(success);
        } else if (newname.length > MaxNameLength) {
            FailResponse(response, `Name length must not exceed ${MaxNameLength} characters.`);
        } else {
            SetName(number, newname);
            fs.writeFile(database.filename, JSON.stringify(database.data), 'utf8', (err) => {
                if (err) {
                    FailResponse(response, err);
                } else {
                    console.log(`Renamed ${number} from "${oldname}" to "${newname}"`);
                    response.json(success);
                }
            });
        }
    }
});

app.post('/api/classify/:status/:phonenumber', (request, response) => {
    var status = request.params.status;
    var phonenumber = request.params.phonenumber;
    console.log('Classify status=%s, phonenumber=%s', status, phonenumber);

    // For now, only allow exact phone number patterns.
    // This is to prevent damage to whitelist and blacklist files.
    if (!IsPhoneNumber(phonenumber)) {
        console.log('Illegal phone number pattern! Failing!');
        FailResponse(response, 'Invalid phone number');
        return;
    }

    switch (status) {
        case 'blocked':
            RemovePhoneNumberFromFile(whiteListFileName, phonenumber, response, function(){
                AddPhoneNumberToFile(blackListFileName, phonenumber, response, function(){
                    response.json({status: status});
                });
            });
            break;

        case 'neutral':
            RemovePhoneNumberFromFile(whiteListFileName, phonenumber, response, function(){
                RemovePhoneNumberFromFile(blackListFileName, phonenumber, response, function(){
                    response.json({status: status});
                });
            });
            break;

        case 'safe':
            RemovePhoneNumberFromFile(blackListFileName, phonenumber, response, function(){
                AddPhoneNumberToFile(whiteListFileName, phonenumber, response, function(){
                    response.json({status: status});
                });
            });
            break;

        default:
            console.log('Unknown status! Failing!');
            FailResponse(response, 'Invalid status');
            return;
    }
});

const server = app.listen(port, () => {
    console.log('jcadmin server listening on port %s', port);
});
