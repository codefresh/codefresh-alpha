/*******************************************************************************
 * @license
 * Copyright (c) 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License v1.0
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html).
 *
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/
/*global console define URL XMLHttpRequest window*/
define([
	'orion/plugin',
	'orion/xhr',
	'orion/Deferred',
	'socket.io/socket.io',
	'orion/URL-shim', // no exports
], function(PluginProvider, xhr, Deferred, io) {

	function fromJson(xhrResult) {
		return JSON.parse(xhrResult.response);
	}
	function linkify(url) {
		return url && ('[' + url + '](' + url + ')');
	}
	function getSocketURL(path) {
		var socketBaseUrl = new URL("");
		var location = window.location;
		socketBaseUrl.protocol = location.protocol;
		socketBaseUrl.hostname = location.hostname;
		socketBaseUrl.port = location.port;
		socketBaseUrl.pathname = path;
		return socketBaseUrl.href;
	}
	/**
	 * Helper for managing Deferred progress
	 */
	function SocketProcess(url) {
		var socket = this.socket = io.connect(getSocketURL(url || ''), {
			'force new connection': true
		});
		var deferred = this.deferred = new Deferred();
		var buf = [];
		function addListenerOfType(type) {
			return socket.on.bind(socket, type);
		}
		Object.defineProperties(this, {
			'connect': { set: addListenerOfType('connect') },
			'disconnect': { set: addListenerOfType('disconnect') },
			'error':  { set: addListenerOfType('error') },
			'started': { set: addListenerOfType('started') },
			'stopped': { set: addListenerOfType('stopped') },
			'stdout': { set: addListenerOfType('stdout') },
			'stderr': { set: addListenerOfType('stderr') }
		});
		this.progress = function(data) {
			buf.push(data);
			deferred.progress(buf.join(''));
		};
		this.resolve = function() {
			deferred.resolve(buf.join(''));
		};
		this.disconnect = this.resolve;
		this.error = this.progress;
		this.stdout = this.progress;
		this.stderr = this.progress;
	}

	var provider = new PluginProvider({
		name: "Heroku Support",
		version: "1.0",
		description: "Provides deployment tools for Heroku"
	});

	provider.registerService('orion.shell.command', {}, {
		name: 'node',
		description: 'Commands to manage applications.'
	});

  var sockProc = new SocketProcess();

  function DeployService(){
  };

  DeployService.prototype = {

      constructor: DeployService,
      getDeployProgressMessage: function(project, launchConf){
        var message = "Deploying application to Heroku";
        return message;
      },
      deploy: function(project, launchConf) {
        var that = this;
        var deferred = new Deferred();
        var context = {cwd:project.ContentLocation};
        var path = project.ContentLocation  + "/server.js";

         var data = {
          module: "server.js",
          context: context,
          main : "server.js"
        }

      xhr('POST', '/amazon', {
        "data": JSON.stringify(data)
       , log: true
       , headers: {
       "Orion-Version": "1",
       "Content-Type": "application/json;charset=UTF-8"
       },

   }
   ).then(function(xhrResult) {
          var ids = [];
          deferred.resolve({UriTemplate: "{+OrionHome}/amazon",
            Width: "400px",
            Height: "270px",
          /*  cancelled : function(){
              alert("closing window");
            },*/
            UriTemplateId: "org.codefresh.amazon.deploy.uritemplate"});


          //deferred.resolve({State : "DEPLOYED" , Message : JSON.parse(xhrResult.responseText).url});
        })
        return deferred;
      },


      getState: function(props) {

      },

      start: function(props) {

      },


      stop: function(props) {

      }


    };


  provider.registerServiceProvider("orion.project.deploy",
  new DeployService(),
  {
    name: "Deploy to Heroku PAAS",
    id: "org.eclipse.orion.client.heroku.deploy",
    deployTypes: ["Heroku"],
    tooltip: "Deploy application in cloud to heroku.",
    validationProperties: [{source: "NoShow" }],
    logLocationTemplate: "{+OrionHome}/cfui/logs.html#{Name,Target*}",
    priorityForDefault: 9
  });
	provider.registerService('orion.shell.command', {
		callback: function(commandArgs, context) {
			var moduleFile = commandArgs.module, args = commandArgs.args;
			if (!moduleFile) {
				return 'No file to start was provided.';
			}

			sockProc.connect = function(data) {
				sockProc.socket.emit('start', {
					modulePath: moduleFile.path,
					context: context,
					args: args
				});
			};
			sockProc.started = function(app) {
				sockProc.progress('Started app (PID: ' + app.Id + ')\n');
			};
			sockProc.stopped = function(app) {
				// TODO unnecessary work, could just "resolve with progress" in one shot
				sockProc.progress('App stopped: (PID: ' + app.Id + ')\n');
				sockProc.resolve();
			};
			return sockProc.deferred;
		}
	}, {
		name: 'heroku start',
		description: 'Runs a Node.js application.',
		parameters: [{
			name: 'module',
			type: {name: "file", file: true, exist: true}, //$NON-NLS-0$
			description: 'The module to run.'
		}, {
			name: 'args',
			type: { name: 'array', subtype: 'string' },
			description: 'Optional command-line arguments to pass to the app.',
			defaultValue: null
		}]
	});

	provider.registerService('orion.shell.command', {
		callback: function(commandArgs) {
			return xhr('GET', '/node', {}).then(function(xhrResult) {
				var data = fromJson(xhrResult);
				if (!data.Apps.length) {
					return 'No running apps.';
				}
				var space = '\t\t\t';
				return [
					['PID', 'Debug URL'].join(space),
					['---', '---------'].join(space)
				].concat(data.Apps.map(function(app) {
					return [app.Id, (linkify(app.DebugURL) || '')].join(space);
				}))
				.join('\n');
			});
		}
	}, {
		name: 'heroku list',
		description: 'Lists the running Node.js apps.',
		parameters: []
	});

	provider.registerService('orion.shell.type', {
		cache: [],
		lastCacheUpdate: 0,
		CACHE_TIMEOUT: 3,
		parse: function(arg, typeSpec, context) {
			function resolveResult(promise, ids) {
				var value, status;
				var predictions = [];
				for (var i = 0; i < ids.length; i++) {
					if (ids[i].indexOf(arg.text) === 0) {
						predictions.push({name: ids[i], value: ids[i]});
						if (ids[i] === arg.text) {
							value = ids[i];
						}
					}
				}

				status = 2;	/* CompletionStatus.ERROR */
				if (predictions.length > 0) {
					status = value ? 0 : 1;	/* CompletionStatus.MATCH : CompletionStatus.PARTIAL */
				}
				promise.resolve({
					value: value,
					message: (status === 2 /*CompletionStatus.ERROR */ ? ("'" + arg.text + "' is not valid") : undefined),
					status: status,
					predictions: predictions
				});
			};

			var promise = new Deferred();

			if (context.lastParseTimestamp && (context.lastParseTimestamp - lastCacheUpdate) < this.CACHE_TIMEOUT) {
				resolveResult(promise, cache);
			} else {
				xhr('GET', '/node', {}).then(function(xhrResult) {
					var ids = [];
					var data = fromJson(xhrResult);
					if (data.Apps.length) {
						data.Apps.forEach(function(app) {
							ids.push(app.Id.toString());
						});
					}
					cache = ids;
					lastCacheUpdate = context.lastParseTimestamp;
					resolveResult(promise, ids);
				}.bind(this));
			}

			return promise;
		}
	}, {
		name: 'nodePID'
	});

	provider.registerService('orion.shell.command', {
		callback: function(commandArgs) {
			var pid = commandArgs.pid;
			return xhr('DELETE', '/node/' + pid, {}).then(function(xhrResult) {
				return 'Stopped ' + pid;
			}, function(xhrResult) {
				return 'Could not stop ' + pid + ': ' + (xhrResult.error || xhrResult);
			});
		}
	}, {
		name: 'node stop',
		description: 'Stops a running Node.js app.',
		parameters: [{
			name: 'pid',
			type: 'nodePID'
		}]
	});

	provider.registerService('orion.shell.command',{
		callback: function(commandArgs, context) {
			var moduleFile = commandArgs.module, args = commandArgs.args;
			if (!moduleFile) {
				return 'No file to debug was provided.';
			}
			var sockProc = new SocketProcess();
			sockProc.connect = function(data) {
				sockProc.socket.emit('debug', {
					modulePath: moduleFile.path,
					port: commandArgs.port,
					context: context,
					args: args
				});
			};
			sockProc.started = function(app) {
				sockProc.progress('Debugging app (PID: ' + app.Id + ')\nDebug URL: ' + linkify(app.DebugURL) + '\n');
			};
			sockProc.stopped = function(app) {
				sockProc.progress('App stopped (PID: ' + app.Id + ')');
				sockProc.resolve();
			};
			return sockProc.deferred;
		}
	}, {
		name: 'node debug',
		description: 'Runs a Node.js application with a given debug port number. Use different port numbers if you debug more than one apps. Use the debug URL from the command response, in a webkit browser to start debug.',
		parameters: [{
			name: 'module',
			type: {name: "file", file: true, exist: true}, //$NON-NLS-0$
			description: 'The module to run in the child.'
		}, {
			name: 'port',
			type: { name: 'number', min: 1 },
			description: 'The debug port number to pass to the child process.',
			defaultValue: 5860
		}, {
			name: 'args',
			type: { name: 'array', subtype: 'string' },
			description: 'Optional command-line arguments to pass to the app.',
			defaultValue: null
		}]
	});

	provider.registerService('orion.shell.command', {
		callback: function(commandArgs, context) {
			var args = commandArgs.args;
			var sockProc = new SocketProcess();
			sockProc.connect = function(data) {
				sockProc.socket.emit('npm', {
					context: context,
					args: args
				});
			};
			sockProc.started = function(app) {
				//sockProc.progress('Started app (PID: ' + app.Id + ')\n');
			};
			sockProc.stopped = function(app) {
				// TODO unnecessary work, could just "resolve with progress" in one shot
				//sockProc.progress('App stopped: (PID: ' + app.Id + ')\n');
				if(app.error){
					sockProc.progress(app.error);
				}
				sockProc.resolve();
			};
			return sockProc.deferred;
		}
	}, {
		name: 'npm',
		description: 'Runs the node package manager.',
		parameters: [{
			name: 'args',
			type: { name: 'array', subtype: 'string' },
			description: 'The command-line arguments to pass to npm.',
			defaultValue: null
		}]
	});

   provider.registerService("orion.core.setting",  //$NON-NLS-0$
		{},
		{	settings: [{
			pid: "org.codefresh.deploy.settings",
			name: "Settings", 
			category: "Deploy",
			properties: [{
				id: "provider",
				name: "Provider",
				type: "string",
				defaultValue: "Amazon"
			},
			{
				id: "port",
				name: "Port",
				type: "number",
				defaultValue: "1111"
			}

			]
			}]
				 
		});
 


	provider.connect();
});
