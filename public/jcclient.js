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

    function CreatePhoneNumberCell(phonenumber) {
        var numberCell = document.createElement('td');
        if (true) {
            numberCell.appendChild(document.createTextNode(phonenumber));
        } else {
            if (phonenumber !== "") {
                var link = document.createElement('a');
                link.setAttribute('href', '/phonenumber/' + encodeURIComponent(phonenumber));
                link.appendChild(document.createTextNode(phonenumber));
                numberCell.appendChild(link);
            }
        }
        return numberCell;
    }

    function PopulateCallHistory(recent) {
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

        var tbody = document.createElement('tbody');
        for (var i=0; i < recent.length; ++i) {
            var row = document.createElement('tr');

            var whenCell = document.createElement('td');
            whenCell.appendChild(document.createTextNode(recent[i].when));
            row.appendChild(whenCell);

            row.appendChild(CreatePhoneNumberCell(recent[i].number));

            var nameCell = document.createElement('td');
            nameCell.appendChild(document.createTextNode(recent[i].name));
            row.appendChild(nameCell);

            // Set css class to indicate whether call was blocked, etc.
            switch (recent[i].status) {
                case 'B':
                    row.setAttribute('class', 'BlockedCall');
                    break;

                case 'W':
                    row.setAttribute('class', 'WhitelistedCall');
                    break;

                default:
                    row.setAttribute('class', 'NormalCall');
                    break;
            }

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

    function ApiGet(path, onSuccess, onFailure) {
        // https://developer.mozilla.org/en-US/docs/AJAX/Getting_Started
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

    function RequestCallHistory() {
        ApiGet('/api/calls/0/20', function(calldata){
            // on success
            PopulateCallHistory(calldata.calls);
        },
        function(request) {
            // on failure
        });
    }

    window.onload = function() {
        RequestCallHistory();
    }
})();
