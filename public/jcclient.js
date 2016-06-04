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
            'modified': '',
            'data':{
                'table': {}
            }
        },

        'database': {
            'modified': ''
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

    function SaveName(call, name) {
        var url = '/api/rename/' + encodeURIComponent(call.number) + '/' + encodeURIComponent(name);
        ApiGet(url, function(data){
            // Update UI here?
        });
    }

    function SetTargetStatus(status) {
        var numberRow = document.getElementById('TargetNumberRow');
        var callerIdRow = document.getElementById('TargetCallerIdRow');
        var targetNameRow = document.getElementById('TargetNameRow');
        var countRow = document.getElementById('TargetCountRow');
        numberRow.className =
            callerIdRow.className =
            targetNameRow.className =
            countRow.className =
            BlockStatusClassName(status);
    }

    function SetTargetCall(call) {
        var backButton    = document.getElementById('BackToListButton');
        var safeButton    = document.getElementById('TargetRadioButtonSafe');
        var neutralButton = document.getElementById('TargetRadioButtonNeutral');
        var blockButton   = document.getElementById('TargetRadioButtonBlocked');
        var numberDiv     = document.getElementById('TargetNumberDiv');
        var nameEditBox   = document.getElementById('TargetNameEditBox');
        var callerIdDiv   = document.getElementById('TargetCallerIdDiv');
        var searchButton  = document.getElementById('SearchNumberButton');
        var countDiv      = document.getElementById('TargetCountDiv');

        function Classify(status, phonenumber) {
            EnableDisableControls(false);

            var url = '/api/classify/' +
                encodeURIComponent(status) + '/' +
                encodeURIComponent(phonenumber);

            ApiGet(url, function(data) {
                SetTargetStatus(data.status);
                EnableDisableControls(true);
            });
        }

        numberDiv.textContent = call.number;
        countDiv.textContent = call.count;

        nameEditBox.value = PhoneCallDisplayName(call);
        nameEditBox.onblur = function() {
            SaveName(call, nameEditBox.value);
        }

        callerIdDiv.textContent = call.callid;

        searchButton.innerHTML = '<a href="http://www.google.com/search?q=' + encodeURIComponent(call.number) + '" target="_blank">Search Google</a>';

        var status = PhoneCallStatus(call);
        SetTargetStatus(status);

        switch (status) {
            case 'blocked':
                blockButton.checked = true;
                break;

            case 'safe':
                safeButton.checked = true;
                break;

            default:
                neutralButton.checked = true;
                break;
        }

        safeButton.onclick = function() {
            Classify('safe', call.number);
        }

        neutralButton.onclick = function() {
            Classify('neutral', call.number);
        }

        blockButton.onclick = function() {
            Classify('blocked', call.number);
        }

        backButton.onclick = function(){
            SetActiveDiv('RecentCallsDiv');
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
        return {'safe':'SafeCall', 'blocked':'BlockedCall'}[status] || 'NeutralCall';
    }

    function ZeroPad(n) {
        var s = '' + n;
        while (s.length < 2) {
            s = '0' + s;
        }
        return s;
    }

    function PhoneListMatch(list, call) {
        for (var key in list) {
            if (key.length > 0 && (call.number.indexOf(key) >= 0 || call.callid.indexOf(key) >= 0)) {
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
        if (PhoneListMatch(PrevPoll.whitelist.data.table, call)) {
            return 'safe';
        }

        if (PhoneListMatch(PrevPoll.blacklist.data.table, call)) {
            return 'blocked';
        }

        return 'neutral';
    }

    function SanitizeSpaces(text) {
        // Replace redundant white space with a single space and trim outside spaces.
        return text ? text.replace(/\s+/g, ' ').trim() : '';
    }

    function PhoneCallDisplayName(call) {
        return SanitizeSpaces(call.name);
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
        for (var call of recent) {
            call.count = PrevPoll.callerid.data.count[call.number] || '?';

            var row = document.createElement('tr');

            var whenCell = document.createElement('td');
            whenCell.appendChild(document.createTextNode(FormatDateTime(call.when, now)));
            whenCell.className = BlockStatusClassName(call.status);
            row.appendChild(whenCell);

            var originStatus = PhoneCallStatus(call);

            var numberCell = CreatePhoneNumberCell(call, originStatus);
            row.appendChild(numberCell);

            var nameCell = document.createElement('td');
            var displayName = PhoneCallDisplayName(call);
            nameCell.appendChild(document.createTextNode(displayName));
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
        ApiGet('/api/calls/0/50', function(calldata){
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
            if (PrevPoll.callerid.modified !== poll.callerid.modified ||
                PrevPoll.database.modified !== poll.database.modified) {
                PrevPoll.callerid.modified = poll.callerid.modified;
                PrevPoll.database.modified = poll.database.modified;
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
        SetActiveDiv('RecentCallsDiv');
        PollCallerId();
    }
})();
