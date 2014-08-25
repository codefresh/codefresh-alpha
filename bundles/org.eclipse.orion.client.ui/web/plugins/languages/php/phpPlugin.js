/*******************************************************************************
 * @license
 * Copyright (c) 2014 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
/*global esprima*/
/*jslint amd:true*/
define(['orion/plugin', 'orion/editor/stylers/text_x-php/syntax'], function(PluginProvider, mPHP) {

	/**
	 * Plug-in headers
	 */
	var headers = {
		name: "Orion PHP Tool Support",
		version: "1.0",
		description: "This plugin provides PHP tools support for Orion."
	};
	var provider = new PluginProvider(headers);

	/**
	 * Register the PHP content type
	 */
	provider.registerServiceProvider("orion.core.contenttype", {}, {
		contentTypes: [
			{	id: "text/x-php",
				"extends": "text/plain",
				name: "PHP",
				extension: ["php", "php3", "php4", "php5", "phpt", "phtml", "aw", "ctp"]
			}
		] 
	});

	/**
	 * Register syntax styling
	 */
	provider.registerServiceProvider("orion.edit.highlighter", {}, mPHP.grammars[mPHP.grammars.length - 1]);

	provider.connect();
});
