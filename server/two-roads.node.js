var fs     = require('fs');
var http   = require('http');
var util   = require('util');
var xml2js = require('xml2js');
var Q      = require('q');

function readdir(path) {
  var D = Q.defer();
  fs.readdir(path, function (err, files) {
    if (err) {
      D.reject({error: 'Error reading directory: ' + err});
    } else {
      D.resolve(files);
    }
  });

  return D.promise;
}

function routeRequest(request, response) {
  var parts = request.url.split('/');

  if (parts.length === 2 && parts[1].length === 0) {
    return fetchAllParks();
  } else if (parts.length > 2) {
    return fetchParkResource(parts[1], parts[2]);
  } else if (parts.length > 1) {
    return fetchSinglePark(parts[1]);
  } else {
    var D = Q.defer();
    D.reject({
      'status': 404,
      'error': "I don't understand the question, and I refuse to answer it."
    });
    return D.promise;
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
        "parks": files.sort()
      });
    }
  });

  return D.promise;
}

function validatePark(park) {
  var D = Q.defer();
  var parkPath = __dirname + '/../parks/' + park;

  fs.stat(parkPath, function (err, stats) {
    if (err) {
      D.reject({
        'status': 404,
        'error': "Sorry, I don't know anything about " + park + " yet.",
        'internal': err
      });
    } else {
      if (stats.isDirectory()) {
        D.resolve(parkPath);
      } else {
        D.reject({
          'status': 404,
          'error': "Sorry, I don't know anything about " + park + " yet.",
          'internal': 'Not a directory'
        });
      }
    }
  });

  return D.promise;
}

function fetchSinglePark(park) {
  var D = Q.defer();

  validatePark(park).then(function (parkPath) {
    fs.readFile(parkPath + '/park.json', {
        flag: 'r',
        encoding: 'utf-8'
      }, function (err, data) {
        if (err) {
          D.reject({'error': err});
        } else {
          try {
            var json = JSON.parse(data);

            json.dir = 'parks/' + park;

            D.resolve(json);
          } catch (e) {
            D.reject({'error': e});
          }
        }
      });
  }, function (err) {
    D.reject(err);
  });

  return D.promise;
}

function fetchParkResource(park, resource) {
  var D = Q.defer();

  var VALID_RESOURCES = {
    segments: function (parkPath) {
      fetchParkSegments(parkPath + '/segments').then(function (details) {
        D.resolve(details);
      }, function (err) {
        D.reject({error: err});
      });
    },
    default: function () {
      D.resolve({error: "You're talking a lot but you're not saying anything."});
    }
  }

  validatePark(park).then(function (parkPath) {
      if (VALID_RESOURCES[resource]) {
        VALID_RESOURCES[resource](parkPath);
      } else {
        VALID_RESOURCES.default();
      }
    }, function (err) {
      D.reject(err);
    });

  return D.promise;
}

function fetchParkSegments(path) {
  // 1) Read the segment directory, count gpx files
  // 2) Read the .details.json file.  If gpx count matches, assume .details.json is accurate
  // 3) If .details.json isn't accurate, recreate it:
  //    3a) Read through each file
  //    3b) Get the name from the gpx file (by opening and reading it)
  //    3c) Write .details.json with the map of filenames to track names
  // 4) Respond to request with json map of (full path to) filename with track name

  var D = Q.defer();

  console.log('Fetching park segments at ' + path);

  readdir(path).then(function (files) {
      var gpxFnames = files.filter(function (f) {
          var ext = f.split('.').pop().toLowerCase();
          return ext === 'gpx';
        });

      var details = [];
      if (files.indexOf('.details.json') !== -1) {
        try {
          details = JSON.parse(fs.readFileSync(path + '/.details.json', { encoding: 'utf8' }));
        } catch (e) {
          console.log('Failed to read .details.json, going to recreate it.');
        }
      }

      if (details.length !== gpxFnames.length) {
        console.log('Mismatch in .details.json vs. filesystem, going to recreate');
        function readName(fname) {
          var DD = Q.defer();

          console.log('Reading file ' + fname);
          fs.readFile(path + '/' + fname, {encoding: 'utf8'}, function (err, xmlData) {
              if (err) {
                DD.reject('Error reading ' + fname + ': ' + err);
              } else {
                console.log('Have the data for ' + fname + ', about to parse');
                var parser = new xml2js.Parser();
                parser.parseString(xmlData, function (err, xml) {
                    if (err) {
                      DD.reject('Error parsing GPX ' + fname + ': ' + err);
                    } else {
                      console.log('Resolving ' + fname + ' with ' + xml.gpx.metadata[0].name[0]);
                      DD.resolve(xml.gpx.metadata[0].name[0]);
                    }
                  });
              }
            });

          return DD.promise;
        }

        details = [];

        gpxFnames.forEach(function (fname) {
            readName(fname).then(function (trkName) {
                details.push(path + '/' + fname);
                if (details.length === gpxFnames.length) {
                  fs.writeFile(path + '/.details.json', JSON.stringify(details, null, 2), {encoding: 'utf8'}, function () {});
                  D.resolve(details);
                } else {
                  console.log('Details is now ' + details.length + ' long.');
                }
              });
          });
      } else {
        D.resolve(details);
      }


    }, function (err) {
      D.reject({error: err});
    });

  return D.promise;
}

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function (request, response) {

  function sendResponse(status) {
    return function (respBlock) {
      if (respBlock.status) {
        status = respBlock.status;
      }
      console.log('Request for ' + request.url + ' returning status ' + status);
      var headers = {
        "Content-Type": "application/json",
      };

      if (request.headers.origin) {
        headers["Access-Control-Allow-Origin"] = request.headers.origin;
      }
      response.writeHead(status, headers);

      if (typeof respBlock === 'object') {
        response.end(JSON.stringify(respBlock, null, 2));
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
