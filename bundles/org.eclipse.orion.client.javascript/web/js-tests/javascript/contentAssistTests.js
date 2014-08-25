/*******************************************************************************
 * @license
 * Copyright (c) 2012, 2014 VMware, Inc. and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html).
 *
 * Contributors:
 *     Andrew Eisenberg (VMware) - initial API and implementation
 *     IBM Corporation - Various improvements
 ******************************************************************************/
/*eslint-env amd, mocha, node*/
/*global doctrine*/
define([
	'javascript/contentAssist/contentAssist',
	'chai/chai',
	'orion/objects',
	'orion/Deferred',
	'esprima',
	'mocha/mocha', //mjust stay at the end, not a module
	'doctrine/doctrine' //must stay at the end, does not export a module 
], function(ContentAssist, chai, objects, Deferred, Esprima) {
	var assert = chai.assert;

	describe('Content Assist Tests', function() {
		/**
		 * @description Parse the snippet
		 * @returns {Object} The AST
		 */
		function parseFull(contents) {
			return Esprima.parse(contents, {
						range: true,
						tolerant: true,
						comment: true,
						tokens: true
					});
		}
	
		/**
		 * @description Sets up the test
		 * @param {Object} options The options the set up with
		 * @returns {Object} The object with the initialized values
		 */
		function setup(options) {
			var buffer = options.buffer,
			    prefix = options.prefix,
			    offset = options.offset,
			    lintOptions = options.lintOptions,
			    editorContextMixin = options.editorContextMixin || {},
			    paramsMixin = options.paramsMixin || {};
			if (!prefix) {
				prefix = "";
			}
			if (!offset) {
				if (typeof buffer !== "string") {
					throw new Error("invalid buffer");
				}
				offset = buffer.indexOf("/**/");
				if (offset < 0) {
					offset = buffer.length;
				}
			}
	
			var astManager = {
				/*override*/
				getAST: function() {
					return new Deferred().resolve(parseFull(buffer));
				}
			};
			var contentAssist = new ContentAssist.JSContentAssist(astManager, lintOptions);
			var editorContext = {
				/*override*/
				getText: function() {
					return new Deferred().resolve(buffer);
				}
			};
			
			var params = {offset: offset, prefix : prefix, keyword: false, template: false };
			objects.mixin(editorContext, editorContextMixin);
			objects.mixin(params, paramsMixin);
			return {
				astManager: astManager,
				contentAssist: contentAssist,
				editorContext: editorContext,
				params: params
			};
		}
	
		// Also accepts a single object containing a map of arguments
		var buffers = {};
		var currentName = null;
		function computeContentAssist(buffer, prefix, offset, lintOptions, editorContextMixin, paramsMixin) {
			buffers[currentName] = buffer;
	
			var result;
			if (arguments.length === 1 && typeof arguments[0] === "object") {
				// Single param containing a map of arguments for setup()
				result = setup.apply(this, Array.prototype.slice.call(arguments));
			} else {
				result = setup({
					buffer: buffer,
					prefix: prefix,
					offset: offset,
					lintOptions: lintOptions,
					editorContextMixin: editorContextMixin,
					paramsMixin: paramsMixin
				});
			}
			var contentAssist = result.contentAssist, editorContext = result.editorContext, params = result.params;
			return contentAssist.computeContentAssist(editorContext, params);
		}
	
		/**
		 * @description Conpares the given proposal to the given text and description
		 * @param {Object} proposal The proposal returned from the content assist
		 * @param {String} text The name of the proposal to compare
		 * @param {String} description The description to compare
		 */
		function testProposal(proposal, text, description) {
			assert.equal(proposal.proposal, text, "Invalid proposal text"); //$NON-NLS-0$
			if (description) {
				if (proposal.name) {
					assert.equal(proposal.name + proposal.description, description, "Invalid proposal description"); //$NON-NLS-0$
				} else {
					assert.equal(proposal.description, description, "Invalid proposal description"); //$NON-NLS-0$
				}
			}
		}
		/**
		 * @description Pretty-prints the given array of proposal objects
		 * @param {Array} expectedProposals The array of proposals
		 * @returns {String} The pretty-printed proposals
		 */
		function stringifyExpected(expectedProposals) {
			var text = "";
			for (var i = 0; i < expectedProposals.length; i++)  {
				text += expectedProposals[i][0] + " : " + expectedProposals[i][1] + "\n";
			}
			return text;
		}
		
		/**
		 * @description Pretty-prints the given array of proposal objects
		 * @param {Array} expectedProposals The array of proposals
		 * @returns {String} The pretty-printed proposals
		 */
		function stringifyActual(actualProposals) {
			var text = "";
			for (var i = 0; i < actualProposals.length; i++) {
				if (actualProposals[i].name) {
					text += actualProposals[i].proposal + " : " + actualProposals[i].name + actualProposals[i].description + "\n"; //$NON-NLS-1$ //$NON-NLS-0$
				} else {
					text += actualProposals[i].proposal + " : " + actualProposals[i].description + "\n"; //$NON-NLS-1$ //$NON-NLS-0$
				}
			}
			return text;
		}
	
		/**
		 * @description Checks the proposals returned from the given proposal promise against
		 * the array of given proposals
		 * @param {orion.Promise} actualProposalsPromise The promise to return proposals
		 * @param {Array} expectedProposals The array of expected proposal objects
		 */
		function testProposals(actualProposalsPromise, expectedProposals) {
			return actualProposalsPromise.then(function (actualProposals) {
				assert.equal(actualProposals.length, expectedProposals.length,
					"Wrong number of proposals.  Expected:\n" + stringifyExpected(expectedProposals) +"\nActual:\n" + stringifyActual(actualProposals));
	
				for (var i = 0; i < actualProposals.length; i++) {
					testProposal(actualProposals[i], expectedProposals[i][0], expectedProposals[i][1]);
				}
			}, function (error) {
				assert.fail(error);
			});
		}
	
		/**
		 * @description Asserts that a given proposal is NOT present in a list of actual proposals.
		 * @param {Object} expectedProposal The proposal we are not expecting to see
		 * @param {orion.Promise} actualProposalsPromise The promise to return proposals
		 */
		function assertNoProposal(expectedProposal, actualProposalsPromise) {
			return actualProposalsPromise.then(function(actualProposals) {
				for (var i = 0; i < actualProposals.length; i++) {
					if (typeof(actualProposals[i]) === "string" && actualProposals[i].indexOf(expectedProposal) === 0) {
						assert.fail("Did not expect to find proposal \'" + expectedProposal + "\' in: " + print(actualProposals));
					}
					if (typeof(actualProposals[i].proposal) === "string" && actualProposals[i].proposal.indexOf(expectedProposal) === 0) {
						assert.fail("Did not expect to find proposal \'" + expectedProposal + "\' in: " + print(actualProposals));
					}
				}
			});
			//we didn't find it, so pass
		}
	
		/**
		 * Asserts that a proposal is present in a list of actual proposals. The test ensures that some actual proposal contains
		 * all the required words and none of the prohibited words.
		 * @since 5.0
		 */
		function assertProposalMatching(/*String[]*/ required, /*String[]*/ prohibited, actualProposalsPromise) {
			return actualProposalsPromise.then(function(actualProposals) {
				/**
				 * @description Checks if the given text has the given word in it
				 * @param {String} text 
				 * @param {String} word
				 */
				function matches(text, word) {
					return text.indexOf(word) !== -1;
				}
				for (var i = 0; i < actualProposals.length; i++) {
					var proposal = actualProposals[i];
					if (typeof proposal.proposal !== "string") {
						continue;
					}
					var matchesProposal = matches.bind(null, proposal.proposal);
					if (required.every(matchesProposal) && !prohibited.some(matchesProposal)) {
						return;
					}
				}
				assert.fail("Expected to find proposal matching all of '" + required.join("','") + "' and none of '" + prohibited.join("','") + "' in: " + print(actualProposals));
			});
		}
	
		/**
		 * Asserts that a given proposal is present in a list of actual proposals. The test just ensures that an actual
		 * proposal starts with the expected value.
		 * @param expectedProposal {String} The expected proposal string
		 * @param actualProposalsPromise {orion.Promise} Promise to return the actual proposals
		 * @since 5.0
		 */
		function assertProposal(expectedProposal, actualProposalsPromise) {
			return actualProposalsPromise.then(function(actualProposals) {
				for (var i = 0; i < actualProposals.length; i++) {
					if (typeof(actualProposals[i].proposal) === "string" && actualProposals[i].proposal.indexOf(expectedProposal) === 0) {
						return;
					}
				}
				//we didn't find it, so fail
				assert.fail("Expected to find proposal \'" + expectedProposal + "\' in: " + print(actualProposals));
			});
		}
		
		/**
		 * @dscription Prints out the list of proposals
		 * @since 5.0
		 */
		function print(proposals) {
			return proposals.map(function(proposal) {
				return proposal.proposal.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
			});
		}
	
		//////////////////////////////////////////////////////////
		// tests
		//////////////////////////////////////////////////////////
	
		it("test Empty Content Assist", function() {
			var resultPromise = computeContentAssist("x", "x");
			return resultPromise.then(function (results) {
				assert.equal(results.length, 0);
			});
		});
	
		// non-inferencing content assist
		it("test Empty File Content Assist", function() {
			var results = computeContentAssist("");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test Single Var Content Assist", function() {
			var results = computeContentAssist("var zzz = 9;\n");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["zzz", "zzz : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test Single Var Content Assist 2", function() {
			var results = computeContentAssist("var zzz;\n");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["zzz", "zzz : {}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test multi var content assist 1", function() {
			var results = computeContentAssist("var zzz;\nvar xxx, yyy;\n");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["xxx", "xxx : {}"],
				["yyy", "yyy : {}"],
				["zzz", "zzz : {}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test multi var content assist 2", function() {
			var results = computeContentAssist("var zzz;\nvar zxxx, xxx, yyy;\nz","z");
			return testProposals(results, [
				["zxxx", "zxxx : {}"],
				["zzz", "zzz : {}"]
			]);
		});
		it("test single function content assist", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\n");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test multi function content assist 1", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\nfunction other(a, b, c) {}\n");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["other(a, b, c)", "other(a, b, c) : undefined"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		it("test no dupe 1", function() {
			var results = computeContentAssist(
					"var coo = 9; var other = function(coo) { c }", "c", 42);
			return testProposals(results, [
				["coo", "coo : {}"]
			]);
		});
	
		it("test no dupe 2", function() {
			var results = computeContentAssist(
					"var coo = { }; var other = function(coo) { coo = 9;\nc }", "c", 53);
			return testProposals(results, [
				["coo", "coo : Number"]
			]);
		});
	
		it("test no dupe 3", function() {
			var results = computeContentAssist(
					"var coo = function () { var coo = 9; \n c};", "c", 40);
			return testProposals(results, [
				["coo", "coo : Number"]
			]);
		});
	
		it("test no dupe 4", function() {
			var results = computeContentAssist(
					"var coo = 9; var other = function () { var coo = function() { return 9; }; \n c};", "c", 78);
			return testProposals(results, [
				["coo()", "coo() : Number"]
			]);
		});
	
		it("test scopes 1", function() {
			// only the outer foo is available
			var results = computeContentAssist(
					"var coo;\nfunction other(a, b, c) {\nfunction inner() { var coo2; }\nco}", "co", 68);
			return testProposals(results, [
				["coo", "coo : {}"]
			]);
		});
		it("test scopes 2", function() {
			// the inner assignment should not affect the value of foo
			var results = computeContentAssist(
			         "var foo;\n var foo = 1;\nfunction other(a, b, c) {\nfunction inner() { foo2 = \"\"; }\nfoo.toF}", "toF", 88);
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test multi function content assist 2", function() {
			var results = computeContentAssist("function ffun(a, b, c) {}\nfunction other(a, b, c) {}\nff", "ff");
			return testProposals(results, [
				["ffun(a, b, c)", "ffun(a, b, c) : undefined"]
			]);
		});
		it("test in function 1", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\nfunction other(a, b, c) {}", "", 49);
			return testProposals(results, [
				["a", "a : {}"],
				["arguments", "arguments : Arguments"],
				["b", "b : {}"],
				["c", "c : {}"],
				["this", "this : {}"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["other(a, b, c)", "other(a, b, c) : undefined"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test in function 2", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\nfunction other(a, b, c) {\nnuthin}", "", 50);
			return testProposals(results, [
				["a", "a : {}"],
				["arguments", "arguments : Arguments"],
				["b", "b : {}"],
				["c", "c : {}"],
				["this", "this : {}"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["other(a, b, c)", "other(a, b, c) : undefined"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["nuthin", "nuthin : {}"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test in function 3", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\nfunction other(a, b, c) {f}", "f", 51);
			return testProposals(results, [
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"]
			]);
		});
		it("test in function 4", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\nfunction other(aa, ab, c) {a}", "a", 53);
			return testProposals(results, [
				["aa", "aa : {}"],
				["ab", "ab : {}"],
				["arguments", "arguments : Arguments"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"]
			]);
		});
		it("test in function 5", function() {
			var results = computeContentAssist("function fun(a, b, c) {}\nfunction other(aa, ab, c) {var abb;\na\nvar aaa}", "a", 62);
			return testProposals(results, [
				["aaa", "aaa : {}"],
				["abb", "abb : {}"],
				["", "---------------------------------"],
				["aa", "aa : {}"],
				["ab", "ab : {}"],
				["arguments", "arguments : Arguments"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"]
			]);
		});
		it("test in function 6", function() {
			var results = computeContentAssist("function fun(a, b, c) {\n function other(aa, ab, c) {\n var abb;\na\nvar aaa\n}\n}", "a", 65);
			return testProposals(results, [
				["aaa", "aaa : {}"],
				["abb", "abb : {}"],
				["", "---------------------------------"],
				["aa", "aa : {}"],
				["ab", "ab : {}"],
				["arguments", "arguments : Arguments"],
				["", "---------------------------------"],
				["a", "a : {}"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"]
			]);
		});
		it("test in function 7", function() {
			// should not see 'aaa' or 'abb' since declared in another function
			var results = computeContentAssist(
			"function fun(a, b, c) {\n" +
			"function other(aa, ab, ac) {\n"+
			"var abb;\na\nvar aaa\n}\n}", "", 23);
			return testProposals(results, [
				["a", "a : {}"],
				["arguments", "arguments : Arguments"],
				["b", "b : {}"],
				["c", "c : {}"],
				["this", "this : {}"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["other(aa, ab, ac)", "other(aa, ab, ac) : undefined"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test in function 8", function() {
			// should not see 'aaa' since that is declared later
			var results = computeContentAssist("function fun(a, b, c) {\nfunction other(aa, ab, ac) {\n var abb;\na\nvar aaa\n} \n}", "", 75);
			return testProposals(results, [
				["other(aa, ab, ac)", "other(aa, ab, ac) : undefined"],
				["", "---------------------------------"],
				["a", "a : {}"],
				["arguments", "arguments : Arguments"],
				["b", "b : {}"],
				["c", "c : {}"],
				["this", "this : {}"],
				["", "---------------------------------"],
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["fun(a, b, c)", "fun(a, b, c) : undefined"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
	
		// all inferencing based content assist tests here
		it("test Object inferencing with Variable", function() {
			var results = computeContentAssist("var t = {}\nt.h", "h");
			return testProposals(results, [
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"]
			]);
		});
		it("test Object Literal inferencing", function() {
			var results = computeContentAssist("var t = { hhh : 1, hh2 : 8}\nt.h", "h");
			return testProposals(results, [
				["hh2", "hh2 : Number"],
				["hhh", "hhh : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"]
			]);
		});
		it("test Simple String inferencing", function() {
			var results = computeContentAssist("''.char", "char");
			return testProposals(results, [
				["charAt(index)", "charAt(index) : String"],
				["charCodeAt(index)", "charCodeAt(index) : Number"]
			]);
		});
		it("test Simple Date inferencing", function() {
			var results = computeContentAssist("new Date().setD", "setD");
			return testProposals(results, [
				["setDate(date)", "setDate(date) : Number"],
				["setDay(dayOfWeek)", "setDay(dayOfWeek) : Number"]
			]);
		});
		it("test Number inferencing with Variable", function() {
			var results = computeContentAssist("var t = 1\nt.to", "to");
			return testProposals(results, [
				["toExponential(digits)", "toExponential(digits) : String"],
				["toFixed(digits)", "toFixed(digits) : String"],
				["toPrecision(digits)", "toPrecision(digits) : String"],
				["", "---------------------------------"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"]
			]);
		});
	
		it("test Data flow Object Literal inferencing", function() {
			var results = computeContentAssist("var s = { hhh : 1, hh2 : 8}\nvar t = s;\nt.h", "h");
			return testProposals(results, [
				["hh2", "hh2 : Number"],
				["hhh", "hhh : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"]
			]);
		});
		it("test Data flow inferencing 1", function() {
			var results = computeContentAssist("var ttt = 9\nttt.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test Data flow inferencing 2", function() {
			var results = computeContentAssist("ttt = 9\nttt.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test Data flow inferencing 3", function() {
			var results = computeContentAssist("var ttt = \"\"\nttt = 9\nttt.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test Data flow inferencing 4", function() {
			var results = computeContentAssist("var name = toString(property.key.value);\nname.co", "co");
			return testProposals(results, [
				["concat(str)", "concat(str) : String"]
			]);
		});
	
		it("test Simple this", function() {
			var results = computeContentAssist("var ssss = 4;\nthis.ss", "ss");
			return testProposals(results, [
				["ssss", "ssss : Number"]
			]);
		});
	
		it("test Object Literal inside", function() {
			var results = computeContentAssist("var x = { the : 1, far : this.th };", "th", 32);
			return testProposals(results, [
				["the", "the : Number"]
			]);
		});
		it("test Object Literal outside", function() {
			var results = computeContentAssist("var x = { the : 1, far : 2 };\nx.th", "th");
			return testProposals(results, [
				["the", "the : Number"]
			]);
		});
		it("test Object Literal none", function() {
			var results = computeContentAssist("var x = { the : 1, far : 2 };\nthis.th", "th");
			return testProposals(results, [
			]);
		});
		it("test Object Literal outside 2", function() {
			var results = computeContentAssist("var x = { the : 1, far : 2 };\nvar who = x.th", "th");
			return testProposals(results, [
				["the", "the : Number"]
			]);
		});
		it("test Object Literal outside 3", function() {
			var results = computeContentAssist("var x = { the : 1, far : 2 };\nwho(x.th)", "th", 38);
			return testProposals(results, [
				["the", "the : Number"]
			]);
		});
		it("test Object Literal outside 4", function() {
			var results = computeContentAssist("var x = { the : 1, far : 2 };\nwho(yyy, x.th)", "th", 43);
			return testProposals(results, [
				["the", "the : Number"]
			]);
		});
		it("test this reference 1", function() {
			var results = computeContentAssist("var xxxx;\nthis.x", "x");
			return testProposals(results, [
				["xxxx", "xxxx : {}"]
			]);
		});
		it("test binary expression 1", function() {
			var results = computeContentAssist("(1+3).toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		// not working since for loop is not storing slocs of var ii
		it("test for loop 1", function() {
			var results = computeContentAssist("for (var ii=0;i<8;ii++) { ii }", "i", 15);
			return testProposals(results, [
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["ii", "ii : Number"],
				["Infinity", "Infinity : Number"],
				["", "---------------------------------"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"]
			]);
		});
		it("test for loop 2", function() {
			var results = computeContentAssist("for (var ii=0;ii<8;i++) { ii }", "i", 20);
			return testProposals(results, [
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["ii", "ii : Number"],
				["Infinity", "Infinity : Number"],
				["", "---------------------------------"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"]
			]);
		});
		it("test for loop 3", function() {
			var results = computeContentAssist("for (var ii=0;ii<8;ii++) { i }", "i", 28);
			return testProposals(results, [
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["ii", "ii : Number"],
				["Infinity", "Infinity : Number"],
				["", "---------------------------------"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"]
			]);
		});
		it("test while loop 1", function() {
			var results = computeContentAssist("var iii;\nwhile(ii === null) {\n}", "ii", 17);
			return testProposals(results, [
				["iii", "iii : {}"]
			]);
		});
		it("test while loop 2", function() {
			var results = computeContentAssist("var iii;\nwhile(this.ii === null) {\n}", "ii", 22);
			return testProposals(results, [
				["iii", "iii : {}"]
			]);
		});
		it("test while loop 3", function() {
			var results = computeContentAssist("var iii;\nwhile(iii === null) {this.ii\n}", "ii", 37);
			return testProposals(results, [
				["iii", "iii : {}"]
			]);
		});
		it("test catch clause 1", function() {
			var results = computeContentAssist("try { } catch (eee) {e  }", "e", 22);
			return testProposals(results, [
				["eee", "eee : Error"],
				["", "---------------------------------"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"]
			]);
		});
		it("test catch clause 2", function() {
			// the type of the catch variable is Error
			var results = computeContentAssist("try { } catch (eee) {\neee.me  }", "me", 28);
			return testProposals(results, [
				["message", "message : String"]
			]);
		});
	
	
		// TODO MS disabling this test.  It's not clear to me this is the desired behavior,
		// since we don't really have any idea if the global object will be passed as 'this'
		// it("test get global var"] = function() {
		// 	// should infer that we are referring to the globally defined xxx, not the param
		// 	var results = computeContentAssist("var xxx = 9;\nfunction fff(xxx) { this.xxx.toF}", "toF", 45);
		// 	return testProposals(results, [
		// 		["toFixed(digits)", "toFixed(digits) : Number"]
		// 	]);
		// };
	
		it("test get local var", function() {
			// should infer that we are referring to the locally defined xxx, not the global
			var results = computeContentAssist("var xxx = 9;\nfunction fff(xxx) { xxx.toF}", "toF", 40);
			return testProposals(results, [
			]);
		});
	
		it("test Math 1", function() {
			var results = computeContentAssist("Mat", "Mat");
			return testProposals(results, [
				["Math", "Math : Math"]
			]);
		});
		it("test Math 2", function() {
			var results = computeContentAssist("this.Mat", "Mat");
			return testProposals(results, [
				["Math", "Math : Math"]
			]);
		});
		it("test Math 3", function() {
			// Math not available when this isn't the global this
			var results = computeContentAssist("var ff = { f: this.Mat }", "Mat", 22);
			return testProposals(results, [
			]);
		});
		it("test Math 4", function() {
			var results = computeContentAssist("this.Math.E", "E");
			return testProposals(results, [
				["E", "E : Number"]
			]);
		});
		it("test JSON 4", function() {
			var results = computeContentAssist("this.JSON.st", "st");
			return testProposals(results, [
				["stringify(json)", "stringify(json) : String"]
			]);
		});
		it("test multi-dot inferencing 1", function() {
			var results = computeContentAssist("var a = \"\";\na.charAt().charAt().charAt().ch", "ch");
			return testProposals(results, [
				["charAt(index)", "charAt(index) : String"],
				["charCodeAt(index)", "charCodeAt(index) : Number"]
			]);
		});
		it("test multi-dot inferencing 2", function() {
			var results = computeContentAssist(
			"var zz = {};\nzz.zz = zz;\nzz.zz.zz.z", "z");
			return testProposals(results, [
				["zz", "zz : {zz:{zz:{...}}}"]
			]);
		});
		it("test multi-dot inferencing 3", function() {
			var results = computeContentAssist(
			"var x = { yy : { } };\nx.yy.zz = 1;\nx.yy.z", "z");
			return testProposals(results, [
				["zz", "zz : Number"]
			]);
		});
		it("test multi-dot inferencing 4", function() {
			var results = computeContentAssist(
			"var x = { yy : { } };\nx.yy.zz = 1;\nx.yy.zz.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test constructor 1", function() {
			var results = computeContentAssist(
			"function Fun() {\n	this.xxx = 9;\n	this.uuu = this.x;}", "x", 50);
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
		it("test constructor 2", function() {
			var results = computeContentAssist(
			"function Fun() {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var y = new Fun();\n" +
			"y.x", "x");
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
		it("test constructor 3", function() {
			var results = computeContentAssist(
			"function Fun() {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var y = new Fun();\n" +
			"y.xxx.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test constructor 3", function() {
			var results = computeContentAssist(
			"function Fun() {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var y = new Fun();\n" +
			"y.uuu.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test constructor 4", function() {
			var results = computeContentAssist(
			"var Fun = function () {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var y = new Fun();\n" +
			"y.uuu.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test constructor 5", function() {
			var results = computeContentAssist(
			"var x = { Fun : function () { this.xxx = 9;	this.uuu = this.xxx; } }\n" +
			"var y = new x.Fun();\n" +
			"y.uuu.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test constructor 6", function() {
			var results = computeContentAssist(
			"var x = { Fun : function () { this.xxx = 9;	this.uuu = this.xxx; } }\n" +
			"var y = new x.Fun().uuu.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test constructor 7", function() {
			var results = computeContentAssist(
			"var Fun = function () {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var x = { Fun : Fun };\n" +
			"var y = new x.Fun();\n" +
			"y.uuu.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test constructor 8", function() {
			var results = computeContentAssist(
			"var FunOrig = function () {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var x = { Fun : FunOrig };\n" +
			"var y = new x.Fun();\n" +
			"y.uuu.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		// functions should not be available outside the scope that declares them
		it("test constructor 9", function() {
			var results = computeContentAssist(
			"function outer() { function Inner() { }}\n" +
			"Inn", "Inn");
			return testProposals(results, [
				// TODO FIXADE adding all constructors to global scope.  not correct
				["Inner()", "Inner() : Inner"]
			]);
		});
	
		// should be able to reference functions using qualified name
		it("test constructor 10", function() {
			var results = computeContentAssist(
			"var outer = { Inner : function() { }}\n" +
			"outer.Inn", "Inn");
			return testProposals(results, [
				["Inner()", "Inner() : outer.Inner"]
			]);
		});
	
		it("test Function args 1", function() {
			var results = computeContentAssist(
			"var ttt, uuu;\nttt()", "", 18);
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["ttt", "ttt : {}"],
				["undefined", "undefined : undefined"],
				["uuu", "uuu : {}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test Function args 2", function() {
			var results = computeContentAssist(
			"var ttt, uuu;\nttt(ttt, )", "", 23);
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["ttt", "ttt : {}"],
				["undefined", "undefined : undefined"],
				["uuu", "uuu : {}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test Function args 3", function() {
			var results = computeContentAssist(
			"var ttt, uuu;\nttt(ttt, , uuu)", "", 23);
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["ttt", "ttt : {}"],
				["undefined", "undefined : undefined"],
				["uuu", "uuu : {}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		// check that function args don't get assigned the same type
		it("test function args 4", function() {
			var results = computeContentAssist(
				"function tt(aaa, bbb) { aaa.foo = 9;bbb.foo = ''\naaa.f}", "f", 54);
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
	
		// check that function args don't get assigned the same type
		it("test function args 5", function() {
			var results = computeContentAssist(
				"function tt(aaa, bbb) { aaa.foo = 9;bbb.foo = ''\nbbb.f}", "f", 54);
			return testProposals(results, [
				["foo", "foo : String"]
			]);
		});
	
		// FIXADE failing since we do not handle constructors that are not identifiers
	//	it("test constructor 5", function() {
	//		var results = computeContentAssist(
	//		"var obj = { Fun : function() {	this.xxx = 9;	this.uuu = this.xxx; } }\n" +
	//		"var y = new obj.Fun();\n" +
	//		"y.uuu.toF", "toF");
	//		return testProposals(results, [
	//			["toFixed(digits)", "toFixed(digits) : String"]
	//		]);
	//	});
		it("test constructor 6", function() {
			var results = computeContentAssist(
			"function Fun2() {\n function Fun() {	this.xxx = 9;	this.uuu = this.xxx; }\n var y = new Fun();\n y.uuu.toF}", "toF", 103);
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
	
		it("test nested object expressions 1", function() {
			var results = computeContentAssist(
			"var ttt = { xxx : { yyy : { zzz : 1} } };\n" +
			"ttt.xxx.y", "y");
			return testProposals(results, [
				["yyy", "yyy : {zzz:Number}"]
			]);
		});
		it("test nested object expressions 2", function() {
			var results = computeContentAssist(
			"var ttt = { xxx : { yyy : { zzz : 1} } };\n" +
			"ttt.xxx.yyy.z", "z");
			return testProposals(results, [
				["zzz", "zzz : Number"]
			]);
		});
		it("test nested object expressions 3", function() {
			var results = computeContentAssist(
			"var ttt = { xxx : { yyy : { zzz : 1} } };\n" +
			"ttt.xxx.yyy.zzz.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function expression 1", function() {
			var results = computeContentAssist(
			"var ttt = function(a, b, c) { };\ntt", "tt");
			return testProposals(results, [
				["ttt(a, b, c)", "ttt(a, b, c) : undefined"]
			]);
		});
		it("test function expression 2", function() {
			var results = computeContentAssist(
			"ttt = function(a, b, c) { };\ntt", "tt");
			return testProposals(results, [
				["ttt(a, b, c)", "ttt(a, b, c) : undefined"]
			]);
		});
		it("test function expression 3", function() {
			var results = computeContentAssist(
			"ttt = { rrr : function(a, b, c) { } };\nttt.rr", "rr");
			return testProposals(results, [
				["rrr(a, b, c)", "rrr(a, b, c) : undefined"]
			]);
		});
		it("test function expression 4", function() {
			var results = computeContentAssist(
			"var ttt = function(a, b) { };\nvar hhh = ttt;\nhhh", "hhh");
			return testProposals(results, [
				["hhh(a, b)", "hhh(a, b) : undefined"]
			]);
		});
		it("test function expression 4a", function() {
			var results = computeContentAssist(
			"function ttt(a, b) { };\nvar hhh = ttt;\nhhh", "hhh");
			return testProposals(results, [
				["hhh(a, b)", "hhh(a, b) : undefined"]
			]);
		});
		it("test function expression 5", function() {
			var results = computeContentAssist(
			"var uuu = {	flart : function (a,b) { } };\nhhh = uuu.flart;\nhhh", "hhh");
			return testProposals(results, [
				["hhh(a, b)", "hhh(a, b) : undefined"]
			]);
		});
		it("test function expression 6", function() {
			var results = computeContentAssist(
			"var uuu = {	flart : function (a,b) { } };\nhhh = uuu.flart;\nhhh.app", "app");
			return testProposals(results, [
				["apply(func, [argArray])", "apply(func, [argArray]) : Object"]
			]);
		});
	
		it("test globals 1", function() {
			var results = computeContentAssist("/*global faaa */\nfa", "fa");
			return testProposals(results, [
				["faaa", "faaa : {}"]
			]);
		});
		it("test globals 2", function() {
			var results = computeContentAssist("/*global  \t\n faaa \t\t\n faaa2  */\nfa", "fa");
			return testProposals(results, [
				["faaa", "faaa : {}"],
				["faaa2", "faaa2 : {}"]
			]);
		});
		it("test globals 3", function() {
			var results = computeContentAssist("/*global  \t\n faaa \t\t\n fass2  */\nvar t = 1;\nt.fa", "fa");
			return testProposals(results, [
			]);
		});
	
		it("test globals 4", function() {
			var results = computeContentAssist("/*global  \t\n faaa:true \t\t\n faaa2:false  */\nfa", "fa");
			return testProposals(results, [
				["faaa", "faaa : {}"],
				["faaa2", "faaa2 : {}"]
			]);
		});
	
		it("test globals 5", function() {
			var results = computeContentAssist("/*global  \t\n faaa:true, \t\t\n faaa2:false,  */\nfa", "fa");
			return testProposals(results, [
				["faaa", "faaa : {}"],
				["faaa2", "faaa2 : {}"]
			]);
		});
	
	
	
		////////////////////////////
		// tests for complex names
		////////////////////////////
		it("test complex name 1", function() {
			var results = computeContentAssist("function Ttt() { }\nvar ttt = new Ttt();\ntt", "tt");
			return testProposals(results, [
				["Ttt()", "Ttt() : Ttt"],
				["ttt", "ttt : Ttt"]
			]);
		});
		it("test complex name 2", function() {
			var results = computeContentAssist("var Ttt = function() { };\nvar ttt = new Ttt();\ntt", "tt");
			return testProposals(results, [
				["Ttt()", "Ttt() : Ttt"],
				["ttt", "ttt : Ttt"]
			]);
		});
		it("test complex name 3", function() {
			var results = computeContentAssist("var ttt = { };\ntt", "tt");
			return testProposals(results, [
				["ttt", "ttt : {}"]
			]);
		});
		it("test complex name 4", function() {
			var results = computeContentAssist("var ttt = { aa: 1, bb: 2 };\ntt", "tt");
			return testProposals(results, [
				["ttt", "ttt : {aa:Number,bb:Number}"]
			]);
		});
		it("test complex name 5", function() {
			var results = computeContentAssist("var ttt = { aa: 1, bb: 2 };\nttt.cc = 9;\ntt", "tt");
			return testProposals(results, [
				["ttt", "ttt : {aa:Number,bb:Number,cc:Number}"]
			]);
		});
	
		////////////////////////////
		// tests for broken syntax
		////////////////////////////
	
		it("test broken after dot 1", function() {
			var results = computeContentAssist("var ttt = { ooo:8};\nttt.", "");
			return testProposals(results, [
				["ooo", "ooo : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		it("test broken after dot 2", function() {
			var results = computeContentAssist("var ttt = { ooo:8};\nif (ttt.) { ttt }", "", "var ttt = { ooo:8};\nif (ttt.".length);
			return testProposals(results, [
				["ooo", "ooo : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		it("test broken after dot 3", function() {
			var results = computeContentAssist("var ttt = { ooo:this.};", "", "var ttt = { ooo:this.".length);
			return testProposals(results, [
				["ooo", "ooo : {ooo:{ooo:{...}}}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		// same as above, except use 
		it("test broken after dot 3a", function() {
			var results = computeContentAssist("var ttt = { ooo:this.};", "", 21);
			return testProposals(results, [
				["ooo", "ooo : {ooo:{ooo:{...}}}"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		it("test broken after dot 4", function() {
			var results = computeContentAssist("var ttt = { ooo:8};\nfunction ff() { \nttt.}", "", "var ttt = { ooo:8};\nfunction ff() { \nttt.".length);
			return testProposals(results, [
				["ooo", "ooo : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
		// same as above, except use 
		it("test broken after dot 4a", function() {
			var results = computeContentAssist("var ttt = { ooo:8};\nfunction ff() { \nttt.}", "", 41);
			return testProposals(results, [
				["ooo", "ooo : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		it("test broken after dot 5", function() {
			var results = computeContentAssist(
				"var first = {ooo:9};\n" +
				"first.\n" +
				"var jjj;", "",
	
				("var first = {ooo:9};\n" +
				"first.").length);
	
			return testProposals(results, [
				["ooo", "ooo : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
	
		it("test broken after dot 6", function() {
			var results = computeContentAssist(
				"var first = {ooo:9};\n" +
				"first.\n" +
				"if (x) { }", "",
	
				("var first = {ooo:9};\n" +
				"first.").length);
	
			return testProposals(results, [
				["ooo", "ooo : Number"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		// test return types of various simple functions
		it("test function return type 1", function() {
			var results = computeContentAssist(
				"var first = function() { return 9; };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type 1a", function() {
			// complete on a function, not a number
			var results = computeContentAssist(
				"var first = function() { return 9; };\nfirst.arg", "arg");
			return testProposals(results, [
				["arguments", "arguments : Arguments"]
			]);
		});
	
		it("test function return type 2", function() {
			var results = computeContentAssist(
				"function first() { return 9; };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type 3", function() {
			var results = computeContentAssist(
				"var obj = { first : function () { return 9; } };\nobj.first().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type 4", function() {
			var results = computeContentAssist(
				"function first() { return { ff : 9 }; };\nfirst().ff.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type 5", function() {
			var results = computeContentAssist(
				"function first() { return function() { return 9; }; };\nvar ff = first();\nff().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type 6", function() {
			var results = computeContentAssist(
				"function first() { return function() { return 9; }; };\nfirst()().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		// now test different ways that functions can be constructed
		it("test function return type if 1", function() {
			var results = computeContentAssist(
				"function first() { if(true) { return 8; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type if 2", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { if(true) { return ''; } else  { return 8; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type while", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { while(true) { return 1; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type do/while", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { do { return 1; } while(true); };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type for", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { for (var i; i < 10; i++) { return 1; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type for in", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { for (var i in k) { return 1; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type try 1", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { try { return 1; } catch(e) { } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type try 2", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { try { return 1; } catch(e) { } finally { } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type try 3", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { try { return ''; } catch(e) { return 9; } finally { } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type try 4", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { try { return ''; } catch(e) { return ''; } finally { return 9; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type switch 1", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { switch (v) { case a: return 9; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type switch 2", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { switch (v) { case b: return ''; case a: return 1; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type switch 3", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { switch (v) { case b: return ''; default: return 1; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type nested block 1", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { while(true) { a;\nb\n;return 9; } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test function return type nest block 2", function() {
			// always choose the last return statement
			var results = computeContentAssist(
				"function first() { while(true) { while(false) { \n;return 9; } } };\nfirst().toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test function return type obj literal 1", function() {
			var results = computeContentAssist(
				"function first() { return { a : 9, b : '' }; };\nfir", "fir");
			return testProposals(results, [
				["first()", "first() : {a:Number,b:String}"]
			]);
		});
	
		it("test function return type obj literal 2", function() {
			var results = computeContentAssist(
				"function first () {" +
				"	return function () {\n" +
				"		var a = { a : 9, b : '' };\n" +
				"		return a;\n" +
				"	}\n" +
				"}\nfir", "fir");
			return testProposals(results, [
				["first()", "first() : function():{a:Number,b:String}"]
			]);
		});
		it("test function return type obj literal 3", function() {
			var results = computeContentAssist(
				"function first () {" +
				"	return function () {\n" +
				"		var a = { a : 9, b : '' };\n" +
				"		return a;\n" +
				"	}\n" +
				"}\nfirst().ar", "ar");
			return testProposals(results, [
				["arguments", "arguments : Arguments"]
			]);
		});
		it("test function return type obj literal 4", function() {
			var results = computeContentAssist(
				"function first () {" +
				"	return function () {\n" +
				"		var a = { aa : 9, b : '' };\n" +
				"		return a;\n" +
				"	}\n" +
				"}\nfirst()().a", "a");
			return testProposals(results, [
				["aa", "aa : Number"]
			]);
		});
	
		///////////////////////////////////////////////
		// Some tests for implicitly defined variables
		///////////////////////////////////////////////
	
		// should see xxx as an object
		it("test implicit1", function() {
			var results = computeContentAssist(
				"xxx;\nxx", "xx");
			return testProposals(results, [
				["xxx", "xxx : {}"]
			]);
		});
	
		it("test implicit2", function() {
			var results = computeContentAssist(
				"xxx.yyy = 0;\nxxx.yy", "yy");
			return testProposals(results, [
				["yyy", "yyy : Number"]
			]);
		});
	
		it("test implicit3", function() {
			var results = computeContentAssist(
				"xxx;\n xxx.yyy = 0;\nxxx.yy", "yy");
			return testProposals(results, [
				["yyy", "yyy : Number"]
			]);
		});
	
		it("test implicit4", function() {
			var results = computeContentAssist(
				"xxx = 0;\nxx", "xx");
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
	
		// implicits are available in the global scope
		it("test implicit5", function() {
			var results = computeContentAssist(
				"function inner() { xxx = 0; }\nxx", "xx");
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
	
		// implicits are available in the global scope
		it("test implicit6", function() {
			var results = computeContentAssist(
				"var obj = { foo : function inner() { xxx = 0; } }\nxx", "xx");
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
	
		// should see an implicit even if it comes after the invocation location
		it("test implicit7", function() {
			var results = computeContentAssist(
				"xx \nxxx", "xx", 2);
			return testProposals(results, [
				["xxx", "xxx : {}"]
			]);
		});
	
		it("test implicit8", function() {
			var results = computeContentAssist(
				"var xxx;\nvar obj = { foo : function inner() { xxx = 0; } }\nxx", "xx");
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
	
	
		// not really an implicit variable, but
		it("test implicit9", function() {
			var results = computeContentAssist(
				"xxx", "xxx");
			return testProposals(results, [
			]);
		});
	
	
		///////////////////////////////////////////////
		// Binary and unary expressions
		///////////////////////////////////////////////
		it("test binary expr1", function() {
			var results = computeContentAssist(
				"(1 + 2).toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr2", function() {
			var results = computeContentAssist(
				"(1 + '').char", "char");
			return testProposals(results, [
				["charAt(index)", "charAt(index) : String"],
				["charCodeAt(index)", "charCodeAt(index) : Number"]
			]);
		});
		it("test binary expr3", function() {
			var results = computeContentAssist(
				"('' + 2).char", "char");
			return testProposals(results, [
				["charAt(index)", "charAt(index) : String"],
				["charCodeAt(index)", "charCodeAt(index) : Number"]
			]);
		});
		it("test binary expr4", function() {
			var results = computeContentAssist(
				"('' + hucairz).char", "char");
			return testProposals(results, [
				["charAt(index)", "charAt(index) : String"],
				["charCodeAt(index)", "charCodeAt(index) : Number"]
			]);
		});
		it("test binary expr5", function() {
			var results = computeContentAssist(
				"(hucairz + hucairz).toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr6", function() {
			var results = computeContentAssist(
				"(hucairz - hucairz).toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr7", function() {
			var results = computeContentAssist(
				"('' - '').toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr8", function() {
			var results = computeContentAssist(
				"('' & '').toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr9", function() {
			var results = computeContentAssist(
				"({ a : 9 } && '').a.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr10", function() {
			var results = computeContentAssist(
				"({ a : 9 } || '').a.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test binary expr11", function() {
			var results = computeContentAssist(
				"var aaa = function() { return hucairz || hucairz; }\naa", "aa");
			return testProposals(results, [
				["aaa()", "aaa() : {}"]
			]);
		});
		it("test binary expr12", function() {
			var results = computeContentAssist(
				"var aaa = function() { return hucairz | hucairz; }\naa", "aa");
			return testProposals(results, [
				["aaa()", "aaa() : Number"]
			]);
		});
		it("test binary expr12", function() {
			var results = computeContentAssist(
				"var aaa = function() { return hucairz == hucairz; }\naa", "aa");
			return testProposals(results, [
				["aaa()", "aaa() : Boolean"]
			]);
		});
	
		it("test unary expr1", function() {
			var results = computeContentAssist(
				"(x += y).toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test unary expr2", function() {
			var results = computeContentAssist(
				"(x += 1).toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test unary expr3", function() {
			var results = computeContentAssist(
				"var x = '';\n(x += 1).char", "char");
			return testProposals(results, [
				["charAt(index)", "charAt(index) : String"],
				["charCodeAt(index)", "charCodeAt(index) : Number"]
			]);
		});
		it("test unary expr4", function() {
			var results = computeContentAssist(
				"var aaa = function() { return !hucairz; }\naa", "aa");
			return testProposals(results, [
				["aaa()", "aaa() : Boolean"]
			]);
		});
	
		///////////////////////////////////////////////
		// Mucking around with a constructor function's prototype
		///////////////////////////////////////////////
		it("test constructor prototype1", function() {
			var results = computeContentAssist(
				"var AAA = function() { };\nAAA.prototype.foo = 9;\nnew AAA().f", "f");
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
		/* constructors */
		it("test constructor prototype2", function() {
			var results = computeContentAssist(
				"var AAA = function() { };\nAAA.prototype = { foo : 9 };\nnew AAA().f", "f");
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
		
		/* constructors */
		it("test constructor prototype3", function() {
			var results = computeContentAssist(
				"var AAA = function() { this.foo = 0; };\nAAA.prototype = { foo : '' };\nnew AAA().f", "f");
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
		
		/* constructors */
		it("test constructor prototype4", function() {
			var results = computeContentAssist(
				"var AAA = function() { };\nAAA.prototype = { foo : 9 };\nvar x = new AAA();\n x.f", "f");
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
		
		/* constructors */
		it("test constructor prototype5", function() {
			var results = computeContentAssist(
				"var AAA = function() { };\nAAA.prototype = { foo : '' };\nvar x = new AAA();\nx.foo = 9;\nx.f", "f");
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
		
		/* constructors */
		it("test constructor prototype6", function() {
			var results = computeContentAssist(
				"var Fun = function() { };\n" +
				"var obj = new Fun();\n" +
				"Fun.prototype.num = 0;\n" +
				"obj.n", "n");
			return testProposals(results, [
				["num", "num : Number"]
			]);
		});
		
		/* constructors */
		it("test dotted constructor1", function() {
			var results = computeContentAssist(
				"var obj = { Fun : function() { }, fun : function() {}, fun2 : 9 }\nnew obj", "obj");
			return testProposals(results, [
				["obj.Fun()", "obj.Fun() : obj.Fun"],
				["Object([val])", "Object([val]) : Object"],
				["obj", "obj : {Fun:function(new:obj.Fun):obj.Fun,fun:function(),fun2:Number}"]
			]);
		});
		
		/* constructors */
		it("test dotted constructor2", function() {
			var results = computeContentAssist(
				"var obj = { Fun : function() { } }\nnew obj.F", "F");
			return testProposals(results, [
				["Fun()", "Fun() : obj.Fun"]
			]);
		});
		
		/* constructors */
		it("test dotted constructor3", function() {
			var results = computeContentAssist(
				"var obj = { };\nobj.Fun = function() { };\nnew obj", "obj");
			return testProposals(results, [
				["obj.Fun()", "obj.Fun() : obj.Fun"],
				["Object([val])", "Object([val]) : Object"],
				["obj", "obj : {Fun:function(new:obj.Fun):obj.Fun}"]
			]);
		});
		
		/* constructors */
		it("test dotted constructor4", function() {
			var results = computeContentAssist(
				"var obj = { inner : { Fun : function() { } } }\nnew obj", "obj");
			return testProposals(results, [
				["obj.inner.Fun()", "obj.inner.Fun() : obj.inner.Fun"],
				["Object([val])", "Object([val]) : Object"],
				["obj", "obj : {inner:{Fun:function(new:obj.inner.Fun):obj.inner.Fun}}"]
			]);
		});
		
		/* constructors */
		it("test dotted constructor5", function() {
			var results = computeContentAssist(
				"var obj = { inner : {} }\nobj.inner.Fun = function() { }\nnew obj", "obj");
			return testProposals(results, [
				["obj.inner.Fun()", "obj.inner.Fun() : obj.inner.Fun"],
				["Object([val])", "Object([val]) : Object"],
				["obj", "obj : {inner:{Fun:function(new:obj.inner.Fun):obj.inner.Fun}}"]
	
			]);
		});
		
		/* constructors */
		it("test dotted constructor6", function() {
			var results = computeContentAssist(
				"var obj = { inner : {} }\nobj.inner.inner2 = { Fun : function() { } }\nnew obj", "obj");
			return testProposals(results, [
				["obj.inner.inner2.Fun()", "obj.inner.inner2.Fun() : obj.inner.inner2.Fun"],
				["Object([val])", "Object([val]) : Object"],
				["obj", "obj : {inner:{inner2:{...}}}"]
			]);
		});
	
		// assign to another---should only have one proposal since we don't change the type name
		it("test dotted constructor7", function() {
			var results = computeContentAssist(
				"var obj = { inner : { Fun : function() { }  } }\n" +
				"var other = obj\n" +
				"new other.inner", "inner");
			return testProposals(results, [
				["inner", "inner : {Fun:function(new:obj.inner.Fun):obj.inner.Fun}"]
			]);
		});
	
		// assign sub-part to another---should only have one proposal since we don't change the type name
		it("test dotted constructor8", function() {
			var results = computeContentAssist(
				"var obj = { inner : { Fun : function() { } } }\n" +
				"var other = obj.inner\n" +
				"new other", "other");
			return testProposals(results, [
				["other", "other : {Fun:function(new:obj.inner.Fun):obj.inner.Fun}"]
			]);
		});
	
		// overloaded constructors
		it("test dotted constructor9", function() {
			var results = computeContentAssist(
				"var obj = { Fun : function() { this.yy1 = 9; } }\n" +
				"var obj2 = { Fun : function() { this.yy2 = 9; } }\n" +
				"var xxx = new obj.Fun();\n" +
				"xxx.yy", "yy");
			return testProposals(results, [
				["yy1", "yy1 : Number"]
			]);
		});
		
		/* constructors */
		it("test dotted constructor10", function() {
			var results = computeContentAssist(
				"var obj = { Fun : function() { } }\nobj.Fun.prototype = { yy1 : 9};\n" +
				"var obj2 = { Fun : function() { } }\nobj2.Fun.prototype = { yy2 : 9};\n" +
				"var xxx = new obj.Fun();\n" +
				"xxx.yy", "yy");
			return testProposals(results, [
				["yy1", "yy1 : Number"]
			]);
		});
	
		// constructor declared inside a function should not be available externally
		it("test constructor in function", function() {
			var results = computeContentAssist(
				"var obj = function() { var Fn = function() { }; };\n" +
				"new Fn", "Fn");
			return testProposals(results, [
			]);
		});
	
		// TODO FIXADE this is wrong, but we're still going to test it
		// constructor declared as a member available in global scope
		// TODO MS disabled this test now.  I don't think we want this behavior
	//	it("test constructor in constructor BAD", function() {
	//		var results = computeContentAssist(
	//			"var obj = function() { this.Fn = function() { }; };\n" +
	//			"new Fn", "Fn");
	//		return testProposals(results, [
	//			["Fn()", "Fn() : obj.Fn"]
	//		]);
	//	});
	
		// Not ideal, but a constructor being used from a constructed object is not dotted, but should be
		it("test constructor in constructor Not Ideal", function() {
			var results = computeContentAssist(
				"function Fun() { this.Inner = function() { }}\n" +
				"var f = new Fun()\n" +
				"new f.Inner", "Inner");
			return testProposals(results, [
				// should be Fun.Inner, but is not
				["Inner()", "Inner() : Inner"]
			]);
		});
	
	
	
	
		// should not be able to redefine or add to global types
		it("test global redefine1", function() {
			var results = computeContentAssist(
				"this.JSON = {};\n" +
				"JSON.st", "st");
			return testProposals(results, [
				["stringify(json)", "stringify(json) : String"]
			]);
		});
		// should not be able to redefine or add to global types
		it("test global redefine2", function() {
			var results = computeContentAssist(
				"this.JSON.stFOO;\n" +
				"JSON.st", "st");
			return testProposals(results, [
				["stringify(json)", "stringify(json) : String"]
			]);
		});
	
		// browser awareness
		it("test browser1", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"win", "win"
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
		
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test browser eslint-env 1", function() {
			var results = computeContentAssist(
				"/*eslint-env browser*/\n" +
				"win", "win"
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
		
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test browser eslint-env 2", function() {
			var results = computeContentAssist(
				"/*eslint-env browser*/\n" +
				"JSON.st", "st");
			return testProposals(results, [
				["stringify(json)", "stringify(json) : String"]
			]);
		});
		
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test browser eslint-env 3", function() {
			var results = computeContentAssist(
				"/*eslint-env browser node*/\n" +
				"win", "win"
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test browser eslint-env 4", function() {
			var results = computeContentAssist(
				"/*eslint-env node browser*/\n" +
				"win", "win"
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
		
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test browser eslint-env 5", function() {
			var results = computeContentAssist(
				"/*eslint-env */\n" +
				"win", "win", null, {options:{browser:true}}
			);
			return testProposals(results, []);
		});
		
		// browser awareness
		it("test browser2", function() {
			var results = computeContentAssist(
				"/*jslint browser:false*/\n" +
				"win", "win"
			);
			// should get nothing since not in browser mode
			return testProposals(results, [
				
			]);
		});
	       
		// regular stuff should still work in the browser
		it("test browser3", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"JSON.st", "st");
			return testProposals(results, [
				["stringify(json)", "stringify(json) : String"]
			]);
		});
	
		// browser awareness
		it("test browser4", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"locatio", "locatio"
			);
			return testProposals(results, [
				["location", "location : Location"],
				["locationbar", "locationbar : BarInfo"]
			]);
		});
	
		// browser awareness
		it("test browser5", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				// should not be able to set a default property
				"location = 5\n" +
				"locatio", "locatio"
			);
			return testProposals(results, [
				["location", "location : Location"],
				["locationbar", "locationbar : BarInfo"]
			]);
		});
	
		// browser awareness
		it("test browser6", function() {
			var results = computeContentAssist(
				"/*global location*/\n" +
				"/*jslint browser:true*/\n" +
				"locatio", "locatio"
			);
			return testProposals(results, [
				["location", "location : Location"],
				["locationbar", "locationbar : BarInfo"]
			]);
		});
	
		// browser awareness
		it("test browser7", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"window.xx = 9;\nx", "x"
			);
			return testProposals(results, [
				["XMLHttpRequest()", "XMLHttpRequest() : XMLHttpRequest"],
				["xx", "xx : Number"]
			]);
		});
	
		// browser awareness
		it("test browser8", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"var xx = 9;\nwindow.x", "x"
			);
			return testProposals(results, [
				["XMLHttpRequest()", "XMLHttpRequest() : XMLHttpRequest"],
				["xx", "xx : Number"]
			]);
		});
	
		// browser awareness
		it("test browser9", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"var xx = 9;\nthis.x", "x"
			);
			return testProposals(results, [
				["XMLHttpRequest()", "XMLHttpRequest() : XMLHttpRequest"],
				["xx", "xx : Number"]
			]);
		});
	
		// browser takes higher precedence than node
		it("test browser11", function() {
			var results = computeContentAssist(
				"/*jslint browser:true node:true*/\n" +
				"win", "win"
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
		// browser takes higher precedence than node
		it("test browser12", function() {
			var results = computeContentAssist(
				"/*jslint node:true browser:true */\n" +
				"win", "win"
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
		// configuration from lint options
		it("test browser13", function() {
			var results = computeContentAssist(
				"win", "win", null, {options:{browser:true}}
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
	
		// configuration from lint options overridden by options
		it("test browser14", function() {
			var results = computeContentAssist(
				"/*jslint browser:false */\n" +
				"win", "win", null, {options:{browser:true}}
			);
			return testProposals(results, []);
		});
	
		// browser awareness
		it("test browser15", function() {
			var results = computeContentAssist(
				"/*jslint browser:true */\n" +
				"var w = window.open();\n" +
				"w.document.ffff", "ffff");
			return testProposals(results, []);
		});
	
		// Node awareness
		it("test node1", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"glo", "glo"
			);
			return testProposals(results, [
				["global", "global : Global"]
			]);
		});
	
	    /**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test node eslint-env 1", function() {
			var results = computeContentAssist(
				"/*eslint-env node*/\n" +
				"glo", "glo"
			);
			return testProposals(results, [
				["global", "global : Global"]
			]);
		});
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test node eslint-env 2", function() {
			var results = computeContentAssist(
				"/*eslint-env */\n" +
				"glo", "glo", null, {options:{node:true}}
			);
			return testProposals(results, []);
		});
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test node eslint-env 3", function() {
			var results = computeContentAssist(
				"/*eslint-env amd*/\n" +
				"require(\"fs\").mk", "mk"
			);
			return testProposals(results, []);
		});
		/**
		 * Tests support for the eslint-env directive to find global objects
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=439056
		 * @since 7.0
		 */
		it("test node eslint-env 4", function() {
			var results = computeContentAssist(
				"/*eslint-env browser*/\n" +
				"require(\"fs\").mk", "mk"
			);
			return testProposals(results, []);
		});
		
		// node awareness
		it("test node2", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"process", "process"
			);
			return testProposals(results, [
				["process", "process : Process"]
			]);
		});
	
		// node awareness
		it("test node3", function() {
			var results = computeContentAssist(
				"/*jslint browser:false node:true*/\n" +
				"glo", "glo"
			);
			return testProposals(results, [
				["global", "global : Global"]
			]);
		});
	
		// node awareness
		it("test node4", function() {
			var results = computeContentAssist(
				"/*jslint node:false*/\n" +
				"glo", "glo"
			);
			return testProposals(results, []);
		});
	
		// node awareness
		it("test node5", function() {
			var results = computeContentAssist(
				"/*jslint node:false*/\n" +
				"var stream = require('stream');\n" +
				"var s = new stream.Stream();\n" +
				"s.foo = 9;\n" +
				"s.foo", "foo"
			);
			return testProposals(results, [
			]);
		});
	
		// just checking that our regex works
		it("test node6", function() {
			var results = computeContentAssist(
				"/*jslint node: xxx true*/\n" +
				"glo", "glo"
			);
			return testProposals(results, []);
		});
	
		// just checking that our regex works
		it("test node7", function() {
			var results = computeContentAssist(
				"/*jslint node  xxxx : true*/\n" +
				"glo", "glo"
			);
			return testProposals(results, []);
		});
	
		// configuration from .scripted
		it("test node8", function() {
			var results = computeContentAssist(
				"glo", "glo", null, {options:{node:true}}
			);
			return testProposals(results, [
				["global", "global : Global"]
			]);
		});
	
		// configuration from .scripted is overridden by in file comments
		it("test node9", function() {
			var results = computeContentAssist(
				"/*jslint node:false*/\n" +
				"glo", "glo", null, {options:{node:true}}
			);
			return testProposals(results, []);
		});
	
		// configuration from .scripted is overridden by in file comments
		it("test node10", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"glo", "glo", null, {options:{browser:true}}
			);
			return testProposals(results, [
				["global", "global : Global"]
			]);
		});
	
		// configuration from .scripted is overridden by in file comments
		it("test node11", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"win", "win", null, {options:{node:true}}
			);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
		// node awareness
		it("test node12", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"process.", ""
			);
			// just testing that we don't crash
			return results.then(function () {});
		});
	
		// node awareness
		it("test node13", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"var x = require(\"fs\");\n" +
				"x.o", "o"
			);
			return testProposals(results, [
				["open(path, flags, mode, callback)", "open(path, flags, mode, callback)"],
				["openSync(path, flags, [mode])", "openSync(path, flags, [mode]) : Number"]	
			]);
		});
		
		// node awareness
		it("test node14", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"process.stdout.wr", "wr"
			);
			return testProposals(results, [
				["write(chunk, [encoding], [callback])", "write(chunk, [encoding], [callback]) : Boolean"]
			]);
		});
	
		// node awareness
		it("test node15", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"require('buffer').IN", "IN"
			);
			return testProposals(results, [
				["INSPECT_MAX_BYTES", "INSPECT_MAX_BYTES : Number"]
			]);
		});
	
		// node awareness
		it("test node16", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"var x = new Buffer(10);\n" +
				"x.c", "c"
			);
			return testProposals(results, [
				["copy(targetBuffer, [targetStart], [sourceStart], [sourceEnd])", "copy(targetBuffer, [targetStart], [sourceStart], [sourceEnd])"]
			]);
		});
	
		// node awareness
		it("test node17", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"var x = new Buffer(10);\n" +
				"x.c", "c"
			);
			return testProposals(results, [
				["copy(targetBuffer, [targetStart], [sourceStart], [sourceEnd])", "copy(targetBuffer, [targetStart], [sourceStart], [sourceEnd])"]
			]);
		});
	
		// node awareness
		it("test node18", function() {
			var results = computeContentAssist(
				"/*jslint node:true*/\n" +
				"Buffer.is", "is"
			);
			return testProposals(results, [
				["isBuffer(obj)", "isBuffer(obj)"],
				["isEncoding(encoding)", "isEncoding(encoding)"]
			]);
		});
	
		// node awareness
		it("test node19 - proposals shown for Node core module when no lint option", function() {
			var results = computeContentAssist(
				"\n" +
				"require(\"fs\").mk", "mk"
			);
			return testProposals(results, [
				["mkdir(path, mode, callback)", "mkdir(path, mode, callback)"],
				["mkdirSync(path, [mode])", "mkdirSync(path, [mode])"]
			]);
		});
		
		// node awareness
		it("test node20 - proposals NOT shown for Node core module when `amd:true`", function() {
			var results = computeContentAssist(
				"/*jslint amd:true*/\n" +
				"require(\"fs\").mk", "mk"
			);
			return testProposals(results, []);
		});
		
		// node awareness
		it("test node21 - proposals NOT shown for Node core module when `browser:true`", function() {
			var results = computeContentAssist(
				"/*jslint browser:true*/\n" +
				"require(\"fs\").mk", "mk"
			);
			return testProposals(results, []);
		});
	
		////////////////////////////////////////
		// jsdoc tests
		////////////////////////////////////////
		if (!doctrine.isStub) {
			// the basics
			it("test simple jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type Number*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
			
			//jsdoc test
			it("test simple jsdoc2", function() {
				var results = computeContentAssist(
					"/** @type String*/\n" +
					"/** @type Number*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
			
			//jsdoc test
			it("test simple jsdoc3", function() {
				var results = computeContentAssist(
					"/** @type Number*/\n" +
					"/* @type String*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
			
			//jsdoc test
			it("test simple jsdoc4", function() {
				var results = computeContentAssist(
					"/** @type Number*/\n" +
					"// @type String\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			// This is actually a bug.  We incorrectly recognize //* comments as jsdoc coments
			it("test simple jsdoc5", function() {
				var results = computeContentAssist(
					"/** @type Number*/\n" +
					"//* @type String\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : String"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc6", function() {
				var results = computeContentAssist(
					"/** @type String*/\n" +
					"var yy;\n" +
					"/** @type Number*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc7", function() {
				var results = computeContentAssist(
					"/** @type String*/" +
					"var yy;" +
					"/** @type Number*/" +
					"var xx;x", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc8", function() {
				var results = computeContentAssist(
					"/** @returns String\n@type Number*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc9", function() {
				var results = computeContentAssist(
					"/** @param String f\n@type Number*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc10", function() {
				var results = computeContentAssist(
					"/** @return Number*/\n" +
					"var xx = function() { };\nx", "x"
				);
				return testProposals(results, [
					["xx()", "xx() : Number"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc11", function() {
				var results = computeContentAssist(
					"/** @type String\n@return Number*/\n" +
					"var xx = function() { };\nx", "x"
				);
				return testProposals(results, [
					["xx()", "xx() : Number"]
				]);
			});
	
			// @type overrides @return
			it("test simple jsdoc12", function() {
				var results = computeContentAssist(
					"var xx;\n" +
					"/** @type String\n@return Number*/\n" +
					"xx = function() { };\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : String"]
				]);
			});
	
			// @type overrides @return
			it("test simple jsdoc13", function() {
				var results = computeContentAssist(
					"var xx;\n /** @type String\n@param Number ss*/\n xx = function(yy) { y };", "y", 67);
				return testProposals(results, [
					["yy", "yy : {}"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc15", function() {
				var results = computeContentAssist(
					"var xx;\n /** @param Number ss\n@return String*/\n xx = function(yy) { y };", "y", 69);
				return testProposals(results, [
					["yy", "yy : {}"]
				]);
			});
	
			//jsdoc test
			it("test simple jsdoc14", function() {
				var results = computeContentAssist(
					"/** @type Number*/\n" +
					"var xx;\n" +
					"/** @type String*/\n" +
					"xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			// the complex types tag
			it("test type union jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {String|Number}*/\n" +
					"var xx;\nx", "x"
				);
				// for union types, we arbitrarily choose the first type
				return testProposals(results, [
					["xx", "xx : (String|Number)"]
				]);
			});
	
			//jsdoc test
			it("test type nullable jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {?String}*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : ?String"]
				]);
			});
	
			//jsdoc test
			it("test type non-nullable jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {!String}*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : !String"]
				]);
			});
	
			//jsdoc test
			it("test type array jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {[]}*/\n" +
					"var xx;\nx", "x"
				);
				return testProposals(results, [
					["xx", "xx : []"]
				]);
			});
	
			//jsdoc test
			it("test type parameterized jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {Array.<String>}*/\n" +
					"var xx;\nx", "x"
				);
				// currently, we just ignore parameterization
				return testProposals(results, [
					["xx", "xx : Array.<String>"]
				]);
			});
			
			//jsdoc test
			it("test type parameterized jsdoc1a", function() {
				var results = computeContentAssist(
					"/** @type {[String]}*/\n" +
					"var xx;\nx", "x"
				);
				// currently, we just ignore parameterization
				return testProposals(results, [
					["xx", "xx : [String]"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {{foo}}*/\n" +
					"var xx;\nxx.fo", "fo"
				);
				return testProposals(results, [
					["foo", "foo : Object"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc2", function() {
				var results = computeContentAssist(
					"/** @type {{foo:String}}*/\n" +
					"var xx;\nxx.fo", "fo"
				);
				return testProposals(results, [
					["foo", "foo : String"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc3", function() {
				var results = computeContentAssist(
					"/** @type {{foo:string,foo2:number}}*/\n" +
					"var xx;\nxx.fo", "fo"
				);
				return testProposals(results, [
					["foo", "foo : String"],
					["foo2", "foo2 : Number"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc4", function() {
				var results = computeContentAssist(
					"/** @type {{foo:{foo2:number}}}*/\n" +
					"var xx;\nxx.foo.fo", "fo"
				);
				return testProposals(results, [
					["foo2", "foo2 : Number"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc5", function() {
				var results = computeContentAssist(
					"function Flart() { this.xx = 9; }\n" +
					"/** @type {{foo:{foo2:Flart}}}*/\n" +
					"var xx;\nxx.foo.foo2.x", "x"
				);
				return testProposals(results, [
					["xx", "xx : Number"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc6", function() {
				var results = computeContentAssist(
					"/** @type {{foo:{foo:function()}}}*/\n" +
					"var xx;\nxx.foo.foo", "foo"
				);
				return testProposals(results, [
					["foo()", "foo() : undefined"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc7", function() {
				var results = computeContentAssist(
					"/** @type {{foo:{foo:function(a:String,b:Number)}}}*/\n" +
					"var xx;\nxx.foo.foo", "foo"
				);
				return testProposals(results, [
					["foo(a, b)", "foo(a, b) : undefined"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc8", function() {
				var results = computeContentAssist(
					"/** @type {{foo:{foo:function(a:String,b:Number):Number}}}*/\n" +
					"var xx;\nxx.foo.foo", "foo"
				);
				return testProposals(results, [
					["foo(a, b)", "foo(a, b) : Number"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc9", function() {
				var results = computeContentAssist(
					"/** @type {{foo:{foo:function(a:String,b:Number):{len:Number}}}}*/\n" +
					"var xx;\nxx.foo.foo", "foo"
				);
				return testProposals(results, [
					["foo(a, b)", "foo(a, b) : {len:Number}"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc10", function() {
				var results = computeContentAssist(
					"/** @type {{foo:function(a:String,b:Number):{len:function():Number}}}*/\n" +
					"var xx;\nxx.foo().le", "le"
				);
				return testProposals(results, [
					["len()", "len() : Number"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc11", function() {
				var results = computeContentAssist(
					"/** @type {{foo:function():IDontExist}}*/\n" +
					"var xx;\nxx.fo", "fo"
				);
				return testProposals(results, [
					["foo()", "foo() : Object"]
				]);
			});
	
			//jsdoc test
			it("test type record jsdoc12", function() {
				var results = computeContentAssist(
					"var Flart = function() {}" +
					"/** @type {{foo:function(new:Flart):Number}}*/\n" +
					"var xx;\nxx.fo", "fo"
				);
				return testProposals(results, [
					// should we be returning Flart here???
	//				["foo()", "foo() : Flart"]
					["foo()", "foo() : Number"]
				]);
			});
	
			// the param tag
			it("test param jsdoc1", function() {
				var results = computeContentAssist(
					"/** @param {String} xx1\n@param {Number} xx2 */ var flart = function(xx1,xx2) { xx }", "xx", 81);
				return testProposals(results, [
					["xx1", "xx1 : String"],
					["xx2", "xx2 : Number"]
				]);
			});
	
			//jsdoc test
			it("test param jsdoc2", function() {
				var results = computeContentAssist(
					"/** @param {Number} xx2\n@param {String} xx1\n */ var flart = function(xx1,xx2) { xx }",
					"xx", 82);
				return testProposals(results, [
					["xx1", "xx1 : String"],
					["xx2", "xx2 : Number"]
				]);
			});
	
			//jsdoc test
			it("test param jsdoc3", function() {
				var results = computeContentAssist(
					"/** @param {function(String,Number):Number} xx2\n */ var flart = function(xx1,xx2) { xx }",
					"xx", 86);
				return testProposals(results, [
					["xx2(String, Number)", "xx2(String, Number) : Number"],
					["xx1", "xx1 : {}"]
				]);
			});
	
			//jsdoc test
			it("test param jsdoc4", function() {
				var results = computeContentAssist(
					"/** @param {function(a:String,Number):Number} xx2\n */ var flart = function(xx1,xx2) { xx }",
					"xx", 88);
				return testProposals(results, [
					["xx2(a, Number)", "xx2(a, Number) : Number"],
					["xx1", "xx1 : {}"]
				]);
			});
	
			//jsdoc test
			it("test param jsdoc5", function() {
				var results = computeContentAssist(
					"/** @param {function(a:String,?Number):Number} xx2\n */ var flart = function(xx1,xx2) { xx }",
					"xx", 89);
				return testProposals(results, [
					["xx2(a, arg1)", "xx2(a, arg1) : Number"],
					["xx1", "xx1 : {}"]
				]);
			});
	
			// the return tag
			it("test return jsdoc1", function() {
				var results = computeContentAssist(
					"/** @return {function(a:String,?Number):Number} xx2\n */" +
					"var flart = function(xx1,xx2) { }\nflar",
					"flar");
				// hmmmm... functions returning functions not really showing up
				return testProposals(results, [
					["flart(xx1, xx2)", "flart(xx1, xx2) : function(a:String,?Number):Number"]
				]);
			});
	
			//jsdoc test
			it("test return jsdoc2", function() {
				var results = computeContentAssist(
					"/** @return {function(String):Number} xx2\n */" +
					"var flart = function(xx1,xx2) { }\n" +
					"var other = flart();\noth", "oth");
				return testProposals(results, [
					["other(String)", "other(String) : Number"]
				]);
			});
	
			// reassignment
			it("test reassignment jsdoc1", function() {
				var results = computeContentAssist(
					"/** @type {Number} xx2\n */" +
					"var flar = '';\n" +
					"fla", "fla");
				return testProposals(results, [
					["flar", "flar : Number"]
				]);
			});
	
			// TODO this one is an open question.  Should we allow reassignment of
			// explicitly typed variables and parameters?  Currently, we do.
			it("test reassignment jsdoc2", function() {
				var results = computeContentAssist(
					"/** @type {Number} xx2\n */" +
					"var flar;\n" +
					"flar = '';\n" +
					"fla", "fla");
				return testProposals(results, [
					["flar", "flar : String"]
				]);
			});
	
			// reassignment shouldn't happen here since uninteresting type is being assigned
			it("test reassignment jsdoc3", function() {
				var results = computeContentAssist(
					"/** @type {Number} xx2\n */" +
					"var flar;\n" +
					"flar = iDontKnow();\n" +
					"fla", "fla");
				return testProposals(results, [
					["flar", "flar : Number"]
				]);
			});
	
			// SCRIPTED-138 jsdoc support for functions parameters that are in object literals
			it("test object literal fn param jsdoc1", function() {
				var results = computeContentAssist(
					"var obj = {\n  /** @param {String} foo */\n fun : function(foo) { foo }\n}", "foo", 67);
				return testProposals(results, [
					["foo", "foo : String"]
				]);
			});
			
			//jsdoc test
			it("test object literal type jsdoc1", function() {
				var results = computeContentAssist(
					"var obj = {\n" +
					"  /** @type {String} foo */\n" +
					"  foo : undefined\n" +
					"};\n" +
					"obj.foo", "foo");
				return testProposals(results, [
					["foo", "foo : String"]
				]);
			});
			
			//jsdoc test
			it("test object literal fn return jsdoc1", function() {
				var results = computeContentAssist(
					"var foo = {\n" +
					"  /** @return {String} foo */\n" +
					"  fun : function(foo) { }\n" +
					"}\n" +
					"var res = foo.fun();\n" +
					"res", "res");
				return testProposals(results, [
					["res", "res : String"]
				]);
			});
			
			//jsdoc test
			it("test dotted constructor jsdoc type 1", function() {
				var results = computeContentAssist(
					"var obj = { Fun : function() {} };\n" +
					"/** @type obj.Fun */ var xxx;\nxx", "xx");
				return testProposals(results, [
					["xxx", "xxx : obj.Fun"]
				]);
			});
			
			//jsdoc test
			it("test dotted constructor jsdoc type 2", function() {
				var results = computeContentAssist(
					"var obj = { Fun : function() { this.yyy = 9; } };\n" +
					"/** @type obj.Fun */ var xxx;\nxxx.yy", "yy");
				return testProposals(results, [
					["yyy", "yyy : Number"]
				]);
			});
	
			// arrays and array types
			it("test array type1", function() {
				var results = computeContentAssist(
					"/** @type [Number] */ var xxx;\nxxx[0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type2", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type [Number,String] */ var xxx;\nxxx[0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type3", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type Array.<Number> */ var xxx;\nxxx[0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type3a", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type [Number] */ var xxx;\nxxx[0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type4", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type Array.<{foo:Number}> */ var xxx;\nxxx[0].foo.toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type5", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type Array.<Array.<Number>> */ var xxx;\nxxx[0][0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type6", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type Array.<Array.<Array.<Number>>> */ var xxx;\nxxx[0][0][bar].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type7", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type {...Number} */ var xxx;\nxxx[0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test array type8", function() {
				var results = computeContentAssist(
					// ignoring the second type
					"/** @type {...Array.<Number>} */ var xxx;\nxxx[0][0].toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
	
			it("test jsdoc on property decl1", function() {
				var results = computeContentAssist(
					"var jjj = {};/** @type {Number} */\n" +
					"jjj.x = '';x.toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
			it("test jsdoc on property decl2", function() {
				var results = computeContentAssist(
					"var jjj = {x:false};/** @type {Number} */\n" +
					"jjj.x = '';x.toF", "toF");
				return testProposals(results, [
					["toFixed(digits)", "toFixed(digits) : String"]
				]);
			});
		}
	
		/////////////////////////////////////
		// various tests for reassignment
		// reassignments are only performed
		// if the new type is not less general
		// than the old type
		/////////////////////////////////////
		/*
		 undefined -> Object yes
		 undefined -> { } yes
		 undefined -> {a} yes
		 undefined -> any yes
	
		 Object -> undefined no
		 Object -> { } yes
		 Object -> {a} yes
		 Object -> any yes
	
		 { } -> undefined no
		 { } -> Object no
		 { } -> {a} yes
		 { } -> any yes
	
		 {a} -> undefined no
		 {a} -> Object no
		 {a} -> { } no
		 {a} -> any yes
	
		 any -> undefined no
		 any -> Object no
		 any -> { } no
		 any -> {a} yes
		*/
	
		//undefined
		it("test reassignment undef->Obj", function() {
			var results = computeContentAssist(
				"var v = { a : undefined };\n" +
				"v.a = new Object();\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Object"]
			]);
		});
		it("test reassignment undef->{ }", function() {
			var results = computeContentAssist(
				"var v = { a : undefined };\n" +
				"v.a = { };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {}"]
			]);
		});
		it("test reassignment undef->{a}", function() {
			var results = computeContentAssist(
				"var v = { a : undefined };\n" +
				"v.a = { a: 9 };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment undef->any", function() {
			var results = computeContentAssist(
				"var v = { a : undefined };\n" +
				"v.a = 9;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
	
		// Obj
		it("test reassignment obj->undefined", function() {
			var results = computeContentAssist(
				"var v = { a : new Object() };\n" +
				"v.a = undefined;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Object"]
			]);
		});
		it("test reassignment obj->{ }", function() {
			var results = computeContentAssist(
				"var v = { a : new Object() };\n" +
				"v.a = { };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {}"]
			]);
		});
		it("test reassignment obj->{a}", function() {
			var results = computeContentAssist(
				"var v = { a : new Object() };\n" +
				"v.a = { a: 9 };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment obj->any", function() {
			var results = computeContentAssist(
				"var v = { a : new Object() };\n" +
				"v.a = 9;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
	
		// { }
		it("test reassignment { }->undefined", function() {
			var results = computeContentAssist(
				"var v = { a : { } };\n" +
				"v.a = undefined;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {}"]
			]);
		});
		it("test reassignment { }->obj", function() {
			var results = computeContentAssist(
				"var v = { a : { } };\n" +
				"v.a = new Object();\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {}"]
			]);
		});
		it("test reassignment { }->{a}", function() {
			var results = computeContentAssist(
				"var v = { a : { } };\n" +
				"v.a = { a: 9 };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment { }->any", function() {
			var results = computeContentAssist(
				"var v = { a : { } };\n" +
				"v.a = 9;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
	
		// {a}
		it("test reassignment {a}->undefined", function() {
			var results = computeContentAssist(
				"var v = { a : { a:9 } };\n" +
				"v.a = undefined;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment {a}->obj", function() {
			var results = computeContentAssist(
				"var v = { a : {a:9 } };\n" +
				"v.a = new Object();\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment {a}->{ }", function() {
			var results = computeContentAssist(
				"var v = { a : {a:9} };\n" +
				"v.a = { };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment {a}->{a}", function() {
			var results = computeContentAssist(
				"var v = { a : {a:9} };\n" +
				"v.a = {b:9};\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {b:Number}"]
			]);
		});
		it("test reassignment {a}->any", function() {
			var results = computeContentAssist(
				"var v = { a : {a:9} };\n" +
				"v.a = 9;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
	
		// any
		it("test reassignment any->undefined", function() {
			var results = computeContentAssist(
				"var v = { a : 9 };\n" +
				"v.a = undefined;\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
		it("test reassignment any->obj", function() {
			var results = computeContentAssist(
				"var v = { a : 9 };\n" +
				"v.a = new Object();\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
		it("test reassignment any->{ }", function() {
			var results = computeContentAssist(
				"var v = { a : 9 };\n" +
				"v.a = { };\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : Number"]
			]);
		});
		it("test reassignment any->{a}", function() {
			var results = computeContentAssist(
				"var v = { a : {a:9} };\n" +
				"v.a = { a: 9};\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : {a:Number}"]
			]);
		});
		it("test reassignment any->any", function() {
			var results = computeContentAssist(
				"var v = { a : {a:9} };\n" +
				"v.a = '';\n" +
				"v.a", "a");
			return testProposals(results, [
				["a", "a : String"]
			]);
		});
	
		///////////////////////////////////////////////////
		// testing default jslint options
		///////////////////////////////////////////////////
		var jsOptionsBrowser = {"options": { "browser": true }};
		var jsOptionsNoBrowser = {"options": { "browser": false }};
		var jsOptions1Global = {"global": [ "aaa" ]};
		var jsOptions2Globals = {"global": [ "aaa", "aab"]};
		var jsOptionsAndGlobals = {"global": [ "aaa", "aab"], "options": { "browser": true }};
	
		it("test browser:true in options", function() {
			var results = computeContentAssist(
				"wind", "wind", null, jsOptionsBrowser);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
		it("test browser:false in options", function() {
			var results = computeContentAssist(
				"wind", "wind", null, jsOptionsNoBrowser);
			return testProposals(results, [
			]);
		});
	
		it("test browser:true in options overriden by browser:false in text", function() {
			var results = computeContentAssist(
				"/*jslint browser:false */\nwind", "wind", null, jsOptionsBrowser);
			return testProposals(results, [
			]);
		});
	
		it("test browser:false in options overriden by browser:true in text", function() {
			var results = computeContentAssist(
				"/*jslint browser:true */\nwind", "wind", null, jsOptionsNoBrowser);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
		it("test 1 global in options", function() {
			var results = computeContentAssist(
				"aa", "aa", null, jsOptions1Global);
			return testProposals(results, [
				["aaa", "aaa : {}"]
			]);
		});
	
		it("test 2 globals in options", function() {
			var results = computeContentAssist(
				"aa", "aa", null, jsOptions2Globals);
			return testProposals(results, [
				["aaa", "aaa : {}"],
				["aab", "aab : {}"]
			]);
		});
	
		it("test 2 globals in options and in text", function() {
			var results = computeContentAssist(
				"/*global aac */\naa", "aa", null, jsOptions2Globals);
			return testProposals(results, [
				["aaa", "aaa : {}"],
				["aab", "aab : {}"],
				["aac", "aac : {}"]
			]);
		});
	
		it("test globals and browser1", function() {
			var results = computeContentAssist(
				"aa", "aa", null, jsOptionsAndGlobals);
			return testProposals(results, [
				["aaa", "aaa : {}"],
				["aab", "aab : {}"]
			]);
		});
	
		it("test globals and browser2", function() {
			var results = computeContentAssist(
				"wind", "wind", null, jsOptionsAndGlobals);
			return testProposals(results, [
				["window", "window : Global"]
			]);
		});
	
		// SCRIPTED-170
		it("test obj literal with underscore2", function() {
			var results = computeContentAssist(
				"function hasOwnProperty() { }\n" +
				"({}).hasOwnProperty();");
			return testProposals(results, [
				["Array([val])", "Array([val]) : Array"],
				["Boolean([val])", "Boolean([val]) : Boolean"],
				["Date([val])", "Date([val]) : Date"],
				["decodeURI(uri)", "decodeURI(uri) : String"],
				["decodeURIComponent(encodedURIString)", "decodeURIComponent(encodedURIString) : String"],
				["encodeURI(uri)", "encodeURI(uri) : String"],
				["encodeURIComponent(decodedURIString)", "encodeURIComponent(decodedURIString) : String"],
				["Error([err])", "Error([err]) : Error"],
				["eval(toEval)", "eval(toEval) : Object"],
				["Function()", "Function() : Function"],
				["isFinite(num)", "isFinite(num) : Boolean"],
				["isNaN(num)", "isNaN(num) : Boolean"],
				["Number([val])", "Number([val]) : Number"],
				["Object([val])", "Object([val]) : Object"],
				["parseFloat(str, [radix])", "parseFloat(str, [radix]) : Number"],
				["parseInt(str, [radix])", "parseInt(str, [radix]) : Number"],
				["RegExp([val])", "RegExp([val]) : RegExp"],
				["String([val])", "String([val]) : String"],
				["Infinity", "Infinity : Number"],
				["JSON", "JSON : JSON"],
				["Math", "Math : Math"],
				["NaN", "NaN : Number"],
				["this", "this : Global"],
				["undefined", "undefined : undefined"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		// computed member expressions
		it("test computed member expressions1", function() {
			var results = computeContentAssist(
				"var foo = { at: { bar: 0} };\n" +
				"foo['at'].b", "b");
			return testProposals(results, [
				["bar", "bar : Number"]
			]);
		});
	
		it("test computed member expressions2", function() {
			var results = computeContentAssist(
				"var foo = { at: { bar: 0} };\n" +
				"foo[at].b", "b");
			return testProposals(results, [
			]);
		});
	
		it("test computed member expressions3", function() {
			var results = computeContentAssist(
				"var foo = { at: { bar: 0} };\n" +
				"foo[9].at.bar.toF", "toF");
			return testProposals(results, [
			]);
		});
	
		it("test computed member expressions4", function() {
			var results = computeContentAssist(
				"var foo = { at: { bar: 0} };\n" +
				"foo['at'].bar.toF", "toF");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		it("test computed member expressions5", function() {
			var results = computeContentAssist(
				"var foo = { at: { bar: 0} };\n" +
				"foo[at.foo.bar].");
			return testProposals(results, [
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
		it("test computed member expressions6", function() {
			var results = computeContentAssist(
				"var x = 0;\n var foo = [];\n foo[x.]", "", 33);
			return testProposals(results, [
				["toExponential(digits)", "toExponential(digits) : String"],
				["toFixed(digits)", "toFixed(digits) : String"],
				["toPrecision(digits)", "toPrecision(digits) : String"],
				["", "---------------------------------"],
				["hasOwnProperty(property)", "hasOwnProperty(property) : Boolean"],
				["isPrototypeOf(object)", "isPrototypeOf(object) : Boolean"],
				["propertyIsEnumerable(property)", "propertyIsEnumerable(property) : Boolean"],
				["toLocaleString()", "toLocaleString() : String"],
				["toString()", "toString() : String"],
				["valueOf()", "valueOf() : Object"]
			]);
		});
	
	
		/////////////////////////////////////
		// full file inferencing
		/////////////////////////////////////
		it("test full file inferecing 1", function() {
			var results = computeContentAssist(
				"x;\n var x = 0;", "x", 1);
			return testProposals(results, [
				["x", "x : Number"]
			]);
		});
		it("test full file inferecing 2", function() {
			var results = computeContentAssist(
				"function a() { x; }\n var x = 0;", "x", 16);
			return testProposals(results, [
				["x", "x : Number"]
			]);
		});
		it("test full file inferecing 3", function() {
			var results = computeContentAssist(
				"function a() { var y = x; y}\n var x = 0;", "y", 27);
			return testProposals(results, [
				["y", "y : Number"]
			]);
		});
		it("test full file inferecing 4", function() {
			var results = computeContentAssist(
				"function a() { var y = x.fff; y}\n var x = { fff : 0 };", "y", 31);
			return testProposals(results, [
				["y", "y : Number"]
			]);
		});
		it("test full file inferecing 5", function() {
			var results = computeContentAssist(
				"function a() { var y = x.fff; y}\n var x = {};\n x.fff = 8;", "y", 31);
			return testProposals(results, [
				["y", "y : Number"]
			]);
		});
		it("test full file inferecing 6", function() {
			var results = computeContentAssist(
				"function a() { x.fff = ''; var y = x.fff; y}\n" +
				"var x = {};\n" +
				"x.fff = 8;", "y", 43);
			return testProposals(results, [
				["y", "y : String"]
			]);
		});
		it("test full file inferecing 7", function() {
			var results = computeContentAssist(
				"function a() { x.fff = ''; var y = x(); y}\n" +
				"var x = function() { return 8; }", "y", 41);
			return testProposals(results, [
				["y", "y : Number"]
			]);
		});
		it("test full file inferecing 8", function() {
			var results = computeContentAssist(
				"function a() { x.fff = ''; var y = z(); y}\n" +
				"var x = function() { return 8; }, z = x", "y", 41);
			return testProposals(results, [
				["y", "y : Number"]
			]);
		});
	
		it("test full file inferecing 9", function() {
			var results = computeContentAssist(
				"function a() {\n function b() {\n x.fff = '';\n }\n x.f\n}\n var x = {};", "f", 51);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
		it("test full file inferecing 10", function() {
			var results = computeContentAssist(
				"function a() {\n function b() {\n x.fff = '';\n }\n var y = x;\n y.f\n }\n var x = {};", "f", 63);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 11a", function() {
			var results = computeContentAssist(
				"var x = {};\n function a() {\n var y = x;\n y.f\n function b() {\n x.fff = '';\n}\n}", "f", 44);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 11", function() {
			var results = computeContentAssist(
				"function a() {\n var y = x;\n y.f\n function b() {\n x.fff = '';\n }\n }\n var x = {};", "f", 31);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 12", function() {
			var results = computeContentAssist(
				"function a() {\n var y = x;\n y.f\n x.fff = '';\n }\n var x = {};", "f", 31);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 13", function() {
			var results = computeContentAssist(
				"function b() {\n x.fff = '';\n }\n function a() {\n var y = x;\n y.f\n }\n var x = {};", "f", 63);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 14", function() {
			var results = computeContentAssist(
				"function a() {\n  var y = x;\n y.f\n }\n function b() {\n x.fff = '';\n }\n var x = {};", "f", 32);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 15", function() {
			var results = computeContentAssist(
				"function b() {\n x.fff = '';\n }\n function a() {\n x.f\n }\n var x = {};", "f", 51);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		// should still find the fff property here evem though it
		// is defined after and in another funxtion
		it("test full file inferecing 16", function() {
			var results = computeContentAssist(
				"function a() {\n x.f\n }\n function b() {\n x.fff = '';\n }\n var x = {};", "f", 19);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
		it("test full file inferecing 17", function() {
			var results = computeContentAssist(
				"function a() {\n x.f\n function b() {\n x.fff = '';\n }\n }\n var x = {};", "f", 19);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 18", function() {
			var results = computeContentAssist(
				"function a() {\n x.fff = '';\n function b() {\n x.f\n }\n }\n var x = {};", "f", 48);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 19", function() {
			var results = computeContentAssist(
				"function a() {\n function b() {\n x.f\n }\n x.fff = '';\n }\n var x = {};", "f", 35);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		// don't find anything because assignment is in same scope, but after
		it("test full file inferecing 20", function() {
			var results = computeContentAssist(
				"x.\n" +
				"var x = {};\n" +
				"x.fff = '';", "f", 2);
			return testProposals(results, [
			]);
		});
	
		it("test full file inferecing 21", function() {
			var results = computeContentAssist(
				"function a() {\n x.fff = '';\n }\n x.\n var x = {}; ", "f", 34);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 22", function() {
			var results = computeContentAssist(
				"x.\n" +
				"function a() {\n" +
				"x.fff = '';\n" +
				"}\n" +
				"var x = {}; ", "f", 2);
			return testProposals(results, [
				["fff", "fff : String"]
			]);
		});
	
		it("test full file inferecing 26", function() {
			var results = computeContentAssist(
				"function a() {\n function b() {\n var fff = x();\n f;\n }\n }\n function x() { return ''; }", "f", 49);
			return testProposals(results, [
				["fff", "fff : String"],
				["", "---------------------------------"],
				["Function()", "Function() : Function"]
			]);
		});
	
		// Not inferencing String because function decl comes after reference in same scope
		it("test full file inferecing 27", function() {
			var results = computeContentAssist(
				"var fff = x();\n f;\n function x() { return ''; }", "f", 17);
			return testProposals(results, [
				["Function()", "Function() : Function"],
				["fff", "fff : {}"]
			]);
		});
	
		// Not gonna work because of recursive
		it("test full file inferecing 28", function() {
			var results = computeContentAssist(
				"function x() {\n var fff = x();\n f;\n return ''; }", "f", 33);
			return testProposals(results, [
				["fff", "fff : undefined"],
				["", "---------------------------------"],
				["Function()", "Function() : Function"]
			]);
		});
	
		it("test full file inferecing 29", function() {
			var results = computeContentAssist(
				"function a() {\n function b() {\n var fff = x();\n f;\n }\n }\n var x = function() { return ''; }", "f", 49);
			return testProposals(results, [
				["fff", "fff : String"],
				["", "---------------------------------"],
				["Function()", "Function() : Function"]
			]);
		});
	
		// Not working because function decl comes after reference in same scope
		it("test full file inferecing 30", function() {
			var results = computeContentAssist(
				"var fff = x();\n f;\n var x = function() { return ''; }", "f", 17);
			return testProposals(results, [
				["Function()", "Function() : Function"],
				["fff", "fff : {}"]
			]);
		});
	
		// Not gonna work because of recursive
		it("test full file inferecing 31", function() {
			var results = computeContentAssist(
				"var x = function() { var fff = x();\nf;return ''; }", "f", 37);
			return testProposals(results, [
				["fff", "fff : undefined"],
				["", "---------------------------------"],
				["Function()", "Function() : Function"]
			]);
		});
	
		it("test full file inferecing 32", function() {
			var results = computeContentAssist(
				"x\n function x() { return ''; }", "x", 1);
			return testProposals(results, [
				["x()", "x() : String"]
			]);
		});
	
		it("test full file inferecing 33", function() {
			var results = computeContentAssist(
				"var xxx = {\n aaa: '',\n bbb: this.a\n};", "a", 34);
			return testProposals(results, [
				["aaa", "aaa : String"]
			]);
		});
	
		it("test full file inferecing 34", function() {
			var results = computeContentAssist(
				"var xxx = {\n" +
				"	bbb: this.a,\n" +
				"	aaa: ''\n" +
				"};", "a", 24);
			return testProposals(results, [
				["aaa", "aaa : String"]
			]);
		});
	
		/////////////////////////////////////
		// property read inferencing
		//
		// tests for property reads
		/////////////////////////////////////
		it("test property read before", function() {
			var results = computeContentAssist(
				"var xxx;\n" +
				"xxx.lll++;\n" +
				"xxx.ll", "ll");
			return testProposals(results, [
				["lll", "lll : {}"]
			]);
		});
	
		it("test property read after", function() {
			var results = computeContentAssist(
				"var xxx;\n" +
				"xxx.ll;\n" +
				"xxx.lll++;", "ll", 15);
			return testProposals(results, [
				["lll", "lll : {}"]
			]);
		});
	
		it("test property read global before", function() {
			var results = computeContentAssist(
				"lll++;\n" +
				"ll", "ll");
			return testProposals(results, [
				["lll", "lll : {}"]
			]);
		});
	
		it("test property read global after", function() {
			var results = computeContentAssist(
				"ll;\n lll++;", "ll", 2);
			return testProposals(results, [
				["lll", "lll : {}"]
			]);
		});
	
		/////////////////////////////////////
		// Array parameterization
		/////////////////////////////////////
		it("test array parameterization1", function() {
			var results = computeContentAssist(
				"var x = [1];\n" +
				"x[foo].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization2", function() {
			var results = computeContentAssist(
				"var x = [1];\n" +
				"x[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization3", function() {
			var results = computeContentAssist(
				"var x = [1];\n" +
				"x['foo'].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization4", function() {
			var results = computeContentAssist(
				"([1, 0])[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization5", function() {
			var results = computeContentAssist(
				"var x = [[1]];\n" +
				"x[0][0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization6", function() {
			var results = computeContentAssist(
				"var x = [{}];x[0].a = 8;\n" +
				"x[0].a.toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization7", function() {
			var results = computeContentAssist(
				"var a = {a : 8}; \n var x = [a];\n" +
				"x[0].a.toFi", "toFi");
				// may not work because a string
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization8", function() {
			var results = computeContentAssist(
				"var x = [[1]];\n" +
				"x = x[0];\nx[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization9", function() {
			var results = computeContentAssist(
				"var x = [];\n" +
				"x[9] = 0;\nx[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization10", function() {
			var results = computeContentAssist(
				"var x = [];\n" +
				"x[9] = '';\nx[9] = 0;\nx[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization11", function() {
			var results = computeContentAssist(
				"var x = (function() { return [0]; })();\n" +
				"x[9] = 0;\nx[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
		it("test array parameterization10", function() {
			var results = computeContentAssist(
				"var x = ['','',''];\n" +
				"x[9] = 0;\nx[0].toFi", "toFi");
			return testProposals(results, [
				["toFixed(digits)", "toFixed(digits) : String"]
			]);
		});
	
		// https://github.com/scripted-editor/scripted/issues/65
		it("test case insensitive ordering1", function() {
			var results = computeContentAssist(
				"var xXXX = 8;\n" +
				"var xXYZ = 8;\n" +
				"var xxxx = 8;\n" +
				"var xxyz = 8;\n" +
				"x", "x");
			return testProposals(results, [
				["xXXX", "xXXX : Number"],
				["xxxx", "xxxx : Number"],
				["xXYZ", "xXYZ : Number"],
				["xxyz", "xxyz : Number"]
			]);
		});
		// https://github.com/scripted-editor/scripted/issues/65
		it("test case insensitive ordering2", function() {
			var results = computeContentAssist(
				"var xXYZ = 8;\n" +
				"var xxxx = 8;\n" +
				"var xXXX = 8;\n" +
				"var xxyz = 8;\n" +
				"x", "x");
			return testProposals(results, [
				["xxxx", "xxxx : Number"],
				["xXXX", "xXXX : Number"],
				["xXYZ", "xXYZ : Number"],
				["xxyz", "xxyz : Number"]
			]);
		});
	
		// https://github.com/scripted-editor/scripted/issues/65
		it("test loosely match 1", function() {
			var results = computeContentAssist(
				"var getAnotherThing = 0;\n" +
				"gAT", "gAT");
			return testProposals(results, [
				["getAnotherThing", "getAnotherThing : Number"]
			]);
		});
		it("test loosely match 2", function() {
			var results = computeContentAssist(
				"var getAnotherThing = 0;\n" +
				"getan", "getan");
			return testProposals(results, [
				["getAnotherThing", "getAnotherThing : Number"]
			]);
		});
		it("test loosely match 3", function() {
			var results = computeContentAssist(
				"var getAnotherThing = 0;\n" +
				"getaN", "getaN");
			return testProposals(results, [
			]);
		});
		it("test loosely match 4", function() {
			var results = computeContentAssist(
				"var getAnotherThing = 0;\n" +
				"getAN", "getAN");
			return testProposals(results, [
			]);
		});
	
		// Issue 221 problems with navigating to proto definitions inside of constructors
		it('test proto ref in this1', function() {
			var results = computeContentAssist(
				"function TextView () {\n this._init;\n }\n TextView.prototype = {\n _init: function() { }\n };", "_init", 34);
			return testProposals(results, [
				["_init()", "_init() : TextView.prototype._init"]
			]);
		});
		it('test proto ref in this2 - ', function() {
			var results = computeContentAssist(
				"function TextView () {\n this._init;\n }\n TextView.prototype._init = function() { };", "_init", 34);
			return testProposals(results, [
				["_init()", "_init() : TextView.prototype._init"]
			]);
		});
		it('test proto ref in this3 - ', function() {
			var results = computeContentAssist(
				"function TextView () { }\n" +
				"TextView.prototype._init = function() { };\n" +
				"new TextView()._init", "_init");
			return testProposals(results, [
				["_init()", "_init() : TextView.prototype._init"]
			]);
		});
	
		// See https://github.com/scripted-editor/scripted/issues/258
		it('test invalid array type param in jsdoc - ', function() {
			var results = computeContentAssist(
				"/** @type Array.<nuthin> */\n" +
				"var graph = {};\n" +
				"graph[''].k.proto", "proto");
			return testProposals(results, []);
		});
		
		it("test tolerant parsing function 1", function() {
			var results = computeContentAssist(
				"var xxxyyy = {};\n" +
				"function foo() {\n" +
				"    if (xx", "xx");
			return testProposals(results, [["xxxyyy", "xxxyyy : {}"]]);
		});	
	
		it("test tolerant parsing function 2", function() {
			var results = computeContentAssist(
				"function foo() {\n" +
				"    var xxxyyy = false;\n" +
				"    if (!xx", "xx");
			return testProposals(results, [["xxxyyy", "xxxyyy : Boolean"]]);
		});	
	
		it("test tolerant parsing function 3", function() {
			var results = computeContentAssist(
				"function foo(xxxyyy) {\n" +
				"    if (!xx", "xx");
			return testProposals(results, [["xxxyyy", "xxxyyy : {}"]]);
		});	
	
		it("test tolerant parsing function 4", function() {
			var results = computeContentAssist(
				"var x = { bazz: 3 };\n" +
				"function foo() {\n" +
				"    if (x.b", "b");
			return testProposals(results, [["bazz", "bazz : Number"]]);
		});	
	
		it("test tolerant parsing function 5", function() {
			var results = computeContentAssist(
				"function foo(p) {\n" +
				"    p.ffffff = false;\n" +
				"    while (p.ff", "ff");
			return testProposals(results, [["ffffff", "ffffff : Boolean"]]);
		});	
	
		it("test tolerant parsing function 6", function() {
			var results = computeContentAssist(
				"function foo(p) {\n" +
				"    p.ffffff = false;\n" +
				"    if (p) {\n" +
				"        while (p.ff", "ff");
			return testProposals(results, [["ffffff", "ffffff : Boolean"]]);
		});	
	
		it("test tolerant parsing function 7", function() {
			var results = computeContentAssist(
				"function foo(p) {\n" +
				"    p.ffffff = false;\n" +
				"    if (p) {\n" +
				"        for (var q in p.ff", "ff");
			return testProposals(results, [["ffffff", "ffffff : Boolean"]]);
		});	
	
		it("test tolerant parsing function 8", function() {
			var results = computeContentAssist(
				"function foo(p) {\n" +
				"    p.ffffff = false;\n" +
				"    if (p) {\n" +
				"        for (var q in p) {\n" +
				"            while (p.ff", "ff");
			return testProposals(results, [["ffffff", "ffffff : Boolean"]]);
		});	
	
		it("test tolerant parsing function 9", function() {
			var results = computeContentAssist(
				"function f(s) {}\n" +
				"f(JSON.str", "str");
			return testProposals(results, [["stringify(json)", "stringify(json) : String"]]);
		});	
	
		it("test tolerant parsing function 10", function() {
			var results = computeContentAssist(
				"function f(a,b) {}\n" +
				"f(0,JSON.str", "str");
			return testProposals(results, [["stringify(json)", "stringify(json) : String"]]);
		});	
	
		// tests for richer function types
		it('test function with property', function() {
			var results = computeContentAssist(
				"function f() { }\n" +
				"f.xxxx = 3;\n" +
				"f.x", "x");
			return testProposals(results, [
				["xxxx", "xxxx : Number"]
			]);
		});
		it("test lowercase constructor 1", function() {
			var results = computeContentAssist(
			"function fun() {\n	this.xxx = 9;\n	this.uuu = this.x;}", "x", 50);
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
		it("test lowercase constructor 2", function() {
			var results = computeContentAssist(
			"function fun() {	this.xxx = 9;	this.uuu = this.xxx; }\n" +
			"var y = new fun();\n" +
			"y.x", "x");
			return testProposals(results, [
				["xxx", "xxx : Number"]
			]);
		});
		it("test lowercase constructor prototype", function() {
			var results = computeContentAssist(
				"var aaa = function() { };\naaa.prototype = { foo : 9 };\nnew aaa().f", "f");
			return testProposals(results, [
				["foo", "foo : Number"]
			]);
		});
		it("test object literal usage-based inference", function() {
			var results = computeContentAssist(
				"var p = { xxxx: function() { }, yyyy: function() { this.x; } };", "x", 57);
			return testProposals(results, [
				["xxxx()", "xxxx() : undefined"]
			]);
		});
		it("test object literal usage-based inference 2", function() {
			var results = computeContentAssist(
				"var p = { xxxx: function() { this.yyyy = 3; }, yyyy: function() {} };\n" +
				"var q = new p.xxxx();\n" +
				"q.y", "y");
			return testProposals(results, [
				["yyyy", "yyyy : Number"]
			]);
		});
	
		it("test object literal usage-based inference 3", function() {
			var results = computeContentAssist(
				"var p = { f1: function(a) { this.cccc = a; }, f2: function(b) { this.dddd = b; }, f3: function() { var y = this.ccc } };", "ccc", 115);
			return testProposals(results, [
				["cccc", "cccc : {}"]
			]);
		});
	
		it("test object literal usage-based inference 4", function() {
			var results = computeContentAssist(
				"var p = { o1: { cccc: 3 }, f1: function() { this.o1.ffff = 4; }, f2: function() { var y = this.o1.ccc } };", "ccc", 101);
			return testProposals(results, [
				["cccc", "cccc : Number"]
			]);
		});
	
		it("test object literal usage-based inference 5", function() {
			var results = computeContentAssist(
				"var p = { o1: { cccc: 3 }, f1: function() { this.o1.ffff = 4; }, f2: function() { var y = this.o1.fff } };", "fff", 101);
			return testProposals(results, [
				["ffff", "ffff : Number"]
			]);
		});
	
	  
	        /**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=425675
		 * @since 5.0
		 */
		it("test completions for Function1", function() {
			//computeContentAssist(buffer, prefix, offset, lintOptions, editorContextMixin, paramsMixin) {
			var results = computeContentAssist("var foo; foo !== null ? fun : function(f2) {};", 
											   "fun",
											   27, 
											   {},
											   {},
											   {keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					["Function()", "Function() : Function"],
					["", "Templates"], 
					["/**\n * @name name\n * @param parameter\n */\nfunction name (parameter) {\n\t\n}", "function - function declaration"],
					//["/**\n * @name name\n * @function\n * @param parameter\n */\nname: function(parameter) {\n\t\n}", "function - function expression"],
					["", "Keywords"], 
					["ction", "function"]
					]);
		});
	
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=425675
		 * @since 5.0
		 */
		it("test completions for Function2", function() {
			var results = computeContentAssist("var foo; foo !== null ? function(f2) {} : fun;",
												"fun",
												45, 
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					["Function()", "Function() : Function"],
					["", "Templates"], 
					["/**\n * @name name\n * @param parameter\n */\nfunction name (parameter) {\n\t\n}", "function - function declaration"],
					["", "Keywords"], 
					["ction", "function"]
					]);
		});
		
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=425675
		 * @since 5.0
		 */
		it("test completions for Function3", function() {
			var results = computeContentAssist("var foo = {f: fun};", 
												'fun',
												17, 
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					['Function()', 'Function() : Function'],
					["", "Templates"], 
					['ction(parameter) {\n\t\n}', 'function - member function expression'],
					["", "Keywords"], 
					["ction", "function"]
					]);
		});
		
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=425675
		 * @since 5.0
		 */
		it("test completions for Function4", function() {
			var results = computeContentAssist("var foo = {f: fun};", 
												'fun',
												17,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					['Function()', 'Function() : Function'],
					["", "Templates"], 
					['ction(parameter) {\n\t\n}', 'function - member function expression'],
					["", "Keywords"], 
					["ction", "function"], 
					]);
		});
		
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=425675
		 * @since 5.0
		 */
		it("test completions for Function5", function() {
			var results = computeContentAssist("fun", 
												'fun',
												3,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					["Function()", "Function() : Function"],
					["", "Templates"], 
					["/**\n * @name name\n * @param parameter\n */\nfunction name (parameter) {\n\t\n}", "function - function declaration"],
					["", "Keywords"], 
					["ction", "function"]
					]);
		});
	
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=426284
		 * @since 6.0
		 */
		it("test completions for Function6", function() {
			var results = computeContentAssist("var foo = {f: t};", 
												't',
												15,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					['this', 'this : {f:Object}'],
					['', '---------------------------------'],
					["toLocaleString()", "toLocaleString() : String"],
					["toString()", "toString() : String"],
					["", "Keywords"], 
					["his", "this"], 
					["rue", "true"],
					["ypeof", "typeof"]
					]);
		});
	
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=426284
		 * @since 6.0
		 */
		it("test completions for Function7", function() {
			var results = computeContentAssist("var foo = {f: h};", 
												'h',
												15,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					['hasOwnProperty(property)', 'hasOwnProperty(property) : Boolean']
					]);
		});
	
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=426284
		 * @since 6.0
		 */
		it("test completions for Function8", function() {
			var results = computeContentAssist("var foo = {f: fal};", 
												'fal',
												17,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					["", "Keywords"], 
					["se", "false"]
					]);
		});
	
		/**
		 * https://bugs.eclipse.org/bugs/show_bug.cgi?id=426284
		 * @since 6.0
		 */
		it("test completions for Function9", function() {
			var results = computeContentAssist("var foo = {f: n};", 
												'n',
												15,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(results, [
					//proposal, description
					['Number([val])', 'Number([val]) : Number'],
					['NaN', 'NaN : Number'],
					["", "Keywords"], 
					["ew", "new"],
					['ull', 'null']
					]);
		});
	
		/**
		 * Test that keyword suggestions are not made when looking for a member function or property.
		 * @since 5.0
		 */
		it('testKeywordCompletionInVariableMember', function() {
			var result = computeContentAssist("var x; x.to", 
												'to',
												11,
												{},
												{},
												{keyword:true, template:true});
			return testProposals(result, [
					["toLocaleString()", "toLocaleString() : String"],
					["toString()", "toString() : String"]
			]);
		});
	
		/**
		 * Test completion of control structure templates in the body of a function.
		 * @since 5.0
		 */
		it('testTemplateInFunctionBody', function() {
			var result = computeContentAssist("function x(a) {\n ", 
												' ',
												18,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString", result);
			assertProposal("for", result);
			assertProposal("while", result);
			assertProposalMatching(["while", "(condition)"], ["do"], result); // while (condition) with no 'do'
			assertProposal("switch", result);
			assertProposalMatching(["switch", "case"], [], result); // switch..case
			assertProposal("try", result);
			assertProposal("if", result);
			assertProposalMatching(["if", "(condition)"], [], result); // if (condition)
			assertProposal("do", result);
			assertProposalMatching(["do", "while"], [], result); // do..while
		});
	
		/**
		 * Test completion of control structure templates in the body of a function.
		 */
		it('testKeywordsInFunctionBodyWithPrefix', function() {
			var result = computeContentAssist("function x(a) {\n t", 
												't',
												19,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString".substr(1), result);
			assertProposal("this".substr(1), result);
			assertProposal("throw".substr(1), result);
			assertProposal("try".substr(1), result);
			assertProposal("typeof".substr(1), result);
			assertProposalMatching(["try {".substr(1), "catch ("], ["finally"], result); // try..catch with no finally
			assertProposalMatching(["try {".substr(1), "catch (", "finally"], [], result); // try..catch..finally
		});
	
		/**
		 * Test completion of control structure templates in the body of a function.
		 */
		it('testTemplateInFunctionBodyWithPrefix', function() {
			var result = computeContentAssist("function x(a) {\n f",
												'f',
												19,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString", result);
			assertProposal("for".substr(1), result);
			assertProposalMatching(["for".substr(1), "in"], [], result);
			assertProposalMatching(["for".substr(1), "array"], [], result);
			assertNoProposal("while", result);
			assertNoProposal("switch", result);
			assertNoProposal("try", result);
			assertNoProposal("if", result);
			assertNoProposal("do", result);
		});
	
		/**
		 * Test completion after non-whitespace chars and there should be no template content assist
		 */
		it('testTemplateAfterNonWhitespace1', function() {
			var result = computeContentAssist("x.", 
												'.',
												2,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString", result);
			assertNoProposal("for".substr(1), result);
			assertNoProposal("while", result);
			assertNoProposal("switch", result);
			assertNoProposal("try", result);
			assertNoProposal("if", result);
			assertNoProposal("do", result);
		});
	
		/**
		 * Test completion after non-whitespace chars and there should be no template content assist
		 */
		it('testTemplateAfterNonWhitespace2', function() {
			var result = computeContentAssist("x.  ",
												' ',
												2,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString", result);
			assertProposal("for".substr(1), result);
			assertProposal("while", result);
			assertProposal("switch", result);
			assertProposal("try", result);
			assertProposal("if", result);
			assertProposal("do", result);
		});
	
		/**
		 * Test completion after non-whitespace chars and there should be no template content assist
		 */
		it('testTemplateAfterNonWhitespace3', function() {
			var result = computeContentAssist("$  ",
												' ',
												1,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString", result);
			assertProposal("for".substr(1), result);
			assertProposal("while", result);
			assertProposal("switch", result);
			assertProposal("try", result);
			assertProposal("if", result);
			assertProposal("do", result);
		});
	
		/**
		 * Test completion after non-whitespace chars.  should be templates because 
		 * there is a newline
		 */
		it('testTemplateAfterNonWhitespace4', function() {
			var result = computeContentAssist("x.\n  ",
												' ',
												5,
												{},
												{},
												{keyword:true, template:true});
			assertNoProposal("toString", result);
			assertProposal("for", result);
			assertProposal("while", result);
			assertProposal("switch", result);
			assertProposal("try", result);
			assertProposal("if", result);
			assertProposal("do", result);
		});
	
	      
		/**
		 * Test cyclic types
		 */
		it("test cycle 1", function() {
			var results = computeContentAssist(
				"var f1 = function f1() {};\n" +
				"var f2 = function f2() {};\n" +
				"var new_f1 = new f1();\n" +
				"f1.prototype = new_f1;\n" +
				"f2.prototype = new_f1;\n" +
				"var x = new f1();\n" +
				"x.f.g", "g");
			return testProposals(results, []);
		});
	
		/**
		 * Test cyclic types
		 */
		it("test cycle 2", function() {
			var results = computeContentAssist(
				"function foo() {\n" +
				"this._init = function() { return this; }\n" +
				"this.cmd = function() {\n" +
				"this._in", "_in");
			return testProposals(results, [
				["_init()", "_init() : _init"]
			]);
	     });
	
		/**
		 * Test cyclic types
		 */
	    it("test cycle 3 ", function() {
			var results = computeContentAssist(
				"var f2 = function () {};\n" +
				"var new_f2 = new f2();\n" +
				"f2.prototype = new_f2;\n" +
				"var c = new f2();\n" +
				"c.fff", "fff");
			return testProposals(results, []);
		});
	
		it("test one-shot closure 1", function() {
		    var results = computeContentAssist("var x = {ffff : 3 }; (function (p) { p.fff })(x);", "fff", 42);
		    return testProposals(results, [
		       ["ffff", "ffff : Number"]
		    ]);
	     });
	
		it("test one-shot closure 2", function() {
		    var results = computeContentAssist("(function() { var x = { y: { zzz: 3 }, f: function() { var s = this.y.zz } };}());", "zz", 72);
		    return testProposals(results, [
		       ["zzz", "zzz : Number"]
		    ]);
		});
	
	  
		////////////////////////////////////////
		// tests for contributed Tern index files
		////////////////////////////////////////
		var testTernIndex = {
			"!name": "mylib",
			"!define": {
				mylib: {
					whatever: {
						"!type": "Number"
					}
				}
			}
		};
		it("test proposals shown for contributed module when `node:true`", function() {
			var results = computeContentAssist({
				buffer: "var lib = require(\"mylib\");\n" +
						"lib.w",
				prefix: "w",
				lintOptions: {
					options: { "node": true }
				},
				editorContextMixin: {
					getTypeDef: function() {
						return new Deferred().resolve(testTernIndex);
					}
				},
				paramsMixin: {
					typeDefs: {
						mylib: {
							type: "tern"
						}
					}
				}
			});
			return testProposals(results, [
				["whatever", "whatever : Number"]
			]);
		});
		it("test proposals shown for contributed module when no lint option", function() {
			var results = computeContentAssist({
				buffer: "var lib = require(\"mylib\");\n" +
						"lib.w",
				prefix: "w",
				lintOptions: {},
				editorContextMixin: {
					getTypeDef: function() {
						return new Deferred().resolve(testTernIndex);
					}
				},
				paramsMixin: {
					typeDefs: {
						mylib: {
							type: "tern"
						}
					}
				}
			});
			return testProposals(results, [
				["whatever", "whatever : Number"]
			]);
	
		});
		
		//TESTS FOR JSDOC CONTENT ASSIST
		
		/**
		 * Tests the author tag insertion
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test author tag", function() {
			var results = computeContentAssist("/**\n* @a \n*/", "@a", 8);
			testProposals(results, [
			     ['uthor', '@author', 'Author JSDoc tag']
			]);
		});
		/**
		 * Tests the lends tag insertion
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test lends tag", function() {
			var results = computeContentAssist("/**\n* @name foo\n* @l \n*/", "@l", 20);
			testProposals(results, [
			     ['ends', '@lends', 'Lends JSDoc tag']
			]);
		});
		/**
		 * Tests the function name insertion for a function decl with no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 1", function() {
			var results = computeContentAssist("/**\n* @name  \n*/function a(){}", "", 12);
			testProposals(results, [
			     ['a', 'a', 'The name of the function']
			]);
		});
		/**
		 * Tests the function name insertion for a function decl with a prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 2", function() {
			var results = computeContentAssist("/**\n* @name  \n*/function bar(){}", "b", 12);
			testProposals(results, [
			     ['ar', 'bar', 'The name of the function']
			]);
		});
		/**
		 * Tests the function name insertion for a object property with function expr with no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 3", function() {
			var results = computeContentAssist("var o = {/**\n* @name  \n*/f: function bar(){}}", "", 21);
			testProposals(results, [
			     ['bar', 'bar', 'The name of the function']
			]);
		});
		/**
		 * Tests the function name insertion for a object property with function expr with a prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 4", function() {
			var results = computeContentAssist("var o = {/**\n* @name  \n*/f: function bar(){}}", "b", 21);
			testProposals(results, [
			     ['ar', 'bar', 'The name of the function']
			]);
		});
		/**
		 * Tests the function name insertion for a object property with function expr with no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 5", function() {
			var results = computeContentAssist("/**\n* @name  \n*/Foo.bar.baz = function(){}", "", 12);
			testProposals(results, [
			     ['Foo.bar.baz', 'Foo.bar.baz', 'The name of the function']
			]);
		});
		/**
		 * Tests the function name insertion for a object property with function expr with a prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 6", function() {
			var results = computeContentAssist("/**\n* @name  \n*/Foo.bar.baz = function(){}", "Foo", 12);
			testProposals(results, [
			     ['.bar.baz', 'Foo.bar.baz', 'The name of the function']
			]);
		});
		/**
		 * Tests no proposals for assingment expression
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test name tag completion 6", function() {
			var results = computeContentAssist("/**\n* @name f \n*/Foo.bar.baz = function(){}", "", 14);
			testProposals(results, []);
		});
		/**
		 * Tests func decl param name proposals no prefix, no type
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 1", function() {
			var results = computeContentAssist("/**\n* @param  \n*/function a(a, b, c){}", "", 13);
			testProposals(results, [
			     ['a', 'a', 'Function parameter'],
			     ['b', 'b', 'Function parameter'],
			     ['c', 'c', 'Function parameter']
			]);
		});
		
		/**
		 * Tests func decl param name proposals no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 2", function() {
			var results = computeContentAssist("/**\n* @param {type} \n*/function a(a, b, c){}", "", 20);
			testProposals(results, [
			     ['a', 'a', 'Function parameter'],
			     ['b', 'b', 'Function parameter'],
			     ['c', 'c', 'Function parameter']
			]);
		});
		/**
		 * Tests func decl param name proposals a prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 3", function() {
			var results = computeContentAssist("/**\n* @param a \n*/function a(aa, bb, cc){}", "a", 14);
			testProposals(results, [
			     ['a', 'aa', 'Function parameter']
			]);
		});
		/**
		 * Tests no proposals for after name
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 4", function() {
			var results = computeContentAssist("/**\n* @param f  \n*/function a(aa, bb, cc){}", "", 15);
			testProposals(results, []);
		});
		/**
		 * Tests object property func expr param name proposals no prefix, no type
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 5", function() {
			var results = computeContentAssist("var o = {/**\n* @param  \n*/f: function a(a, b, c){}}", "", 22);
			testProposals(results, [
			     ['a', 'a', 'Function parameter'],
			     ['b', 'b', 'Function parameter'],
			     ['c', 'c', 'Function parameter']
			]);
		});
		/**
		 * Tests object property func expr param name proposals no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 6", function() {
			var results = computeContentAssist("var o = {/**\n* @param {type} \n*/f: function a(a, b, c){}}", "", 28);
			testProposals(results, [
			     ['a', 'a', 'Function parameter'],
			     ['b', 'b', 'Function parameter'],
			     ['c', 'c', 'Function parameter']
			]);
		});
		/**
		 * Tests object property func expr param name proposals a prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 7", function() {
			var results = computeContentAssist("var o = {/**\n* @param {type} a\n*/f: function a(aa, bb, cc){}}", "a", 30);
			testProposals(results, [
			     ['a', 'aa', 'Function parameter']
			]);
		});
		/**
		 * Tests object property func expr param name proposals a prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 8", function() {
			var results = computeContentAssist("var o = {/**\n* @param {type} a \n*/f: function a(aa, bb, cc){}}", "a", 31);
			testProposals(results, []);
		});
		/**
		 * Tests assingment func expr param name proposals no prefix, no type
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 9", function() {
			var results = computeContentAssist("/**\n* @param  \n*/Foo.bar.baz = function a(a, b, c){}", "", 13);
			testProposals(results, [
			     ['a', 'a', 'Function parameter'],
			     ['b', 'b', 'Function parameter'],
			     ['c', 'c', 'Function parameter']
			]);
		});
		/**
		 * Tests assingment func expr param name proposals no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 10", function() {
			var results = computeContentAssist("/**\n* @param {type} \n*/Foo.bar.baz = function a(a, b, c){}", "", 19);
			testProposals(results, [
			     ['a', 'a', 'Function parameter'],
			     ['b', 'b', 'Function parameter'],
			     ['c', 'c', 'Function parameter']
			]);
		});
		/**
		 * Tests assingment func expr param name proposals no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 10", function() {
			var results = computeContentAssist("/**\n* @param {type} a\n*/Foo.bar.baz = function a(aa, bb, cc){}", "a", 20);
			testProposals(results, [
			     ['a', 'aa', 'Function parameter']
			]);
		});
		/**
		 * Tests assingment func expr param name proposals no prefix
		 * @see https://bugs.eclipse.org/bugs/show_bug.cgi?id=426185
		 * @since 7.0
		 */
		it("test param name completion 11", function() {
			var results = computeContentAssist("/**\n* @param {type} d\n*/Foo.bar.baz = function a(aa, bb, cc){}", "d", 20);
			testProposals(results, []);
		});
	});
});
