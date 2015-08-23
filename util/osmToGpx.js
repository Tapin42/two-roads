var fs      = require('fs');
var xml2js  = require('xml2js');
var extend  = require('extend');
var osmUtil = require('./osmUtil.js');

var inFile = process.argv[2] || (__dirname + '/henry_coe_highways.osm');
var outDir = process.argv[3] || '/tmp/wayGpxes';

var usedWayNames = {};

function processData(err, data) {

  if (err) {
    console.log('Error parsing string: ' + err);
    return;
  }

  console.log('Ways: ' + data.osm.way.length);

  var nodes = osmUtil.parseNodes(data.osm.node);
  console.log('# of nodes: ' + Object.keys(nodes).length);

  var ways = osmUtil.parseHighways(data.osm.way, nodes);
  console.log('# of trails: ' + Object.keys(ways).length);

  splitWays(nodes, ways);

  Object.keys(ways).forEach(function (wayId) {
      processSingleWay(ways[wayId])
    });
}

function splitWays(nodes, ways) {
  // 1) Create a dict indexed by node ID
  // 2) Loop through the ways and push way ID onto the dict for the associated node ID
  // 3) Filter the node dict to those on more than one way
  // 4) Foreach node ID
  //    4a) Foreach way ID
  //        4aa) See if the way has that node as its first or last point.  If not:
  //            4aaa) Add the (way, node) to the list of splits
  // 5) Remap the (way, node) list into { way: [node, node, node] } so we only ever have to hit a way once
  // 6) Foreach way in the split dict
  //    6a) Find an appropriate number of new IDs
  //    6b) Create a new way for each split area with an identical copy of the metadata and just a different nodes list

  var nodesAndTheirWays = {};
  Object.keys(ways).forEach(function (wayId) {
      var way = ways[wayId];
      way.nodes.forEach(function (node) {
          if (nodesAndTheirWays[node.id]) {
            nodesAndTheirWays[node.id].push(way.id);
          } else {
            nodesAndTheirWays[node.id] = [way.id];
          }
        });
    });

  var intersections = Object.keys(nodesAndTheirWays).filter(function (nodeId) {
      return nodesAndTheirWays[nodeId].length > 1;
    });

  console.log('I found ' + intersections.length + ' intersections');

  var splitPoints = [];
  intersections.forEach(function (nodeId) {
      nodesAndTheirWays[nodeId].forEach(function (wayId) {
          var way = ways[wayId];
          if (way.nodes[0].id !== nodeId && way.nodes[way.nodes.length-1].id !== nodeId) {
            splitPoints.push({ way: wayId, node: nodeId });
          }
        });
    });

  console.log('I found ' + splitPoints.length + ' split points');

  var splitPointsByWay = {};
  splitPoints.forEach(function (pt) {
      if (splitPointsByWay[pt.way]) {
        splitPointsByWay[pt.way].push(pt.node);
      } else {
        splitPointsByWay[pt.way] = [pt.node];
      }
    });

  console.log('Looks like ' + Object.keys(splitPointsByWay).length + ' ways are going to be split up.');

  var nextAvailableId = -89999;
  Object.keys(splitPointsByWay).forEach(function (wayId) {
      var oldWay = ways[wayId];
      var splitNodes = splitPointsByWay[wayId];
      var newWays = {};
      var curNodes = [];

      var newWayTemplate = {};
      Object.keys(oldWay).forEach(function (k) {
        if (k !== 'nodes' && k !== 'id') {
          newWayTemplate[k] = oldWay[k];
        }
      })

      oldWay.nodes.forEach(function (node) {
          if (splitNodes.length > 0) {
            curNodes.push(node);
            if (splitNodes.indexOf(node.id) > -1) {
              // console.log('We found a split point, and it is ' + curNodes.length + ' nodes into ' + oldWay.name);

              // Cheesy deep copy
              var newWay = JSON.parse(JSON.stringify(newWayTemplate));
              extend(newWay, {
                id: nextAvailableId,
                nodes: curNodes.slice(0)
              });
              nextAvailableId += 1;
              curNodes = [node];
              newWays[newWay.id] = newWay;

              splitNodes.splice(splitNodes.indexOf(node.id), 1);
              // console.log('There are now ' + splitNodes.length + ' more split points for ' + oldWay.name);
            }
          }
        });

      delete ways[wayId];
      extend(ways, newWays);
    });
}

function processSingleWay(way) {
  var wayName = way.name;

  if (usedWayNames[wayName]) {
    usedWayNames[wayName] += 1;
  } else {
    usedWayNames[wayName] = 1;
  }
  wayName = wayName + ' ' + usedWayNames[wayName];

  var gpxData = {
    gpx: {
      $: {
        'xmlns': "http://www.topografix.com/GPX/1/1",
        'xmlns:gpsm': "http://www.gpsmaster.org/schema/gpsm/v1",
        'xmlns:twr': "http:localhost/schema/two-roads/v1"
      },
      metadata: [{
        name: wayName,
        'twr:source': 'osm',
        'twr:type': way.type,
        'twr:id': way.id,
      }]
    }
  };

  var attrs = {};
  Object.keys(way.attrs).forEach(function (attr) {
    var xmlAttr = attr.replace(/:/g, '.');
    attrs['twr:' + xmlAttr] = way.attrs[attr];
  });
  gpxData.gpx.metadata[0].attrs = [attrs];

  var trkpts = [];
  way.nodes.forEach(function (node) {
    trkpts.push({
      $: {
        lat: node.lat,
        lon: node.lon
      }
    });
  });

  gpxData.gpx.trk = [{
    name: wayName,
    trkseg: [{
      trkpt: trkpts
    }]
  }];

  writeGpx(outDir + '/' + wayName.replace(/ /g, '_') + '.gpx', gpxData);
}

function writeGpx(fname, data) {
  var builder = new xml2js.Builder();
  var xml = builder.buildObject(data);

  fs.writeFileSync(fname, xml);
}

osmUtil.readFile(inFile, processData);
