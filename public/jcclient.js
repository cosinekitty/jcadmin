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

    var ModalDivList = ['RecentCallsDiv', 'TargetCallDiv'];

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

    function SetTargetCall(call) {
        var numberDiv = document.getElementById('TargetNumberDiv');
        numberDiv.textContent = call.number;

        var nameDiv = document.getElementById('TargetNameDiv');
        nameDiv.textContent = call.name;

        var searchButton = document.getElementById('SearchNumberButton');
        searchButton.innerHTML = '<a href="http://www.google.com/search?q=' + call.number + '" target="_blank">Search Google</a>';

        var blockButton = document.getElementById('BlockNumberButton');
        blockButton.textContent = '';
        blockButton.onclick = null;
        var uriNumber= encodeURIComponent(call.number);

        ApiGet('/api/number/' + uriNumber, function(data){
            // on success
            numberDiv.className = BlockStatusClassName(data.status);

            if (data.status === 'B') {
                blockButton.textContent = '(Blocked)';
            } else {
                blockButton.textContent = 'Block This Number!';
                blockButton.onclick = function() {
                    ApiGet('/api/block/' + uriNumber, function(blockResult) {
                        blockButton.onclick = null;
                        if (blockResult.status === 'B') {
                            blockButton.textContent = '(Blocked)';
                        } else {
                            blockButton.textContent = '(??? ERROR ???)';
                        }
                        numberDiv.className = BlockStatusClassName(blockResult.status);
                    });
                }
            }
            SetActiveDiv('TargetCallDiv');
        });
    }

    function CreatePhoneNumberCell(call) {
        var numberCell = document.createElement('td');
        if (call.number !== "") {
            numberCell.textContent = call.number;

            // If jcblock had neutral opinion, allow blocking/whitelisting...
            if (call.status === '-') {
                numberCell.onclick = function() {
                    SetTargetCall(call);
                }
            }
        }
        return numberCell;
    }

    function BlockStatusClassName(status) {
        return {'W':'WhitelistedCall', 'B':'BlockedCall'}[status] || 'NormalCall';
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

            row.appendChild(CreatePhoneNumberCell(recent[i]));

            var nameCell = document.createElement('td');
            nameCell.appendChild(document.createTextNode(recent[i].name));
            row.appendChild(nameCell);
            row.className = BlockStatusClassName(recent[i].status);
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

    function RefreshCallHistory() {
        ApiGet('/api/calls/0/20', function(calldata){
            // on success
            PopulateCallHistory(calldata.calls);
            SetActiveDiv('RecentCallsDiv');
        },
        function(request) {
            // on failure
        });
    }

    window.onload = function() {
        document.getElementById('BackToListButton').onclick = RefreshCallHistory;
        RefreshCallHistory();
    }
})();
