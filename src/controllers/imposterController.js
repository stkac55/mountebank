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
            recordImposter(imposter)
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
    
     function recordImposter(saveImposter){ 
        var path = require("path");   
        var fs = require('fs'); 
        var saveArray, saveArrayStored;  
        var arrayStruc =[];
        var resultPort = (saveImposter.port).toString()                 
        var text_final = fs.readFileSync("imposters_template.json", "utf-8");
        var parseImposter=JSON.parse(text_final);     
        (parseImposter.imposters).forEach(function (parse, index) {            
            var savePort = (parse.port).toString();                        
            if (savePort === resultPort) {                
                (parseImposter.imposters).splice(index, 1);               
                saveArray = parseImposter.imposters
                saveArray.push(saveImposter)                                                                
            }      
        });                       
        fs.writeFileSync("imposters_template.json", "{\"imposters\":"+JSON.stringify(saveArray)+"}");
        
        var text_final_Stored = fs.readFileSync("store_imposters.json", "utf-8");
        var constructStored = "["+text_final_Stored.slice(0,-1)+"]";
        var parseImposterStored=JSON.parse(constructStored)
        parseImposterStored.forEach(function (parseStored, index) {
            var savePortStored = (parseStored.port).toString();                        
            if (savePortStored === resultPort) {                
                parseImposterStored.splice(index, 1);                               
                parseImposterStored.push(saveImposter)                                                                
            }      
        });
         var eliminateArray = JSON.stringify(parseImposterStored);           
         var finalArray = eliminateArray.slice(1,-1); 
        fs.writeFileSync("store_imposters.json", finalArray+","); 
       }
    
    
	function deleteImposter(id){ 
        var path = require("path");   
        var fs = require('fs'); 
        var myArray = []; 
        var myArrayStored = [];               
        var text_final = fs.readFileSync("imposters_template.json", "utf-8");
        var parseImposter=JSON.parse(text_final);     
        (parseImposter.imposters).forEach(function (parse) {            
            var savePort = (parse.port).toString();
            var deletePort = id.toString();
            if (savePort !== deletePort) {
                myArray.push(parse)
            }          
        });         
         fs.writeFileSync("imposters_template.json", "{\"imposters\":"+JSON.stringify(myArray)+"}");
         var text_final_Stored = fs.readFileSync("store_imposters.json", "utf-8");
         var constructStored = "["+text_final_Stored.slice(0,-1)+"]";
         var parseImposterStored=JSON.parse(constructStored)
         parseImposterStored.forEach(function (parseStored) {
            var savePortStored = (parseStored.port).toString();
            var deletePortStored = id.toString();            
            if (savePortStored !==deletePortStored ) {                
                myArrayStored.push(parseStored)               
            }            
         })
         var eliminateArray = JSON.stringify(myArrayStored);          
         var finalArray = eliminateArray.slice(1,-1);                 
         fs.writeFileSync("store_imposters.json", finalArray.trim()+",");
         var text_final_Stored_DeleteComma = fs.readFileSync("store_imposters.json", "utf-8");
         if (text_final_Stored_DeleteComma == ","){
           text_final_Stored_DeleteComma.replace(/^\,/, '')
           fs.writeFileSync("store_imposters.json", "");
         }
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
