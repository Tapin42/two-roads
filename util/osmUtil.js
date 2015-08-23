var fs      = require('fs');
var xml2js  = require('xml2js');

exports.parseNodes = function parseNodes(nodeDict) {
  var rv = {};

  nodeDict.forEach(function (node) {
      rv[node.$.id] = {
        id: node.$.id,
        lat: node.$.lat,
        lon: node.$.lon
      }
    });

  return rv;
};

exports.parseHighways = function parseHighways(wayDict, nodes) {
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
  };

  function allTags(way) {
    if (way && way.tag) {
      var rv = {};
      way.tag.forEach(function (t) {
        rv[t.$.k] = t.$.v;
      })
      //console.log('Tags: ' + JSON.stringify(rv));
      return rv;
    }
    return {};
  }

  wayDict.forEach(function (way) {

    var wayType = findTag(way, 'highway');
    if (wayType) {
      var wayName = findTag(way, 'name');

      var wayResult = {
        id: way.$.id,
        name: wayName ? wayName : ('Unnamed ' + wayType),
        type: wayType,
        attrs: allTags(way),
        nodes: way.nd.map(function (nd) {
            return nodes[nd.$.ref] ? nodes[nd.$.ref] : { 'id': nd.$.ref, 'missing': true };
          })
      };
      rv[way.$.id] = wayResult;

      // console.log('Found way ' + wayName + ' which appears to be ' + (wayType ? ('a ' + wayType) : 'something unknown'));
    }
  });

  return rv;
};

exports.readFile = function readFile(inFile, callback) {
  fs.readFile(inFile, function(err, data) {
      if (err) {
        console.log('Error parsing file: ' + err);
        callback(err);
      }
      var parser = new xml2js.Parser();
      parser.parseString(data, callback);
  });
};

