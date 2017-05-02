'use strict';

/**
 * The controller that manages the list of imposters
 * @module
 */

/**
 * Creates the imposters controller
 * @param {Object} protocols - the protocol implementations supported by mountebank
 * @param {Object} imposters - The map of ports to imposters
 * @param {Object} Imposter - The factory for creating new imposters
 * @param {Object} logger - The logger
 * @returns {{get: get, post: post, del: del, put: put}}
 */
function create (protocols, imposters, Imposter, logger) {
    var exceptions = require('../util/errors'),
        helpers = require('../util/helpers');

    function queryIsFalse (query, key) {
        return !helpers.defined(query[key]) || query[key].toLowerCase() !== 'false';
    }

    function queryBoolean (query, key) {
        return helpers.defined(query[key]) && query[key].toLowerCase() === 'true';
    }

    function deleteAllImposters () {
        var Q = require('q'),
            ids = Object.keys(imposters),
            promises = ids.map(function (id) { return imposters[id].stop(); });

        ids.forEach(function (id) { delete imposters[id]; });
        return Q.all(promises);
    }

    function validatePort (port, errors) {
        var portIsValid = !helpers.defined(port) || (port.toString().indexOf('.') === -1 && port > 0 && port < 65536);

        if (!portIsValid) {
            errors.push(exceptions.ValidationError("invalid value for 'port'"));
        }
    }

    function validateProtocol (protocol, errors) {
        var Protocol = protocols[protocol];

        if (!helpers.defined(protocol)) {
            errors.push(exceptions.ValidationError("'protocol' is a required field"));
        }
        else if (!Protocol) {
            errors.push(exceptions.ValidationError('the ' + protocol + ' protocol is not yet supported'));
        }
    }

    function validate (request) {
        var Q = require('q'),
            errors = [],
            valid = Q({ isValid: false, errors: errors });

        validatePort(request.port, errors);
        validateProtocol(request.protocol, errors);

        if (errors.length > 0) {
            return valid;
        }
        else {
            var imposterState = {};
            return protocols[request.protocol].Validator.create().validate(request, logger, imposterState);
        }
    }

    function respondWithValidationErrors (response, validationErrors) {
        logger.warn('error creating imposter: ' + JSON.stringify(exceptions.details(validationErrors)));
        response.statusCode = 400;
        response.send({ errors: validationErrors });
    }

    function respondWithCreationError (response, error) {
        logger.warn('error creating imposter: ' + JSON.stringify(exceptions.details(error)));
        response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
        response.send({ errors: [error] });
    }

    function getJSON (options) {
        return Object.keys(imposters).reduce(function (accumulator, id) {
            return accumulator.concat(imposters[id].toJSON(options));
        }, []);
    }

    function requestDetails (request) {
        return helpers.socketName(request.socket) + ' => ' + JSON.stringify(request.body);
    }

    /**
     * The function responding to GET /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     */
    function get (request, response) {
        response.format({
            json: function () {
                var url = require('url'),
                    query = url.parse(request.url, true).query,
                    options = {
                        replayable: queryBoolean(query, 'replayable'),
                        removeProxies: queryBoolean(query, 'removeProxies'),
                        list: !(queryBoolean(query, 'replayable') || queryBoolean(query, 'removeProxies'))
                    };

                response.send({ imposters: getJSON(options) });
            },
            html: function () {
                response.render('imposters', { imposters: getJSON() });
            }
        });
    }
		function saveImposter(imposter) { 
        var mountebank = require("../mountebank");            
        var flag_status = (mountebank.saveImposters_flag).toString();        
        if (flag_status.localeCompare("true")==0) {
        var path = require("path");   
        var fs = require('fs');                    
        fs.appendFileSync("store_imposters.json", imposter.trim()+",");
        var text = fs.readFileSync("store_imposters.json", "utf-8");        
        fs.writeFileSync("imposters_template.json", "{\"imposters\":["+text.slice(0,-1)+"]}");
        var text_final = fs.readFileSync("imposters_template.json", "utf-8");
        var parseImposter=JSON.parse(text_final);
        var arrayStruc = JSON.stringify(parseImposter.imposters);         
        var myArray = [];
        var portCollection =[];        
        var text_final = fs.readFileSync("imposters_template.json", "utf-8");
        var parseImposter=JSON.parse(text_final);     
        (parseImposter.imposters).forEach(function (parse) {  
            delete parse._links;                             
            var savePort = JSON.stringify(parse.port);
            if (portCollection.indexOf(savePort) ==-1) {                             
                myArray.push(parse)               
                portCollection.push(savePort)                
            }             
        });              
        fs.writeFileSync("imposters_template.json", "{\"imposters\":"+JSON.stringify(myArray)+"}");        
            }            

       }
    /**
     * The function responding to POST /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    function post (request, response) {
        var protocol = request.body.protocol,
            validationPromise = validate(request.body);

        logger.debug(requestDetails(request));

        return validationPromise.then(function (validation) {
            var Q = require('q');

            if (validation.isValid) {
                return Imposter.create(protocols[protocol], request.body).then(function (imposter) {
                    imposters[imposter.port] = imposter;
                    response.setHeader('Location', imposter.url);
                    response.statusCode = 201;
                    response.send(imposter.toJSON());
					var store_1= JSON.stringify(imposter); 
                    saveImposter(store_1);
                }, function (error) {
                    respondWithCreationError(response, error);
                });
            }
            else {
                respondWithValidationErrors(response, validation.errors);
                return Q(false);
            }
        });
    }
		function deleteAllimposter(id){ 
        var path = require("path");   
        var fs = require('fs');         
        var myArray = []; 
        var myArrayStored = [];                         
        var text_final = fs.readFileSync("imposters_template.json", "utf-8");
        if (text_final!=="") {            
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
           text_final_Stored_DeleteComma.replace(/^,/, '')
           fs.writeFileSync("store_imposters.json", "");
         }
       }
        }
    /**
     * The function responding to DELETE /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    function del (request, response) {
        var url = require('url'),
            query = url.parse(request.url, true).query,
            options = {
                // default to replayable for backwards compatibility
                replayable: queryIsFalse(query, 'replayable'),
                removeProxies: queryBoolean(query, 'removeProxies')
            },
            json = getJSON(options);
            json.forEach(function(id) {
                var id = id.port;
                deleteAllimposter(id);                
            })

        return deleteAllImposters().then(function () {
            response.send({ imposters: json });
        });
    }

    /**
     * The function responding to PUT /imposters
     * @memberOf module:controllers/impostersController#
     * @param {Object} request - the HTTP request
     * @param {Object} response - the HTTP response
     * @returns {Object} A promise for testing purposes
     */
    function put (request, response) {
        var Q = require('q'),
            requestImposters = request.body.imposters || [],
            validationPromises = requestImposters.map(function (imposter) {
                return validate(imposter, logger);
            });

        logger.debug(requestDetails(request));

        return Q.all(validationPromises).then(function (validations) {
            var isValid = validations.every(function (validation) {
                return validation.isValid;
            });

            if (isValid) {
                return deleteAllImposters().then(function () {
                    var creationPromises = request.body.imposters.map(function (imposter) {
                        var store_EJS= JSON.stringify(imposter);                        
                        saveImposter(store_EJS);
                        return Imposter.create(protocols[imposter.protocol], imposter);
                    });

                    return Q.all(creationPromises);
                }).then(function (allImposters) {
                    var json = allImposters.map(function (imposter) {
                        return imposter.toJSON({ list: true });
                    });
                    allImposters.forEach(function (imposter) {
                        imposters[imposter.port] = imposter;
                    });
                    response.send({ imposters: json });
                }, function (error) {
                    respondWithCreationError(response, error);
                });
            }
            else {
                var validationErrors = validations.reduce(function (accumulator, validation) {
                    return accumulator.concat(validation.errors);
                }, []);

                respondWithValidationErrors(response, validationErrors);
                return Q(false);
            }
        });
    }

    return {
        get: get,
        post: post,
        del: del,
        put: put
    };
}

module.exports = {
    create: create
};
