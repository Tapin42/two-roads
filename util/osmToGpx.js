var fs      = require('fs');
var xml2js  = require('xml2js');
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

  Object.keys(ways).forEach(function (wayId) {
      processSingleWay(ways[wayId])
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
