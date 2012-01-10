if (process.env['AIRBRAKE_KEY']) {
  var airbrake = require('airbrake');
  airbrake = airbrake.createClient(process.env['AIRBRAKE_KEY']);
  airbrake.handleExceptions();
}


var Handlebars   = require('handlebars')
,   Http         = require('http')
,   Fs           = require('fs')
,   ChildProcess = require('child_process')
;


var _fetch_endpoints
,   _render_config
,   _update_config
,   _reload_varnish
;


var vcl_template
,   alice_host
,   alice_port
;

alice_host = process.env['ALICE_HOST'] || 'localhost';
alice_port = process.env['ALICE_PORT'] || '5000';
alice_port = parseInt(alice_port, 10);

_fetch_endpoints = function(){
  var buffer
  ,   options
  ,   endpoints
  ,   report
  ;

  buffer = "";
  options = {
    host: alice_host,
    port: alice_port,
    path: '/api_v1/routers.json'
  };

  Http.get(options, function(res) {
    if (res.statusCode == 200) {
      res.setEncoding('utf8');
      res.on('data', function(chunk){
        buffer += chunk;
      });

      res.on('end', function(){
        endpoints = JSON.parse(buffer);
        _render_config(endpoints);
      });

      res.on('close', function(e){
        console.log("Got error: " + e.message);
      });
    } else {
      console.log("Got error: " + res.statusCode);
    }
  }).on('error', function(e) {
    console.log("Got error: " + e.message);
  });
};

_render_config = function(endpoints){
  var ctx
  ,   new_vcl
  ;

  ctx = {
    routers: endpoints['routers']
  };

  new_vcl = vcl_template(ctx);
  _update_config(new_vcl);
};

_update_config = function(new_vcl){
  Fs.readFile(process.env['ALICE_VARNISH_VCL'], 'utf8', function(err, data){
    if (err) { throw err; }

    if (data == new_vcl) { return; }

    Fs.writeFile(process.env['ALICE_VARNISH_VCL'], new_vcl, 'utf8', function(err){
      if (err) { throw err; }

      _reload_varnish();
    });
  });
};

_reload_varnish = function(){
  var reload
  ;

  reload = ChildProcess.spawn('sh', ['-c', process.env['ALICE_VARNISH_RELOAD']]);

  reload.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
  });

  reload.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  reload.on('exit', function (code) {
    console.log('child process ('
               +process.env['ALICE_VARNISH_RELOAD']
               +') exited with code '
               +code);
  });
};

process.env['ALICE_VARNISH_VCL'] = process.env['ALICE_VARNISH_VCL'] || '/etc/varnish/default.vcl';

Fs.readFile(__dirname+'/templates/varnish.vcl', 'utf8', function(err, data){
  if (err) throw err;
  vcl_template = Handlebars.compile(data);

  _fetch_endpoints();
  setInterval(_fetch_endpoints, 60000);
});
