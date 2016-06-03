/*
    jcclient.js  -  Don Cross

    https://github.com/cosinekitty/jcadmin
*/

(function(){
    function ApiGet(path, onSuccess, onFailure) {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function(){
            if (request.readyState === XMLHttpRequest.DONE) {
                if (request.status === 200) {
                    var responseJson = JSON.parse(request.responseText);
                    if (!responseJson.error) {
                        onSuccess && onSuccess(responseJson);
                    } else {
                        console.log('ApiGet returned error object for %s :', path);
                        console.log(responseJson.error);
                        onFailure && onFailure(request);
                    }
                } else {
                    console.log('ApiGet failure for %s :', path);
                    console.log(request);
                    onFailure && onFailure(request);
                }
            }
        };
        request.open('GET', path);
        request.send(null);
    }

    // A list of all mutually-exclusive elements (only one is visible at a time):
    var ModalDivList = ['RecentCallsDiv', 'TargetCallDiv'];

    var PollTimer = null;
    var PrevPoll = {
        'callerid':  {
            'modified': '',
            'data': {
                'calls': [],
                'limit': 0,
                'start': 0,
                'total': 0,
            }
        },

        'whitelist': {
            'modified': '',
            'data': {
                'table': {}
            }
        },

        'blacklist': {
            'modified':'',
            'data':{
                'table': {}
            }
        }
    };

    function SetActiveDiv(activeDivId) {
        ModalDivList.forEach(function(divId){
            var div = document.getElementById(divId);
            if (divId === activeDivId) {
                div.style.display = '';
            } else {
                div.style.display = 'none';
            }
        });
    }

    function EnableDisableControls(enabled) {
        var disabled = !enabled;
        document.getElementById('TargetRadioButtonSafe').disabled = disabled;
        document.getElementById('TargetRadioButtonNeutral').disabled = disabled;
        document.getElementById('TargetRadioButtonBlocked').disabled = disabled;
    }

    function SetTargetCall(call) {
        var safeButton    = document.getElementById('TargetRadioButtonSafe');
        var neutralButton = document.getElementById('TargetRadioButtonNeutral');
        var blockButton   = document.getElementById('TargetRadioButtonBlocked');

        var numberDiv = document.getElementById('TargetNumberDiv');
        numberDiv.textContent = call.number;

        var nameDiv = document.getElementById('TargetNameDiv');
        nameDiv.textContent = call.name;

        var searchButton = document.getElementById('SearchNumberButton');
        searchButton.innerHTML = '<a href="http://www.google.com/search?q=' + call.number + '" target="_blank">Search Google</a>';

        var status = PhoneCallStatus(call);
        numberDiv.className = BlockStatusClassName(status);

        switch (status) {
            case 'B':
                blockButton.checked = true;
                break;

            case 'W':
                safeButton.checked = true;
                break;

            default:
                neutralButton.checked = true;
                break;
        }

        function Classify(status, phonenumber, comment) {
            EnableDisableControls(false);

            var url = '/api/classify/' +
                status + '/' +
                encodeURIComponent(phonenumber) + '/' +
                encodeURIComponent(comment);

            ApiGet(url, function(data) {
                numberDiv.className = BlockStatusClassName(data.status);
                EnableDisableControls(true);
            });
        }

        safeButton.onclick = function() {
            Classify('safe', call.number, call.name);
        }

        neutralButton.onclick = function() {
            Classify('neutral', call.number, call.name);
        }

        blockButton.onclick = function() {
            Classify('blocked', call.number, call.name);
        }

        EnableDisableControls(true);
        SetActiveDiv('TargetCallDiv');
    }

    function CreatePhoneNumberCell(call, status) {
        var numberCell = document.createElement('td');
        if (call.number !== '') {
            numberCell.textContent = call.number;
            numberCell.onclick = function() {
                SetTargetCall(call);
            }
        }
        return numberCell;
    }

    function BlockStatusClassName(status) {
        return {'W':'WhitelistedCall', 'B':'BlockedCall'}[status] || 'NormalCall';
    }

    function ZeroPad(n) {
        var s = '' + n;
        while (s.length < 2) {
            s = '0' + s;
        }
        return s;
    }

    function PhoneListMatch(list, number, name) {
        for (var key in list) {
            if (key.length > 0 && (number.indexOf(key) >= 0 || name.indexOf(key) >= 0)) {
                return true;
            }
        }
        return false;
    }

    function PhoneCallStatus(call) {
        // Emulate jcblock's rules for whitelisting and blacklisting.
        // First look in the whitelist for any pattern match with name or number.
        // If found, it is whitelisted.
        // Otherwise look in blacklist, and if found, it is blacklisted.
        // Otherwise it is neutral.
        if (PhoneListMatch(PrevPoll.whitelist.data.table, call.number, call.name)) {
            return 'W';
        }

        if (PhoneListMatch(PrevPoll.blacklist.data.table, call.number, call.name)) {
            return 'B';
        }

        return '-';
    }

    function FormatDateTime(when, now) {
        // Example: d = '2016-12-31 15:42'
        var format = when;
        var m = when.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})$/);
        if (m) {
            // Remove the year: '12-13 15:42'.
            format = when.substring(5);

            if (now) {
                // Replace 'yyyy-mm-dd' with weekday name if less than 7 calendar days ago: 'Fri 15:42'.
                // Warning: formatting differently depending on the current date and time is
                // "impure" in a functional sense, but I believe it creates a better user experience.
                // The downside is that the display can become stale if there are no phone calls for a long time.
                // Client may wish to refesh the display every hour or two to compensate.

                var year  = parseInt(m[1], 10);
                var month = parseInt(m[2], 10);
                var day   = parseInt(m[3], 10);
                var hour  = parseInt(m[4], 10);
                var min   = parseInt(m[5], 10);

                // Calculate the calendar date (year, month, day) of the date/time given in 'now'.
                // Subtract six *calendar* days from it, not six 24-hour periods!
                // The subtle part is handling daylight savings time, etc.
                // This forms a cutoff date/time at midnight before which 'Sun', 'Mon',
                // etc., become ambiguous.
                var cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()-6);
                var date = new Date(year, month-1, day, hour, min);
                if (date.getTime() >= cutoff.getTime()) {
                    var dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
                    format = dow + when.substring(10);      // 'Fri 15:42'
                }
            }
        }
        return format;
    }

    function PopulateCallHistory() {
        var recent = PrevPoll.callerid.data.calls;
        var table = document.createElement('table');
        table.setAttribute('class', 'RecentCallTable');

        var thead = document.createElement('thead');
        var hrow = document.createElement('tr');

        var hcell_when = document.createElement('th');
        hcell_when.appendChild(document.createTextNode('When'));
        hrow.appendChild(hcell_when);

        var hcell_number = document.createElement('th');
        hcell_number.appendChild(document.createTextNode('Number'));
        hrow.appendChild(hcell_number);

        var hcell_name = document.createElement('th');
        hcell_name.appendChild(document.createTextNode('Name'));
        hrow.appendChild(hcell_name);

        thead.appendChild(hrow);

        var now = new Date();

        var tbody = document.createElement('tbody');
        for (var i=0; i < recent.length; ++i) {
            var row = document.createElement('tr');

            var whenCell = document.createElement('td');
            whenCell.appendChild(document.createTextNode(FormatDateTime(recent[i].when, now)));
            whenCell.className = BlockStatusClassName(recent[i].status);
            row.appendChild(whenCell);

            var originStatus = PhoneCallStatus(recent[i]);

            var numberCell = CreatePhoneNumberCell(recent[i], originStatus);
            row.appendChild(numberCell);

            var nameCell = document.createElement('td');
            nameCell.appendChild(document.createTextNode(recent[i].name));
            row.appendChild(nameCell);

            numberCell.className = nameCell.className = BlockStatusClassName(originStatus);

            tbody.appendChild(row);
        }

        table.appendChild(thead);
        table.appendChild(tbody);

        // Remove existing children from RecentCallsDiv.
        var rcdiv = document.getElementById('RecentCallsDiv');
        while (rcdiv.firstChild) {
            rcdiv.removeChild(rcdiv.firstChild);
        }

        // Fill in newly-generted content for the RecentCallsDiv...
        rcdiv.appendChild(table);
    }

    function UpdateUserInterface() {
        PopulateCallHistory();
    }

    function RefreshCallHistory() {
        ApiGet('/api/calls/0/20', function(calldata){
            PrevPoll.callerid.data = calldata;
            UpdateUserInterface();
        });
    }

    function RefreshPhoneList(filetype) {
        ApiGet('/api/fetch/' + filetype, function(data) {
            PrevPoll[filetype].data = data;
            UpdateUserInterface();
        });
    }

    function PollCallerId() {
        ApiGet('/api/poll', function(poll){
            if (PrevPoll.callerid.modified !== poll.callerid.modified) {
                PrevPoll.callerid.modified = poll.callerid.modified;
                RefreshCallHistory();
            }

            if (PrevPoll.whitelist.modified !== poll.whitelist.modified) {
                PrevPoll.whitelist.modified = poll.whitelist.modified;
                RefreshPhoneList('whitelist');
            }

            if (PrevPoll.blacklist.modified !== poll.blacklist.modified) {
                PrevPoll.blacklist.modified = poll.blacklist.modified;
                RefreshPhoneList('blacklist');
            }
            PollTimer = window.setTimeout(PollCallerId, 2000);
        });
    }

    window.onload = function() {
        document.getElementById('BackToListButton').onclick = function(){
            SetActiveDiv('RecentCallsDiv');
        }
        SetActiveDiv('RecentCallsDiv');
        PollCallerId();
    }
})();
