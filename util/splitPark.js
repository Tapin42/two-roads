var fs     = require('fs');
var xml2js = require('xml2js');
var mkdirp = require('mkdirp');

function processData(err, data) {
  if (err) {
    console.log('Error! ' + err);
  }

  console.log('Tracks found: ' + data.gpx.trk.length);

  for (var i=0; i<data.gpx.trk.length; i++) {
    var trk = data.gpx.trk[i];
    console.log('Track: ' + trk.name);

    // First, build the entire GPX
    var newGpx = {
      gpx: {
        metadata: {
          name: trk.name
        },
        trk: trk
      }
    };

    // Now, rework the extensions
    newGpx.gpx.trk.extensions = {
      'twr:mapYear': '2006'
    };

    // Finally, output it
    writeGpx(outDir + '/' + trk.name[0].replace(/ /g, '_') + '.gpx', newGpx);
  }
}

function writeGpx(fname, data) {
  var builder = new xml2js.Builder();
  var xml = builder.buildObject(data);

  fs.writeFileSync(fname, xml);
}

var parser = new xml2js.Parser();
var inFile = process.argv[2] || (__dirname + '/../segments/coe/raw/incomplete.gpx');
var outDir = process.argv[3] || '/tmp/segments';

console.log('Reading from ' + inFile);
console.log('Output to ' + outDir);

mkdirp.sync(outDir);

fs.readFile(inFile, function(err, data) {
    if (err) {
      console.log('Error parsing file: ' + err);
      return;
    }
    parser.parseString(data, processData);
});
