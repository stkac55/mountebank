'use strict';

/**
 * The controller that gets and deletes single imposters
 * @module
 */

var url = require('url'),
    fs = require('fs'),
    Q = require('q');

/**
 * Creates the imposter controller
 * @param {Object} imposters - the map of ports to imposters
 * @returns {{get: get, del: del}}
 */
function create (imposters) {

    function queryBoolean (query, key) {
        if (query[key] === undefined) {
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
        var query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') },
            imposter = imposters[request.params.id].toJSON(options);
            console.log("imposter    "+JSON.stringify(imposter));

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
        console.log("ID-------------> "+id) ;        
        //var arrayUniq = require('array-uniq');   
        var myArray = [];
        //var myArray1 = [];
        var text_final = fs.readFileSync('D:/Mountebank/mountebank-v1.9.0-win-x64/imposters_save_text.json', "utf-8");
        var parseImposter=JSON.parse(text_final);     
        (parseImposter.imposters).forEach(function (parse) {
            console.log("   ---------- "+ JSON.stringify(parse));
            var savePort = (parse.port).toString();
            var deletePort = id.toString();
            if (savePort !== deletePort) {
                myArray.push(parse)
            }          
        });
         console.log("After deleted port ----> " +JSON.stringify(myArray));
         fs.writeFileSync('D:/Mountebank/mountebank-v1.9.0-win-x64/imposters_save_text.json', "{\"imposters\":"+JSON.stringify(myArray)+"}");
       }

    /**
     * The function responding to DELETE /imposters/:port
     * @memberOf module:controllers/imposterController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing
     */
    function del (request, response) {       
        var imposter = imposters[request.params.id],
            json = {},
            query = url.parse(request.url, true).query,
            options = { replayable: queryBoolean(query, 'replayable'), removeProxies: queryBoolean(query, 'removeProxies') };

        if (imposter) {
            json = imposter.toJSON(options);
            return imposter.stop().then(function () {
                var saveDelport = request.params.id;
                console.log("request.params.id "+saveDelport);
                deleteImposter(saveDelport);                
                delete imposters[request.params.id];
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
