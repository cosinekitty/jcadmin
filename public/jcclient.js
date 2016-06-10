/*
    jcclient.js  -  Don Cross

    https://github.com/cosinekitty/jcadmin
*/

(function(){
    function ApiGet(path, onSuccess, onFailure) {
        var handled = false;
        var request = new XMLHttpRequest();
        request.onreadystatechange = function(){
            if (!handled) {
                if (request.readyState === XMLHttpRequest.DONE) {
                    handled = true;
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
            }
        };

        request.open('GET', path);
        request.timeout = 1000;
        request.send(null);
    }

    // A list of all mutually-exclusive elements (only one is visible at a time):
    var ModalDivList = ['RecentCallsDiv', 'TargetCallDiv', 'LostContactDiv', 'CreateEditNumberDiv'];
    var LostContactCount = 0;

    // For toggling display of various types of call history rows.
    var DisplayRowsOfType = {
        neutral: true,
        blocked: true,
        safe: true
    };

    function UpdateRowDisplay(callHistoryRows) {   // call to reflect current DisplayRowsOfType settings
        for (var i=0; i < callHistoryRows.length; ++i) {
            var row = callHistoryRows[i];
            var status = row.getAttribute('data-caller-status');
            row.style.display = DisplayRowsOfType[status] ? '' : 'none';
        }
    }

    var PollTimer = null;
    var PrevPoll = {
        callerid:  {
            modified: '',
            data: {
                calls: [],
                limit: 0,
                start: 0,
                total: 0,
            }
        },

        safe: {
            modified: '',
            data: {
                table: {}
            }
        },

        blocked: {
            modified: '',
            data: {
                table: {}
            }
        },
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

    function IsPhoneNumber(pattern) {
        return pattern && pattern.match(/^[0-9]{7,11}$/);
    }

    function SanitizePhoneNumber(pattern) {
        if (pattern) {
            var cleaned = pattern.replace(/[^0-9]/g, '');
            if (IsPhoneNumber(cleaned)) {
                return cleaned;
            }
        }
        return null;
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

        nameEditBox.value = SanitizeSpaces(call.name);
        nameEditBox.onblur = function() {
            SaveName(call, SanitizeSpaces(nameEditBox.value));
        }

        callerIdDiv.textContent = call.callid;

        searchButton.innerHTML = '<a href="http://www.google.com/search?q=' + encodeURIComponent(call.number) + '" target="_blank">Search Google</a>';

        var status = CallerStatus(call);
        SetTargetStatus(status);

        switch (status) {
            case 'blocked': blockButton.checked = true;     break;
            case 'safe':    safeButton.checked = true;      break;
            default:        neutralButton.checked = true;   break;
        }

        safeButton.onclick    = function() { Classify('safe',    call.number); }
        neutralButton.onclick = function() { Classify('neutral', call.number); }
        blockButton.onclick   = function() { Classify('blocked', call.number); }
        backButton.onclick    = function() { SetActiveDiv('RecentCallsDiv'); }
        EnableDisableControls(true);
        SetActiveDiv('TargetCallDiv');
    }

    function CreateNewCaller() {
        var cancelButton = document.getElementById('CancelCreateEditButton');
        var editButton = document.getElementById('TryCreateEditButton');
        var editBox = document.getElementById('NumberEditBox');

        editButton.style.display = 'none';      // do not show until valid number appears in edit box

        editBox.value = '';     // clear out any previously entered phone number
        editBox.focus();

        cancelButton.onclick = function() { SetActiveDiv('RecentCallsDiv'); }

        function TryToCreateEditNumber(number) {
            // Check the server for any existing data for this phone number.
            ApiGet('/api/caller/' + encodeURIComponent(number), function(data) {
                SetTargetCall(data.call);
            });
        }

        editButton.onclick = function(evt) {
            var number = SanitizePhoneNumber(editBox.value);
            if (number !== null) {
                TryToCreateEditNumber(number);
            } else {
                // Should never get here!!!
                console.log('How did the edit button get clicked with an invalid number?');
            }
        }

        editBox.onkeyup = function(evt) {
            var number = SanitizePhoneNumber(editBox.value);
            var key = evt.keyCode;
            if (number !== null) {
                // Show the edit button.
                editButton.style.display = '';

                // If user just pressed ENTER, act as if edit button was pressed: go to target page.
                if (key === 13) {
                    TryToCreateEditNumber(number);
                }
            } else {
                // Hide the edit button.
                // If user just pressed ENTER, ignore it!
                editButton.style.display = 'none';
            }
        }

        SetActiveDiv('CreateEditNumberDiv');
    }

    function CreateCallerCell(call, status) {
        var callerCell = document.createElement('td');
        callerCell.setAttribute('colspan', '2');
        if (call.number !== '') {
            callerCell.textContent = SanitizeSpaces(call.name) || SanitizeSpaces(call.callid) || SanitizeSpaces(call.number);
            callerCell.className = BlockStatusClassName(CallerStatus(call));
            callerCell.onclick = function() {
                SetTargetCall(call);
            }
        }
        return callerCell;
    }

    function BlockStatusClassName(status) {
        return {safe:'SafeCall', blocked:'BlockedCall'}[status] || 'NeutralCall';
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

    function CallerStatus(call) {
        // Emulate jcblock's rules for whitelisting and blacklisting.
        // First look in the whitelist for any pattern match with name or number.
        // If found, it is whitelisted.
        // Otherwise look in blacklist, and if found, it is blacklisted.
        // Otherwise it is neutral.
        if (PhoneListMatch(PrevPoll.safe.data.table, call)) {
            return 'safe';
        }

        if (PhoneListMatch(PrevPoll.blocked.data.table, call)) {
            return 'blocked';
        }

        return 'neutral';
    }

    function SanitizeSpaces(text) {
        // Replace redundant white space with a single space and trim outside spaces.
        return text ? text.replace(/\s+/g, ' ').trim() : '';
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
        var rowlist = [];
        var recent = PrevPoll.callerid.data.calls;
        var table = document.createElement('table');
        table.setAttribute('class', 'RecentCallTable');

        var thead = document.createElement('thead');
        var hrow = document.createElement('tr');

        var hcell_icon = document.createElement('th');
        hcell_icon.className = 'IconColumn';
        var toggleIconImage = document.createElement('img');
        toggleIconImage.setAttribute('src', DisplayRowsOfType.blocked ? 'phone.png' : 'safe.png');
        toggleIconImage.setAttribute('width', '24');
        toggleIconImage.setAttribute('height', '24');
        hcell_icon.appendChild(toggleIconImage);
        hcell_icon.onclick = function() {
            // Toggle display of blocked callers.
            DisplayRowsOfType.blocked = !DisplayRowsOfType.blocked;
            toggleIconImage.setAttribute('src', DisplayRowsOfType.blocked ? 'phone.png' : 'safe.png');
            UpdateRowDisplay(rowlist);
        }
        hrow.appendChild(hcell_icon);

        var hcell_when = document.createElement('th');
        hcell_when.appendChild(document.createTextNode('When'));
        hrow.appendChild(hcell_when);

        var hcell_name = document.createElement('th');
        hcell_name.appendChild(document.createTextNode('Caller'));
        hcell_name.className = 'CallerColumn';
        hrow.appendChild(hcell_name);

        var hcell_new = document.createElement('th');
        hcell_new.className = 'IconColumn';
        var newIcon = document.createElement('img');
        newIcon.setAttribute('src', 'new.png');
        newIcon.setAttribute('width', '24');
        newIcon.setAttribute('height', '24');
        hcell_new.appendChild(newIcon);
        hcell_new.onclick = CreateNewCaller;
        hrow.appendChild(hcell_new);

        thead.appendChild(hrow);

        var now = new Date();

        var tbody = document.createElement('tbody');
        for (var i=0; i < recent.length; ++i) {
            var call = recent[i];
            call.count = PrevPoll.callerid.data.count[call.number] || '?';
            var callStatusClassName = BlockStatusClassName(call.status);

            var row = document.createElement('tr');
            row.setAttribute('data-caller-status', CallerStatus(call));

            var iconCell = document.createElement('td');
            if (call.status === 'blocked' || call.status === 'safe') {
                var iconImg = document.createElement('img');
                iconImg.setAttribute('src', call.status + '.png');
                iconImg.setAttribute('width', '24');
                iconImg.setAttribute('height', '24');
                iconCell.appendChild(iconImg);
            }
            iconCell.className = callStatusClassName;
            row.appendChild(iconCell);

            var whenCell = document.createElement('td');
            whenCell.appendChild(document.createTextNode(FormatDateTime(call.when, now)));
            whenCell.className = callStatusClassName + ' WhenCell';
            row.appendChild(whenCell);

            row.appendChild(CreateCallerCell(call));

            tbody.appendChild(row);
            rowlist.push(row);
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
        UpdateRowDisplay(rowlist);
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
            // On success.

            if (LostContactCount > 0) {
                LostContactCount = 0;
                SetActiveDiv('RecentCallsDiv');
            }

            // check last-modified time stamps to see if we need to re-fetch the model.
            if (PrevPoll.callerid.modified !== poll.callerid.modified) {
                PrevPoll.callerid.modified = poll.callerid.modified;
                RefreshCallHistory();
            }

            if (PrevPoll.safe.modified !== poll.safe.modified) {
                PrevPoll.safe.modified = poll.safe.modified;
                RefreshPhoneList('safe');
            }

            if (PrevPoll.blocked.modified !== poll.blocked.modified) {
                PrevPoll.blocked.modified = poll.blocked.modified;
                RefreshPhoneList('blocked');
            }

            PollTimer = window.setTimeout(PollCallerId, 2000);
        },
        function(request) {
            // On failure, go into Lost Contact mode but keep polling for reconnect.
            ++LostContactCount;
            document.getElementById('RetryCountSpan').textContent = LostContactCount;
            if (LostContactCount == 1) {
                SetActiveDiv('LostContactDiv');
            }
            PollTimer = window.setTimeout(PollCallerId, 2000);
        });
    }

    window.onload = function() {
        SetActiveDiv('RecentCallsDiv');
        PollCallerId();
    }
})();
