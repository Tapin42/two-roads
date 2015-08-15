var fs   = require('fs');
var http = require('http');
var util = require('util');
var Q    = require('q');


function routeRequest(request, response) {

  if (request.url === '/') {
    return fetchAllParks();
  } else {
    var parts = request.url.split('/');
    if (parts.length === 2) {
      return fetchSinglePark(parts[1]);
    }
  }
}

function fetchAllParks() {
  var D = Q.defer();
  var parksPath = __dirname + '/../parks';

  fs.readdir(parksPath, function (err, files) {
    if (err) {
      D.reject({'error': "I can't seem to see any parks"});
    } else {
      D.resolve({
        "parks": files
      });
    }
  });

  return D.promise;
}

function fetchSinglePark(park) {
  var D = Q.defer();
  var parkPath = __dirname + '/../parks/' + park;

  fs.stat(parkPath, function (err, stats) {
    if (stats && stats.isDirectory()) {
      fs.readFile(parkPath + '/park.json', {
          flag: 'r',
          encoding: 'utf-8'
        }, function (err, data) {
        if (err) {
          D.reject({'error': err});
        } else {
          D.resolve(data);
        }
      });
    } else {
      D.reject({'error': "Sorry, I don't know anything about " + park + " yet."});
    }
  });

  return D.promise;
}


// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function (request, response) {

  function sendResponse(status) {
    return function (respBlock) {
      console.log('Request for ' + request.url + ' returning status ' + status);
      response.writeHead(status, {"Content-Type": "application/json"});

      if (typeof respBlock === 'object') {
        response.end(JSON.stringify(respBlock));
      } else {
        response.end(respBlock);
      }
    };
  }

  routeRequest(request, response).then(sendResponse(200), sendResponse(500));
});

// Change console.log to use timestamps
console.log = util.log;

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:8000/");
