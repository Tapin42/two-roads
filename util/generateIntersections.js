var fs      = require('fs');
var osmUtil = require('./osmUtil.js');

var inFile  = process.argv[2] || (__dirname + '/henry_coe_highways.osm');
var outFile = process.argv[3] || './henry_coe_intersections.gpx';

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

  var nodes = osmUtil.parseNodes(data.osm.node);
  console.log('# of nodes: ' + Object.keys(nodes).length);

  var ways = osmUtil.parseHighways(data.osm.way, nodes);
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

  writeGpx(outFile, gpxData);
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

osmUtil.readFile(inFile, processData);
