/*
    jcadmin.js  -  by Don Cross

    https://github.com/cosinekitty/jcadmin
*/
var port = 9393;
var express = require('express');
var app = express();

app.get('/', (request, response) => {
    response.type('html');
    response.send('<h1>Junk Call Blocker</h1>\n');
});

const server = app.listen(port, () => {
    var host = server.address().address;
    var port = server.address().port;
    console.log('jcadmin server listening at http://%s:%s', host, port);
});
