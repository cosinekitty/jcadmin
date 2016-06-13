/*
    jcclient.js  -  Don Cross

    https://github.com/cosinekitty/jcadmin
*/

;(function(){
    function ApiCall(verb, path, onSuccess, onFailure) {
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
                            console.log('ApiCall(%s) returned error object for %s :', verb, path);
                            console.log(responseJson.error);
                            onFailure && onFailure(request);
                        }
                    } else {
                        console.log('ApiCall(%s) failure for %s :', verb, path);
                        console.log(request);
                        onFailure && onFailure(request);
                    }
                }
            }
        };

        request.open(verb, path);
        request.timeout = 1000;
        request.send(null);
    }

    function ApiGet(path, onSuccess, onFailure) {
        ApiCall('GET', path, onSuccess, onFailure);
    }

    function ApiPost(path, onSuccess, onFailure) {
        ApiCall('POST', path, onSuccess, onFailure);
    }

    function ApiDelete(path, onSuccess, onFailure) {
        ApiCall('DELETE', path, onSuccess, onFailure);
    }

    var RecentCallLimit = 200;

    // A list of all mutually-exclusive elements (only one is visible at a time):
    var ModalDivList = ['RecentCallsDiv', 'TargetCallDiv', 'LostContactDiv', 'CreateEditNumberDiv'];
    var ActiveDivStack = [];
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
            loaded: false,      // indicates that this is not real data yet
            modified: '',
            data: {
                calls: [],
                limit: 0,
                start: 0,
                total: 0,
                count: {},
                names: {}
            }
        },

        safe: {
            loaded: false,      // indicates that this is not real data yet
            modified: '',
            data: {
                table: {}
            }
        },

        blocked: {
            loaded: false,      // indicates that this is not real data yet
            modified: '',
            data: {
                table: {}
            }
        },
    };

    function IsAllDataLoaded() {
        return PrevPoll.callerid.loaded && PrevPoll.safe.loaded && PrevPoll.blocked.loaded;
    }

    function ShowActiveDiv(activeDivId) {
        ModalDivList.forEach(function(divId){
            var div = document.getElementById(divId);
            if (divId === activeDivId) {
                div.style.display = '';
            } else {
                div.style.display = 'none';
            }
        });
    }

    function PushActiveDiv(activeDivId) {
        if (ActiveDivStack.length > 0) {
            // Preserve the scroll state of the element we are about to hide.
            var top = ActiveDivStack[ActiveDivStack.length - 1];
            var div = document.getElementById(top.divid);
            top.scroll = window.scrollY;
        }
        ShowActiveDiv(activeDivId);
        ActiveDivStack.push({
            divid: activeDivId,
            scroll: 0       // placeholder for vertical scroll pixels - doesn't matter till we push another div
        });
    }

    function SetActiveDiv(activeDivId) {
        ActiveDivStack = [];
        PushActiveDiv(activeDivId);
    }

    function PopActiveDiv() {
        ActiveDivStack.pop();
        if (ActiveDivStack.length > 0) {
            var top = ActiveDivStack[ActiveDivStack.length - 1];
            var div = document.getElementById(top.divid);
            ShowActiveDiv(top.divid);
            window.scroll(0, top.scroll);
        } else {
            SetActiveDiv('RecentCallsDiv');
        }
    }

    function EnableDisableControls(enabled) {
        var disabled = !enabled;
        document.getElementById('TargetRadioButtonSafe').disabled = disabled;
        document.getElementById('TargetRadioButtonNeutral').disabled = disabled;
        document.getElementById('TargetRadioButtonBlocked').disabled = disabled;
    }

    function SaveName(call, name) {
        var url = '/api/rename/' + encodeURIComponent(call.number) + '/' + encodeURIComponent(name);
        ApiPost(url, function(data){
            // Update UI here?
        });
    }

    function SetTargetStatus(status) {
        var numberRow = document.getElementById('TargetNumberRow');
        var callerIdRow = document.getElementById('TargetCallerIdRow');
        var targetNameRow = document.getElementById('TargetNameRow');
        numberRow.className =
            callerIdRow.className =
            targetNameRow.className =
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

    function CallDateTimeHeader() {
        var row = document.createElement('tr');

        var callnumCell = document.createElement('th');
        callnumCell.className = 'CallCountColumn';
        callnumCell.textContent = '#';
        row.appendChild(callnumCell);

        var dowCell = document.createElement('th');
        dowCell.className = 'HistoryColumn';
        dowCell.textContent = 'DOW';
        row.appendChild(dowCell);

        var timeCell = document.createElement('th');
        timeCell.className = 'HistoryColumn';
        timeCell.textContent = 'Time';
        row.appendChild(timeCell);

        var dateCell = document.createElement('th');
        dateCell.className = 'HistoryColumn';
        dateCell.textContent = 'Date';
        row.appendChild(dateCell);

        return row;
    }

    function CallDateTimeRow(callnum, when) {
        // Create a row with counter, yyyy-mm-dd, day of week, and hh:mm cells.
        var p = ParseDateTime(when);
        var row = document.createElement('tr');

        var callnumCell = document.createElement('td');
        callnumCell.className = 'CallCountColumn';
        callnumCell.textContent = callnum;
        row.appendChild(callnumCell);

        var dowCell = document.createElement('td');
        dowCell.className = 'HistoryColumn';
        dowCell.textContent = p.dow;
        row.appendChild(dowCell);

        var timeCell = document.createElement('td');
        timeCell.className = 'HistoryColumn';
        timeCell.textContent = ZeroPad(p.hour,2) + ':' + ZeroPad(p.min,2);
        row.appendChild(timeCell);

        var dateCell = document.createElement('td');
        dateCell.className = 'HistoryColumn';
        dateCell.textContent = p.year + '-' + ZeroPad(p.month,2) + '-' + ZeroPad(p.day,2);
        row.appendChild(dateCell);

        return row;
    }

    function AppendCallDateTimesTable(hdiv, deleteButton, history) {
        if (history.length > 0) {
            var table = document.createElement('table');
            table.className = 'TargetTable';
            table.appendChild(CallDateTimeHeader());
            for (var i=0; i < history.length; ++i) {
                table.appendChild(CallDateTimeRow(history.length - i, history[i]));
            }
            hdiv.appendChild(table);
        } else {
            hdiv.textContent = 'No calls have been received from this phone number.';
            deleteButton.style.display = '';   // caller has hidden the delete button, but now we know item can be deleted.
        }
    }

    function SetPhoneNumberSearchLink(div, number) {
        var link = document.createElement('a');
        link.setAttribute('href', 'http://www.google.com/search?q=' + encodeURIComponent(number));
        link.setAttribute('target', '_blank');
        link.appendChild(document.createTextNode(number));

        ClearElement(div);
        div.appendChild(link);
    }

    function CallerDisplayName(number) {
        return SanitizeSpaces(PrevPoll.callerid.data.names[number]) ||
               SanitizeSpaces(PrevPoll.safe.data.table[number]) ||
               SanitizeSpaces(PrevPoll.blocked.data.table[number]) ||
               SanitizeSpaces(number);
    }

    function SetTargetCall(call, history) {
        var backButton    = document.getElementById('BackToListButton');
        var safeButton    = document.getElementById('TargetRadioButtonSafe');
        var neutralButton = document.getElementById('TargetRadioButtonNeutral');
        var blockButton   = document.getElementById('TargetRadioButtonBlocked');
        var numberDiv     = document.getElementById('TargetNumberDiv');
        var nameEditBox   = document.getElementById('TargetNameEditBox');
        var callerIdDiv   = document.getElementById('TargetCallerIdDiv');
        var historyDiv    = document.getElementById('TargetHistoryDiv');
        var deleteButton  = document.getElementById('DeleteTargetButton');

        function Classify(status, phonenumber) {
            EnableDisableControls(false);

            var url = '/api/classify/' +
                encodeURIComponent(status) + '/' +
                encodeURIComponent(phonenumber);

            ApiPost(url, function(data) {
                SetTargetStatus(data.status);
                EnableDisableControls(true);
            });
        }

        SetPhoneNumberSearchLink(numberDiv, call.number);

        nameEditBox.value = CallerDisplayName(call.number);
        nameEditBox.onblur = function() {
            SaveName(call, SanitizeSpaces(nameEditBox.value));
        }

        callerIdDiv.textContent = call.callid;

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
        backButton.onclick    = PopActiveDiv;
        EnableDisableControls(true);

        // Some callers pass in a history of date/times when calls have been received.
        // Others pass in null to indicate that we need to fetch that info asyncronously.
        ClearElement(historyDiv);
        deleteButton.style.display = 'none';    // hide delete button until we know whether the entry can be deleted.
        if (history) {
            AppendCallDateTimesTable(historyDiv, deleteButton, history);
        } else {
            ApiGet('/api/caller/' + encodeURIComponent(call.number), function(data){
                AppendCallDateTimesTable(historyDiv, deleteButton, data.history);
            });
        }

        deleteButton.onclick = function() {
            if (window.confirm("Delete entry?")) {
                ApiDelete('/api/caller/' + encodeURIComponent(call.number), function(){
                    PopActiveDiv();
                });
            }
        }

        PushActiveDiv('TargetCallDiv');
    }

    function TryToCreateEditNumber(number) {
        // Check the server for any existing data for this phone number.
        ApiGet('/api/caller/' + encodeURIComponent(number), function(data) {
            SetTargetCall(data.call, data.history);
        });
    }

    function CreateNewCaller() {
        var cancelButton = document.getElementById('CancelCreateEditButton');
        var editButton = document.getElementById('TryCreateEditButton');
        var editBox = document.getElementById('NumberEditBox');

        editButton.style.display = 'none';      // do not show until valid number appears in edit box

        editBox.value = '';     // clear out any previously entered phone number
        editBox.focus();

        cancelButton.onclick = PopActiveDiv;

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

        PushActiveDiv('CreateEditNumberDiv');
    }

    function CreateCallerCell(call, status) {
        var callerCell = document.createElement('td');
        callerCell.setAttribute('colspan', '2');
        if (call.number !== '') {
            callerCell.textContent = CallerDisplayName(call.number);
            callerCell.className = BlockStatusClassName(CallerStatus(call));
            callerCell.onclick = function() {
                SetTargetCall(call, null);
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

    function FormatDateTime(when, now) {
        // Example: d = '2016-12-31 15:42'
        var format = when;
        var p = ParseDateTime(when);
        if (p) {
            // Remove the year: '12-13 15:42'.
            format = when.substring(5);

            if (now) {
                // Replace 'yyyy-mm-dd' with weekday name if less than 7 calendar days ago: 'Fri 15:42'.
                // Warning: formatting differently depending on the current date and time is
                // "impure" in a functional sense, but I believe it creates a better user experience.

                // Calculate the calendar date (year, month, day) of the date/time given in 'now'.
                // Subtract six *calendar* days from it, not six 24-hour periods!
                // The subtle part is handling daylight savings time, etc.
                // This forms a cutoff date/time at midnight before which 'Sun', 'Mon',
                // etc., become ambiguous.
                var cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()-6);
                if (p.date.getTime() >= cutoff.getTime()) {
                    format = p.dow + when.substring(10);      // 'Fri 15:42'
                }
            }
        }
        return format;
    }

    function ParseDateTime(when) {
        var m = when.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})$/);
        if (m) {
            var year  = parseInt(m[1], 10);
            var month = parseInt(m[2], 10);
            var day   = parseInt(m[3], 10);
            var hour  = parseInt(m[4], 10);
            var min   = parseInt(m[5], 10);
            var date = new Date(year, month-1, day, hour, min);
            var dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
            return {
                date: date,
                year: year,
                month: month,
                day: day,
                hour: hour,
                min: min,
                dow: dow
            };
        }
        return null;
    }

    function ClearElement(elem) {
        while (elem.firstChild) {
            elem.removeChild(elem.firstChild);
        }
    }

    function IconCellForStatus(status) {
        var iconCell = document.createElement('td');
        var iconImg = document.createElement('img');
        iconImg.setAttribute('src', status + '.png');
        iconImg.setAttribute('width', '24');
        iconImg.setAttribute('height', '24');
        iconCell.appendChild(iconImg);
        iconCell.className = BlockStatusClassName(status);
        return iconCell;
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
        toggleIconImage.setAttribute('src', DisplayRowsOfType.blocked ? 'all.png' : 'safe.png');
        toggleIconImage.setAttribute('width', '24');
        toggleIconImage.setAttribute('height', '24');
        hcell_icon.appendChild(toggleIconImage);
        hcell_icon.onclick = function() {
            // Toggle display of blocked callers.
            DisplayRowsOfType.blocked = !DisplayRowsOfType.blocked;
            toggleIconImage.setAttribute('src', DisplayRowsOfType.blocked ? 'all.png' : 'safe.png');
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

            var iconCell = IconCellForStatus(call.status);
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
        ClearElement(rcdiv);

        // Fill in newly-generted content for the RecentCallsDiv...
        rcdiv.appendChild(table);
        UpdateRowDisplay(rowlist);
    }

    var PhoneNumbersInOrder = PhoneNumbersInOrder_ByName;

    function PhoneNumbersInOrder_ByName(aEntry, bEntry) {
        var aNameUpper = aEntry.name.toUpperCase();
        var bNameUpper = bEntry.name.toUpperCase();
        if (aNameUpper === bNameUpper) {
            return aEntry.name < bEntry.name;   // break the tie with case-sensitive match
        }
        return aNameUpper < bNameUpper;
    }

    function PhoneBookSortComparer(aEntry, bEntry) {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
        if (PhoneNumbersInOrder(aEntry, bEntry)) {
            return -1;
        }

        if (PhoneNumbersInOrder(bEntry, aEntry)) {
            return 1;
        }

        return 0;
    }

    function SortedPhoneBook() {
        // Calculate the set of all known phone numbers.
        // Phone numbers are known if they have a user-defined name,
        // or they appear in either the safe list or the blocked list.
        var allPhoneNumberSet = {};

        for (var number in PrevPoll.callerid.data.names) {
            if (IsPhoneNumber(number)) {
                allPhoneNumberSet[number] = CallerDisplayName(number);
            }
        }

        for (var number in PrevPoll.safe.data.table) {
            if (IsPhoneNumber(number)) {
                allPhoneNumberSet[number] = CallerDisplayName(number);
            }
        }

        for (var number in PrevPoll.blocked.data.table) {
            if (IsPhoneNumber(number)) {
                allPhoneNumberSet[number] = CallerDisplayName(number);
            }
        }

        // Create an array of {number:number, name:name, count:count} objects to sort.
        var book = [];
        for (var number in allPhoneNumberSet) {
            book.push({
                number: number,
                name:   allPhoneNumberSet[number],
                count:  PrevPoll.callerid.data.count[number] || 0
            });
        }

        // Sort the phone book array using the current sort method:
        book.sort(PhoneBookSortComparer);

        return book;
    }

    function OnPhoneBookRowClicked() {
        var number = this.getAttribute('data-phone-number');
        TryToCreateEditNumber(number);
    }

    function PhoneNumberStatus(number) {        // gives imperfect results when substring patterns in use
        if (number in PrevPoll.safe.data.table) {
            return 'safe';
        }

        if (number in PrevPoll.blocked.data.table) {
            return 'blocked';
        }

        return 'neutral';
    }

    var PhoneBookStatusFilter = ['all', 'safe', 'neutral', 'blocked'];
    var PhoneBookStatusFilterIndex = 0;

    function UpdateFilterIcon(toggleIconImage) {
        toggleIconImage.setAttribute('src', PhoneBookStatusFilter[PhoneBookStatusFilterIndex] + '.png');
    }

    function UpdatePhoneBookRowDisplay(rowlist) {
        var filter = PhoneBookStatusFilter[PhoneBookStatusFilterIndex];
        for (var i=0; i < rowlist.length; ++i) {
            var row = rowlist[i];
            var status = row.getAttribute('data-caller-status');
            row.style.display = ((filter === 'all' || filter === status) ? '' : 'none');
        }
    }

    function PopulatePhoneBook() {
        var rowlist = [];
        var book = SortedPhoneBook();
        var phoneBookDiv = document.getElementById('PhoneBookDiv');
        var table = document.createElement('table');
        ClearElement(phoneBookDiv);
        phoneBookDiv.appendChild(table);

        var hrow = document.createElement('tr');
        table.appendChild(hrow);

        var hStatusCell = document.createElement('th');
        hStatusCell.className = 'IconColumn';
        var toggleIconImage = document.createElement('img');
        UpdateFilterIcon(toggleIconImage);
        toggleIconImage.setAttribute('width', '24');
        toggleIconImage.setAttribute('height', '24');
        hStatusCell.appendChild(toggleIconImage);
        hStatusCell.onclick = function() {
            // Cycle through status filters for displaying different subsets of rows.
            PhoneBookStatusFilterIndex = (1 + PhoneBookStatusFilterIndex) % PhoneBookStatusFilter.length;
            UpdateFilterIcon(toggleIconImage);
            UpdatePhoneBookRowDisplay(rowlist);
        }
        hrow.appendChild(hStatusCell);

        var hCountCell = document.createElement('th');
        hCountCell.className = 'CallCountColumn';
        hCountCell.textContent = 'Calls';
        hrow.appendChild(hCountCell);

        var hNumberCell = document.createElement('th');
        hNumberCell.textContent = 'Number';
        hrow.appendChild(hNumberCell);

        var hNameCell = document.createElement('th');
        hNameCell.className = 'CallerColumn';
        hNameCell.textContent = 'Name';
        hrow.appendChild(hNameCell);

        for (var i=0; i < book.length; ++i) {
            var entry = book[i];

            var row = document.createElement('tr');

            var status = PhoneNumberStatus(entry.number);
            row.setAttribute('data-caller-status', status);
            var statusCell = IconCellForStatus(status);
            row.appendChild(statusCell);

            var countCell = document.createElement('td');
            countCell.textContent = entry.count;
            countCell.className = 'CallCountColumn';
            row.appendChild(countCell);

            var numberCell = document.createElement('td');
            numberCell.textContent = entry.number;
            row.appendChild(numberCell);

            var nameCell = document.createElement('td');
            nameCell.textContent = entry.name;
            row.appendChild(nameCell);

            row.setAttribute('data-phone-number', entry.number);
            row.onclick = OnPhoneBookRowClicked;

            row.className = BlockStatusClassName(status);

            table.appendChild(row);
            rowlist.push(row);
        }

        UpdatePhoneBookRowDisplay(rowlist);
    }

    function UpdateUserInterface() {
        if (IsAllDataLoaded()) {
            PopulateCallHistory();
            PopulatePhoneBook();
        }
    }

    function RefreshCallHistory() {
        ApiGet('/api/calls/0/' + RecentCallLimit, function(calldata){
            PrevPoll.callerid.data = calldata;
            PrevPoll.callerid.loaded = true;
            UpdateUserInterface();
        });
    }

    function RefreshPhoneList(status) {
        ApiGet('/api/fetch/' + status, function(data) {
            PrevPoll[status].data = data;
            PrevPoll[status].loaded = true;
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
