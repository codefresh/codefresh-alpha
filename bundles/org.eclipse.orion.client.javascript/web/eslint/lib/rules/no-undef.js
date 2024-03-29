/*******************************************************************************
 * @license
 * Copyright (c) 2013, 2014 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *	 IBM Corporation - initial API and implementation
 *******************************************************************************/
/*global define module require exports console */
(function(root, factory) {
    if(typeof exports === 'object') {  //$NON-NLS-0$
        module.exports = factory(require, exports, module);
    }
    else if(typeof define === 'function' && define.amd) {  //$NON-NLS-0$
        define(['require', 'exports', 'module'], factory);
    }
    else {
        var req = function(id) {return root[id];},
            exp = root,
            mod = {exports: exp};
        root.rules.noundef = factory(req, exp, mod);
    }
}(this, function(require, exports, module) {
/**
 * @fileoverview Rule to flag references to undeclared variables.
 * @author Mark Macdonald
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

function isImplicitGlobal(variable) {
    return variable.defs.every(function(def) {
        return def.type === "ImplicitGlobalVariable";  //$NON-NLS-0$
    });
}

/**
 * Gets the declared variable, defined in `scope`, that `ref` refers to.
 * @param {Scope} scope
 * @param {Reference} ref
 * @returns {Variable} The variable, or null if ref refers to an undeclared variable.
 */
function getDeclaredGlobalVariable(scope, ref) {
    var declaredGlobal = null;
    scope.variables.some(function(variable) {
        if (variable.name === ref.identifier.name) {
            // If it's an implicit global, it must have a `writeable` field (indicating it was declared)
            if (!isImplicitGlobal(variable) || Object.hasOwnProperty.call(variable, "writeable")) {  //$NON-NLS-0$
                declaredGlobal = variable;
                return true;
            }
        }
        return false;
    });
    return declaredGlobal;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = function(context) {

    "use strict";  //$NON-NLS-0$

    return {

        /**
         * @name Program
         * @description Linting for Program nodes
         * @function
         * @returns returns
         */
        "Program": function(/*node*/) {  //$NON-NLS-0$
			try {
	            var globalScope = context.getScope();
	
	            globalScope.through.forEach(function(ref) {
	                var variable = getDeclaredGlobalVariable(globalScope, ref),
	                    name = ref.identifier.name,
	                    reason;
	                if (!variable) {
	                    reason = 'not defined';
	                    context.report(ref.identifier, "'${0}' is ${1}.", {0:name, 1:reason});
	                } else if (ref.isWrite() && variable.writeable === false) {
	                    reason = 'read only';
	                    context.report(ref.identifier, "'${0}' is ${1}.", {0:name, 1:reason});
	                }
	            });
        	}
        	catch(ex) {
        		console.log(ex);
        	}
        }
    };

};

    return module.exports;
}));
