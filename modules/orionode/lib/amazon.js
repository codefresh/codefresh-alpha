/*******************************************************************************
 * Copyright (c) 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License v1.0
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html).
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*global console module process require*/
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var url = require('url');
var api = require('./api'), write = api.write, writeError = api.writeError;
var fileUtil = require('./fileUtil');
var resource = require('./resource');
var node_apps = require('./node_apps');

function printError(e) {
	console.log('err' + e);
}

function getDecoratedAppJson(req, nodeRoot, appContext, app) {
	var json = app.toJson();
	var requestUrl = url.parse(req.url);
	json.Location = url.format({
		host: req.headers.host,
		pathname: requestUrl.pathname + '/' + app.pid
	});
	if(json.DebugMeta){
		//Here we want to regenerate the debug URL to use the host name from the request.
		json.DebugURL = fileUtil.generateDebugURL(json.DebugMeta, url.parse('http://' + req.headers.host).hostname);
	}
	return json;
}

function getMachineIp(callback){

  require('dns').lookup(require('os').hostname(), function (err, add, fam) {
  console.log('addr: '+add);
  callback.call(null, add);
})
}

module.exports = function(options) {
	var amazonRoot = options.root;
	var appContext = options.appContext;
	if (!amazonRoot || !appContext) { throw 'Missing "amazonRoot" or "appContext" parameter'; }
  var latestApp  = {}
	return resource(amazonRoot, {
		/**
		 * @param {HttpRequest} req
		 * @param { } res
		 * @param {Function} next
		 * @param {String} rest
		 */

    GET: function(req, res, next ,rest)
    {
      console.log("GET //amazon");
      var jade  = require("jade");
      var fileSystem  = require("fs");
      console.log("additional requiest parameters are " + rest);
      if (!rest)
        rest = "deploy.html"

      if (rest === "lastDeploy")
      {
        console.log("lastDeploy route");
        console.log(JSON.stringify(latestApp));
        res.end(JSON.stringify(latestApp));
        return;
      }
      //var f = jade.compileFile(path.join(__dirname , "/amazon/deploy.jade"));
      //console.log(f({url:latestApp.url}));
      var deployHtml = path.join(__dirname , "/amazon/" + rest);
      console.log("path to deploy.html is "  + deployHtml);
      var readStream = fileSystem.createReadStream(deployHtml);
      console.log("sending file.....");
      return readStream.pipe(res);
      //res.end(f({url:latestApp.url}));
    },
		POST: function(req, res, next, rest) {
      console.log(rest);
      console.log(req.toString());
			var data = req.body;
      console.log("amazon:post")
      var cwd = data.context.cwd;
      var port  = Math.floor((Math.random() * 60000) + 10000);
      console.log("cwd:" + data.context.cwd + ",port = " + port);
      var oldPort = process.env.PORT;
      process.env.PORT = port;
      latestApp.port = port;
      latestApp.url = url.parse('http://' + req.headers.host).hostname + ":" + port;
			//var app = appContext.startApp(data.modulePath, data.args, data.context);
      var app = appContext.startApp(data.module , [data.context.cwd],
      {cwd: cwd,
        env:
        {PORT: port }});

      process.env.PORT = oldPort;
      var stdoutListener = function(data)
      {
        var dataStr = (function bin2String(array) {
          var result = "";
          for (var i = 0; i < array.length; i++) {
            result += String.fromCharCode(parseInt(array[i], 10));
        }
        return result;
      })(data);
        console.log(JSON.stringify(dataStr));

      }
      app.on('stdout', stdoutListener);
      app.on('stderr', stdoutListener);
      app.on('exit', function(){
         console.log("deployed app was not started properly");
      });
      //app.on('stderr', stdoutListener);
       
        
        latestApp.message = "app was deployed";
        var appText = JSON.stringify(latestApp);
        console.log("sending to app to Amazon " + JSON.stringify(appText));
        //write(204, res, null, retObj);
        res.end(JSON.stringify(appText));
      

		},
		// POST: No POST for apps -- starting apps is handled by a Web Socket connection
		DELETE: function(req, res, next, rest) {
			if (rest === '') {
				writeError(400, res);
				return;
			}
			var pid = rest, app = appContext.appTable.get(pid);
			if (!app) {
				writeError(404, res);
			} else {
				appContext.stopApp(app);
				write(204, res);
			}
		}
	});
};
