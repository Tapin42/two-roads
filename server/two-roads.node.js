var fs     = require('fs');
var http   = require('http');
var util   = require('util');
var xml2js = require('xml2js');
var Q      = require('q');

// Thank you, Lucille.
var DEFAULT_404 = "I don't understand the question and I refuse to answer it.";

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

function simpleError(status, msg) {
  return {
    headers: {
      status: status || 500
    },
    error: msg
  };
}

function routeRequest(request, response) {
  var simpleUrl = request.url;

  // Trim the slashes off the front and back of the URL, since we don't need 'em.
  while (simpleUrl.indexOf('/') === 0) {
    simpleUrl = simpleUrl.substr(1);
  }
  while ((simpleUrl.lastIndexOf('/') === simpleUrl.length-1) && simpleUrl.length > 0) {
    simpleUrl = simpleUrl.substr(0, simpleUrl.length-1);
  }
  var parts = simpleUrl.split('/');

  if (simpleUrl.length === 0) {
    return fetchAllParks();
  } else if (parts.length > 1) {
    return fetchParkResource(parts[0], parts.slice(1));
  } else if (parts.length > 0) {
    return fetchSinglePark(parts[0]);
  } else {
    var D = Q.defer();
    D.reject(simpleError(404, DEFAULT_404));
    return D.promise;
  }
}

function fetchAllParks() {
  var D = Q.defer();
  var parksPath = __dirname + '/../parks';

  fs.readdir(parksPath, function (err, files) {
    if (err) {
      D.reject(simpleError(500, "I can't seem to find any parks."));
    } else {
      D.resolve({
        parks: files.sort()
      });
    }
  });

  return D.promise;
}

function validatePark(park) {
  var D = Q.defer();
  var parkPath = __dirname + '/../parks/' + park;

  var errResp = simpleError(404, "Sorry, I don't know anything about " + park + " yet.");
  fs.stat(parkPath, function (err, stats) {
    if (err) {
      errResp.internal = err;
      D.reject(errResp);
    } else {
      if (stats.isDirectory()) {
        D.resolve(parkPath);
      } else {
        errResp.internal = 'Not a directory.';
        D.reject(errResp);
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
          D.reject(simpleError(null, err));
        } else {
          try {
            var json = JSON.parse(data);

            json.dir = park;

            D.resolve(json);
          } catch (e) {
            D.reject(simpleError(null, e));
          }
        }
      });
  }, function (err) {
    D.reject(err);
  });

  return D.promise;
}

function fetchParkResource(park, resourceAry) {
  var D = Q.defer();

  var VALID_RESOURCES = {
    segments: function (parkPath) {
      if (resourceAry.length === 1) {
        fetchParkSegments(park, parkPath + '/segments').then(function (details) {
          D.resolve(details);
        }, function (err) {
          D.reject(simpleError(null, err));
        });
      } else if (resourceAry.length === 2) {
        // Request was made for an individual segment, probably
        fs.readFile([parkPath, resourceAry[0], resourceAry[1]].join('/'), function (err, data) {
          if (err) {
            var errResp = simpleError(404, DEFAULT_404);
            errResp.internal = err;
            D.reject(errResp);
            return;
          }

          D.resolve({
            headers: {
              contentType: 'application/gpx+xml'
            },
            body: data
          });
        });
      } else {
        D.reject(simpleError(404, DEFAULT_404));
      }
    },
    overlays: function (parkPath) {
      if (resourceAry.length === 1) {
        fetchParkOverlays(park, parkPath + '/overlays').then(function (details) {
          D.resolve(details);
        }, function (err) {
          D.reject(simpleError(null, err));
        });
      } else {
        fetchSingleOverlay(parkPath, resourceAry[1]).then(function (overlay) {
          D.resolve({
            headers: {
              contentType: 'images/jpeg'
            },
            body: overlay
          });
        }, function (err) {
          D.reject(err);
        });
      }
    },
    default: function () {
      D.resolve(simpleError(404, DEFAULT_404));
    }
  }

  validatePark(park).then(function (parkPath) {
      var subdir = resourceAry[0];
      if (VALID_RESOURCES[subdir]) {
        VALID_RESOURCES[subdir](parkPath);
      } else {
        VALID_RESOURCES.default();
      }
    }, function (err) {
      D.reject(err);
    });

  return D.promise;
}

function fetchParkSegments(park, path) {
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

          // console.log('Reading file ' + fname);
          fs.readFile(path + '/' + fname, {encoding: 'utf8'}, function (err, xmlData) {
              if (err) {
                DD.reject('Error reading ' + fname + ': ' + err);
              } else {
                // console.log('Have the data for ' + fname + ', about to parse');
                var parser = new xml2js.Parser();
                parser.parseString(xmlData, function (err, xml) {
                    if (err) {
                      DD.reject('Error parsing GPX ' + fname + ': ' + err);
                    } else {
                      // console.log('Resolving ' + fname + ' with ' + xml.gpx.metadata[0].name[0]);
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
                details.push(park + '/segments/' + fname);
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
      D.reject(simpleError(null, err));
    });

  return D.promise;
}

function fetchParkOverlays(park, path) {
  var D = Q.defer();

  fs.readFile(path + '/overlays.json', {encoding: 'utf8'}, function (err, data) {
    if (err) {
      D.reject(simpleError(404, "No overlays available.  Hope that Maps has some of the trails, I guess."));
    } else {
      D.resolve(data);
    }
  });

  return D.promise;
}

function fetchSingleOverlay(parkPath, overlayName) {
  var D = Q.defer();
  fs.readFile([parkPath, 'overlays', overlayName].join('/'), function (err, data) {
    if (err) {
      var errResp = simpleError(404, DEFAULT_404);
      errResp.internal = err;
      D.reject(errResp);
      return;
    }

    D.resolve(data);
  });

  return D.promise;
}

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function (request, response) {

  function sendResponse(defaultStatus) {
    return function (respBlock) {
      // The default metadata
      var contentType = 'application/json';
      var status      = defaultStatus;

      // If there's a header block in the response, assume it will overwrite our defaults
      if (respBlock.headers) {
        contentType = respBlock.headers.contentType || contentType;
        status      = respBlock.headers.status || status;

        // ...and there's no reason to keep the headers around
        delete respBlock.headers;
      }

      console.log('Request for ' + request.url + ' returning status ' + status);
      var headers = {
        'Content-Type': contentType
      };

      if (request.headers.origin) {
        headers["Access-Control-Allow-Origin"] = request.headers.origin;
      }
      response.writeHead(status, headers);

      if (respBlock.body) {
        response.end(respBlock.body, 'binary');
      } else if (typeof respBlock === 'object') {
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
