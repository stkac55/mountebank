'use strict';

/**
 * The controller that gets and deletes single imposters
 * @module
 */

/**
 * Creates the imposter controller
 * @param {Object} imposters - the map of ports to imposters
 * @returns {{get: get, del: del}}
 */
function create (imposters) {
    function queryBoolean (query, key) {
        var helpers = require('../util/helpers');

        if (!helpers.defined(query[key])) {
            return false;
        }
        return query[key].toLowerCase() === 'true';
    }

    /**
     * The function responding to GET /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        var url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') },
            imposter = imposters[request.params.id].toJSON(options);

        response.format({
            json: function () { response.send(imposter); },
            html: function () {
                if (request.headers['x-requested-with']) {
                    response.render('_imposter', { imposter: imposter });
                }
                else {
                    response.render('imposter', { imposter: imposter });
                }
            }
        });
    }
	function deleteImposter(id){ 
		var path = require("path");   
		var fs = require('fs');	
        var myArray = [];        
        var impostersSavetext = path.join(__dirname+ '/../../../imposters_template.json');          
        var text_final = fs.readFileSync(impostersSavetext, "utf-8");
        var parseImposter=JSON.parse(text_final);     
        (parseImposter.imposters).forEach(function (parse) {            
            var savePort = (parse.port).toString();
            var deletePort = id.toString();
            if (savePort !== deletePort) {
                myArray.push(parse)
            }          
        });         
         fs.writeFileSync(impostersSavetext, "{\"imposters\":"+JSON.stringify(myArray)+"}");
       }
    /**
     * The function responding to DELETE /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    function del (request, response) {
        var Q = require('q'),
            imposter = imposters[request.params.id],
            json = {},
            url = require('url'),
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };

        if (imposter) {
            json = imposter.toJSON(options);
            return imposter.stop().then(function () {
                delete imposters[request.params.id];
				var saveDelport = request.params.id;                
                deleteImposter(saveDelport);
                response.send(json);
            });
        }
        else {
            response.send(json);
            return Q(true);
        }
    }

    return {
        get: get,
        del: del
    };
}

module.exports = {
    create: create
};
