/*
    jcclient.js  -  Don Cross

    https://github.com/cosinekitty/jcadmin
*/

(function(){
    function MostRecentCalls(calls, limit) {
        var recent = [];
        for (var i = calls.length - 1; (recent.length < limit) && (i >= 0); --i) {
            recent.push(calls[i]);
        }
        return recent;
    }

    function PopulateCallHistory(recent) {
        var table = document.createElement('table');
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

        var tbody = document.createElement('tbody');
        for (var i=0; i < recent.length; ++i) {
            var row = document.createElement('tr');

            var whenCell = document.createElement('td');
            whenCell.appendChild(document.createTextNode(recent[i].when));
            row.appendChild(whenCell);

            var numberCell = document.createElement('td');
            numberCell.appendChild(document.createTextNode(recent[i].number));
            row.appendChild(numberCell);

            var nameCell = document.createElement('td');
            nameCell.appendChild(document.createTextNode(recent[i].name));
            row.appendChild(nameCell);

            tbody.appendChild(row);
        }

        table.appendChild(thead);
        table.appendChild(tbody);

        // Remove existing children from RecentCallsDiv.
        var rcdiv = document.getElementById('RecentCallsDiv');
        while (rcdiv.firstChild) {
            rcdiv.removeChild(rcdiv.firstChild);
        }

        // Substitute the new table as the child.
        rcdiv.appendChild(table);
    }

    function RequestCallHistory() {
        // https://developer.mozilla.org/en-US/docs/AJAX/Getting_Started
        var request = new XMLHttpRequest();
        request.onreadystatechange = function(){
            if (request.readyState === XMLHttpRequest.DONE) {
                if (request.status === 200) {
                    var calldata = JSON.parse(request.responseText);
                    if (calldata && calldata.calls) {
                        var recent = MostRecentCalls(calldata.calls, 20);
                        PopulateCallHistory(recent);
                    }
                }
            }
        };
        request.open('GET', '/calls');
        request.send(null);
    }

    window.onload = function() {
        RequestCallHistory();
    }
})();
