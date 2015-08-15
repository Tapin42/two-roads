var fs     = require('fs');
var xml2js = require('xml2js');

function oxfordJoin(ary, sep, finalSep) {
  if (ary.length < 2) {
    return ary[0];
  } else {
    var cpy = ary.slice();
    var lastElt = cpy.pop();
    return cpy.join(sep) + ' ' + finalSep + ' ' + lastElt;
  }
}

function processData(err, data) {
  var gpxData = [];

  if (err) {
    console.log('Error parsing string: ' + err);
    return;
  }

  console.log('Ways: ' + data.osm.way.length);

  var nodes = parseNodes(data.osm.node);
  console.log('# of nodes: ' + Object.keys(nodes).length);

  var ways = parseWays(data.osm.way, nodes);
  console.log('# of trails: ' + Object.keys(ways).length);

  var routesByNode = {};
  var routeEnds = {};
  Object.keys(ways).forEach(function (wayId) {
    var way = ways[wayId];

    console.log(way.name);

    way.nodes.forEach(function (node) {
        if (node.missing) {
          console.log('Missing! ' + node.id);
        } else {
          if (routesByNode[node.id]) {
            routesByNode[node.id].push(wayId);
          } else {
            routesByNode[node.id] = [wayId];
          }
        }
      });

    function processEnd(node) {
      if (!node.missing) {
        if (routeEnds[node.id]) {
          routeEnds[node.id].push(wayId);
        } else {
          routeEnds[node.id] = [wayId];
        }
      }
    }

    processEnd(way.nodes[0]);
    processEnd(way.nodes[way.nodes.length-1]);
  });

  Object.keys(routesByNode).forEach(function (node) {
      if (routesByNode[node].length > 1) {
        var names = routesByNode[node].map(function (wayId) {
          return ways[wayId].name;
        });
        console.log('Found intersection of ' + oxfordJoin(names, ', ', 'and') + ' at node ' + node + ' (' + nodes[node].lat + ', ' + nodes[node].lon + ')');
        gpxData.push({
          name: oxfordJoin(names, ', ', 'and'),
          lat: nodes[node].lat,
          lon: nodes[node].lon
        });
      }
    });

  Object.keys(routeEnds).forEach(function (node) {
      if (routeEnds[node].length === 1 && routesByNode[node].length === 1) {
        console.log('Found dead-end of ' + ways[routeEnds[node][0]].name + ' at node ' + node + ' (' + nodes[node].lat + ', ' + nodes[node].lon + ')');
        gpxData.push({
          name: 'End of ' + ways[routeEnds[node][0]].name,
          lat: nodes[node].lat,
          lon: nodes[node].lon
        });
      }
    });

  writeGpx('./henry_coe_intersections.gpx', gpxData);
}

function parseNodes(nodeDict) {
  var rv = {};

  nodeDict.forEach(function (node) {
      rv[node.$.id] = {
        id: node.$.id,
        lat: node.$.lat,
        lon: node.$.lon
      }
    });

  return rv;
}

function parseWays(wayDict, nodes) {
  var rv = {};

  function findTag(way, tagKey) {
    if (way.tag) {
      var possible = way.tag.filter(function (tag) {
          return tag.$.k === tagKey;
        });
      if (possible.length === 0) {
        return null;
      }
      if (possible.length > 1) {
        console.log('Found multiple names.  This is... interesting.');
        var i = 0;
        possible.forEach(function (tag) {
          console.log(i++ + ': ' + tag.$.n);
        })
      }

      return possible[0].$.v;
    }
  }

  wayDict.forEach(function (way) {

    var wayType = findTag(way, 'highway');
    var VALID_HIGHWAYS = ['track', 'path', 'footway', 'bridleway', 'steps'];
    if (VALID_HIGHWAYS.indexOf(wayType) > -1) {
      var wayName = findTag(way, 'name');

      var wayResult = {
        id: way.$.id,
        name: wayName ? wayName : ('Unnamed ' + wayType),
        type: wayType,
        nodes: way.nd.map(function (nd) {
            return nodes[nd.$.ref] ? nodes[nd.$.ref] : { 'id': nd.$.ref, 'missing': true };
          })
      };
      rv[way.$.id] = wayResult;

      // console.log('Found way ' + wayName + ' which appears to be ' + (wayType ? ('a ' + wayType) : 'something unknown'));
    }
  });

  return rv;
}

function writeGpx(fname, data) {
  var header = '<?xml version="1.0"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1">';
  var footer = '</gpx>';

  var buffer = '';

  buffer += header + '\n';
  data.forEach(function (wpt) {
      buffer += '  <wpt lat="' + wpt.lat + '" lon="' + wpt.lon + '">\n' +
                '    <name>' + wpt.name + '</name>\n' +
                '  </wpt>\n';
    });
  buffer += footer;

  var outf = fs.openSync(fname, 'w');
  fs.writeSync(outf, buffer, null, 'utf8');
  fs.closeSync(outf);
}


var parser = new xml2js.Parser();
fs.readFile(__dirname + '/henry_coe.osm', function(err, data) {
    if (err) {
      console.log('Error parsing file: ' + err);
      return;
    }
    parser.parseString(data, processData);
});
