'use strict';

/**
 * The functionality behind the _behaviors field in the API, supporting post-processing responses
 * @module
 */

// The following schemas are used by both the lookup and copy behaviors and should be kept consistent
var fromSchema = {
        _required: true,
        _allowedTypes: {
            string: {},
            object: { singleKeyOnly: true }
        },
        _additionalContext: 'the request field to select from'
    },
    intoSchema = {
        _required: true,
        _allowedTypes: { string: {} },
        _additionalContext: 'the token to replace in response fields'
    },
    usingSchema = {
        _required: true,
        _allowedTypes: { object: {} },
        method: {
            _required: true,
            _allowedTypes: { string: { enum: ['regex', 'xpath', 'jsonpath'] } }
        },
        selector: {
            _required: true,
            _allowedTypes: { string: {} }
        }
    },
    validations = {
        wait: {
            wait: {
                _required: true,
                _allowedTypes: { string: {}, number: { nonNegativeInteger: true } }
            }
        },
        repeat: {
            repeat: {
                _required: true,
                _allowedTypes: { number: { positiveInteger: true } }
            }
        },
        copy: {
            copy: [{
                from: fromSchema,
                into: intoSchema,
                using: usingSchema
            }]
        },
        lookup: {
            lookup: [{
                key: {
                    _required: true,
                    _allowedTypes: { object: {} },
                    from: fromSchema,
                    using: usingSchema
                },
                fromDataSource: {
                    _required: true,
                    _allowedTypes: { object: { singleKeyOnly: true, enum: ['csv'] } },
                    csv: {
                        _required: false,
                        _allowedTypes: { object: {} },
                        path: {
                            _required: true,
                            _allowedTypes: { string: {} },
                            _additionalContext: 'the path to the CSV file'
                        },
                        keyColumn: {
                            _required: true,
                            _allowedTypes: { string: {} },
                            _additionalContext: 'the column header to select against the "key" field'
                        }
                    }
                },
                into: intoSchema
            }]
        },
        shellTransform: {
            shellTransform: {
                _required: true,
                _allowedTypes: { string: {} },
                _additionalContext: 'the path to a command line application'
            }
        },
        decorate: {
            decorate: {
                _required: true,
                _allowedTypes: { string: {} },
                _additionalContext: 'a JavaScript function'
            }
        }
    };

/**
 * Validates the behavior configuration and returns all errors
 * @param {Object} config - The behavior configuration
 * @returns {Object} The array of errors
 */
function validate (config) {
    var validator = require('./behaviorsValidator').create();
    return validator.validate(config, validations);
}

/**
 * Waits a specified number of milliseconds before sending the response.  Due to the approximate
 * nature of the timer, there is no guarantee that it will wait the given amount, but it will be close.
 * @param {Object} request - The request object
 * @param {Object} responsePromise -kThe promise returning the response
 * @param {number} millisecondsOrFn - The number of milliseconds to wait before returning, or a function returning milliseconds
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object} A promise resolving to the response
 */
function wait (request, responsePromise, millisecondsOrFn, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    var util = require('util'),
        fn = util.format('(%s)()', millisecondsOrFn),
        milliseconds = parseInt(millisecondsOrFn),
        Q = require('q'),
        exceptions = require('../util/errors');

    if (isNaN(milliseconds)) {
        try {
            milliseconds = eval(fn);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(fn));
            return Q.reject(exceptions.InjectionError('invalid wait injection',
                { source: millisecondsOrFn, data: error.message }));
        }
    }

    logger.debug('Waiting %s ms...', milliseconds);
    return responsePromise.delay(milliseconds);
}

function quoteForShell (obj) {
    var json = JSON.stringify(obj),
        isWindows = require('os').platform().indexOf('win') === 0,
        util = require('util');

    if (isWindows) {
        // Confused? Me too. All other approaches I tried were spectacular failures
        // in both 1) keeping the JSON as a single CLI arg, and 2) maintaining the inner quotes
        return util.format('"%s"', json.replace(/"/g, '\\"'));
    }
    else {
        return util.format("'%s'", json);
    }
}

/**
 * Runs the response through a shell function, passing the JSON in as stdin and using
 * stdout as the new response
 * @param {Object} request - Will be the first arg to the command
 * @param {Object} responsePromise - The promise chain for building the response, which will be the second arg
 * @param {string} command - The shell command to execute
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function shellTransform (request, responsePromise, command, logger) {
    if (request.isDryRun) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var Q = require('q'),
            deferred = Q.defer(),
            util = require('util'),
            exec = require('child_process').exec,
            fullCommand = util.format('%s %s %s', command, quoteForShell(request), quoteForShell(response));

        logger.debug('Shelling out to %s', command);
        logger.debug(fullCommand);

        exec(fullCommand, function (error, stdout, stderr) {
            if (error) {
                if (stderr) {
                    logger.error(stderr);
                }
                deferred.reject(error.message);
            }
            else {
                logger.debug("Shell returned '%s'", stdout);
                try {
                    deferred.resolve(Q(JSON.parse(stdout)));
                }
                catch (err) {
                    deferred.reject(util.format("Shell command returned invalid JSON: '%s'", stdout));
                }
            }
        });
        return deferred.promise;
    });
}

/**
 * Runs the response through a post-processing function provided by the user
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} fn - The function that performs the post-processing
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function decorate (originalRequest, responsePromise, fn, logger) {
    if (originalRequest.isDryRun === true) {
        return responsePromise;
    }

    return responsePromise.then(function (response) {
        var Q = require('q'),
            helpers = require('../util/helpers'),
            request = helpers.clone(originalRequest),
            injected = '(' + fn + ')(request, response, logger);',
            exceptions = require('../util/errors');

        try {
            // Support functions that mutate response in place and those
            // that return a new response
            var result = eval(injected);
            if (!result) {
                result = response;
            }
            return Q(result);
        }
        catch (error) {
            logger.error('injection X=> ' + error);
            logger.error('    full source: ' + JSON.stringify(injected));
            logger.error('    request: ' + JSON.stringify(request));
            logger.error('    response: ' + JSON.stringify(response));
            return Q.reject(exceptions.InjectionError('invalid decorator injection', { source: injected, data: error.message }));
        }
    });
}

function getKeyIgnoringCase (obj, expectedKey) {
    return Object.keys(obj).find(function (key) {
        if (key.toLowerCase() === expectedKey.toLowerCase()) {
            return key;
        }
        else {
            return undefined;
        }
    });
}

function getFrom (obj, from) {
    if (typeof from === 'object') {
        var keys = Object.keys(from);
        return getFrom(obj[keys[0]], from[keys[0]]);
    }
    else {
        var result = obj[getKeyIgnoringCase(obj, from)],
            util = require('util');

        // Some request fields, like query parameters, can be multi-valued
        if (util.isArray(result)) {
            return result[0];
        }
        else {
            return result;
        }
    }
}

function regexFlags (options) {
    var result = '';
    if (options && options.ignoreCase) {
        result += 'i';
    }
    if (options && options.multiline) {
        result += 'm';
    }
    return result;
}

function getMatches (selectionFn, selector, logger) {
    var matches = selectionFn();

    if (matches && matches.length > 0) {
        return matches;
    }
    else {
        logger.debug('No match for "%s"', selector);
        return [];
    }
}

function regexValue (from, config, logger) {
    var regex = new RegExp(config.using.selector, regexFlags(config.using.options)),
        selectionFn = function () { return regex.exec(from); };
    return getMatches(selectionFn, regex, logger);
}

function xpathValue (from, config, logger) {
    var selectionFn = function () {
        var xpath = require('./xpath');
        return xpath.select(config.using.selector, config.using.ns, from, logger);
    };
    return getMatches(selectionFn, config.using.selector, logger);
}

function jsonpathValue (from, config, logger) {
    var selectionFn = function () {
        var jsonpath = require('./jsonpath');
        return jsonpath.select(config.using.selector, from, logger);
    };
    return getMatches(selectionFn, config.using.selector, logger);
}

function globalStringReplace (str, substring, newSubstring, logger) {
    if (substring !== newSubstring) {
        logger.debug('Replacing %s with %s', JSON.stringify(substring), JSON.stringify(newSubstring));
        return str.split(substring).join(newSubstring);
    }
    else {
        return str;
    }
}

function globalObjectReplace (obj, replacer) {
    Object.keys(obj).forEach(function (key) {
        if (typeof obj[key] === 'string') {
            obj[key] = replacer(obj[key]);
        }
        else if (typeof obj[key] === 'object') {
            globalObjectReplace(obj[key], replacer);
        }
    });
}

function replaceArrayValuesIn (response, token, values, logger) {
    var replacer = function (field) {
        values.forEach(function (replacement, index) {
            // replace ${TOKEN}[1] with indexed element
            var util = require('util'),
                indexedToken = util.format('%s[%s]', token, index);
            field = globalStringReplace(field, indexedToken, replacement, logger);
        });
        if (values.length > 0) {
            // replace ${TOKEN} with first element
            field = globalStringReplace(field, token, values[0], logger);
        }
        return field;
    };

    globalObjectReplace(response, replacer);
}

/**
 * Copies a value from the request and replaces response tokens with that value
 * @param {Object} originalRequest - The request object, in case post-processing depends on it
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} copyArray - The list of values to copy
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function copy (originalRequest, responsePromise, copyArray, logger) {
    return responsePromise.then(function (response) {
        var Q = require('q');
        copyArray.forEach(function (copyConfig) {
            var from = getFrom(originalRequest, copyConfig.from),
                using = copyConfig.using || {},
                fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
                values = fnMap[using.method](from, copyConfig, logger);

            replaceArrayValuesIn(response, copyConfig.into, values, logger);
        });
        return Q(response);
    });
}

function createRowObject (headers, rowArray) {
    var row = {};
    rowArray.forEach(function (value, index) {
        row[headers[index]] = value;
    });
    return row;
}

function selectRowFromCSV (csvConfig, keyValue, logger) {
    var fs = require('fs'),
        Q = require('q'),
        helpers = require('../util/helpers'),
        headers,
        inputStream = fs.createReadStream(csvConfig.path),
        parser = require('csv-parse')({ delimiter: ',' }),
        pipe = inputStream.pipe(parser),
        deferred = Q.defer();

    inputStream.on('error', function (e) {
        logger.error('Cannot read ' + csvConfig.path + ': ' + e);
        deferred.resolve({});
    });

    pipe.on('data', function (rowArray) {
        if (!helpers.defined(headers)) {
            headers = rowArray;
        }
        else {
            var row = createRowObject(headers, rowArray);
            if (row[csvConfig.keyColumn].localeCompare(keyValue) === 0) {
                deferred.resolve(row);
            }
        }
    });

    pipe.on('end', function () {
        deferred.resolve({});
    });

    return deferred.promise;
}

function lookupRow (lookupConfig, originalRequest, logger) {
    var Q = require('q'),
        from = getFrom(originalRequest, lookupConfig.key.from),
        fnMap = { regex: regexValue, xpath: xpathValue, jsonpath: jsonpathValue },
        keyValues = fnMap[lookupConfig.key.using.method](from, lookupConfig.key, logger),
        index = lookupConfig.key.index || 0;

    if (lookupConfig.fromDataSource.csv) {
        return selectRowFromCSV(lookupConfig.fromDataSource.csv, keyValues[index], logger);
    }
    else {
        return Q({});
    }
}

function replaceObjectValuesIn (response, token, values, logger) {
    var replacer = function (field) {
        Object.keys(values).forEach(function (key) {
            var util = require('util');

            // replace ${TOKEN}["key"] and ${TOKEN}['key'] and ${TOKEN}[key]
            ['"', "'", ''].forEach(function (quoteChar) {
                var quoted = util.format('%s[%s%s%s]', token, quoteChar, key, quoteChar);
                field = globalStringReplace(field, quoted, values[key], logger);
            });
        });
        return field;
    };

    globalObjectReplace(response, replacer);
}


/**
 * Looks up request values from a data source and replaces response tokens with the resulting data
 * @param {Object} originalRequest - The request object
 * @param {Object} responsePromise - The promise returning the response
 * @param {Function} lookupArray - The list of lookup configurations
 * @param {Object} logger - The mountebank logger, useful in debugging
 * @returns {Object}
 */
function lookup (originalRequest, responsePromise, lookupArray, logger) {
    return responsePromise.then(function (response) {
        var Q = require('q'),
            lookupPromises = lookupArray.map(function (lookupConfig) {
                return lookupRow(lookupConfig, originalRequest, logger).then(function (row) {
                    replaceObjectValuesIn(response, lookupConfig.into, row, logger);
                });
            });
        return Q.all(lookupPromises).then(function () { return Q(response); });
    }).catch(function (error) {
        logger.error(error);
    });
}


// swagger functions
function getMockValue (api, schema) {
    var _ = require('lodash-compat'),
        type = _.isPlainObject(schema) ? schema.type : schema,
        version = api.version,
        value;

    if (!type) {
        type = 'object';
    }

    switch (type) {
        case 'array':
            value = [getMockValue(api, _.isArray(schema.items) ? schema.items[0] : schema.items)];

            break;

        case 'boolean':
            if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
                value = schema.defaultValue;
            }
            else if (version === '2.0' && !_.isUndefined(schema.default)) {
                value = schema.default;
            }
            else if (_.isArray(schema.enum)) {
                value = schema.enum[0];
            }
            else {
                value = 'true';
            }

    // Convert value if necessary
            value = !!(value === 'true' || value === true);

            break;

        case 'file':
        case 'File':
            value = 'Pretend this is some file content';

            break;

        case 'integer':
            if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
                value = schema.defaultValue;
            }
            else if (version === '2.0' && !_.isUndefined(schema.default)) {
                value = schema.default;
            }
            else if (_.isArray(schema.enum)) {
                value = schema.enum[0];
            }
            else {
                value = 1;
            }

    // Convert value if necessary
            if (!_.isNumber(value)) {
                value = parseInt(value, 10);
            }

            break;

        case 'object':
            value = {};

            _.each(schema.allOf, function (parentSchema) {
                _.each(parentSchema.properties, function (property, propName) {
                    value[propName] = getMockValue(api, property);
                });
            });

            _.each(schema.properties, function (property, propName) {
                if (property.readOnly !== true) {
                    value[propName] = getMockValue(api, property);
                }
            });

            break;

        case 'number':
            if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
                value = schema.defaultValue;
            }
            else if (version === '2.0' && !_.isUndefined(schema.default)) {
                value = schema.default;
            }
            else if (_.isArray(schema.enum)) {
                value = schema.enum[0];
            }
            else {
                value = 1.0;
            }

    // Convert value if necessary
            if (!_.isNumber(value)) {
                value = parseFloat(value);
            }

            break;

        case 'string':
            if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
                value = schema.defaultValue;
            }
            else if (version === '2.0' && !_.isUndefined(schema.default)) {
                value = schema.default;
            }
            else if (_.isArray(schema.enum)) {
                value = schema.enum[0];
            }
            else if (schema.format === 'date') {
                value = new Date().toISOString().split('T')[0];
            }
            else if (schema.format === 'date-time') {
                value = new Date().toISOString();
            }
            else {
                value = 'Sample text';
            }

            break;
    }
    return value;
}

function valueType (api, input) {
    var _ = require('lodash-compat'),
        item = input.type,
        value;

    if (input.in === 'body') {
        var schemadef = input.schema,
            parsedRequest = JSON.stringify(getMockValue(api, schemadef));
        value = JSON.stringify(parsedRequest);
    }

    switch (item) {
        case 'string':
            if (!_.isUndefined(input.default)) {
                value = input.default;
            }
            else if (_.isArray(input.enum)) {
                value = input.enum[0];
            }
            else if (input.format === 'float' || input.format === 'double') {
                value = '^[+-]?\d+(\.\d+)?$';
            }
            else {
                value = '.+';
            }

            break;

        case 'integer':
            if (!_.isUndefined(input.default)) {
                value = input.default;
            }
            else {
                value = '\\d+';
            }

            break;

        case 'boolean':
            value = true;
            value = !!(value === 'true' || value === true);

            break;

    }
    return value;
}

function getParamvalues (api, body, parameters, paths) {
    var inValues = [],
        baseParams = ['header', 'query', 'path', 'body'],
        requestHeader = '',
        queryparams = '',
        urlparams = '\n\t\t  "query": {#query},',
        headerparams = '\n\t\t  "headers": {#req_header},',
        requestBody = ',\n\t\t  "body": #req_body';

    if (parameters.length > 0) {
        for (var i = 0; i < parameters.length; i += 1) {
            var paramType = parameters[i];
            if (paramType.required === true) {
                inValues.push(paramType.in);
                if (paramType.in === 'query') {
                    queryparams += ',"#query": "#value"';
                    var queryValue = valueType(api, paramType);
                    var query = queryparams.replace('#value', queryValue);
                    queryparams = query.replace('#query', paramType.name);
                }
                else if (paramType.in === 'header') {
                    requestHeader += ',"#header": "#value"';
                    var headerValue = valueType(api, paramType);
                    var header = requestHeader.replace('#value', headerValue);
                    requestHeader = header.replace('#header', paramType.name);
                }
                else if (paramType.in === 'body') {
                    var reqBody = valueType(api, paramType);
                    body = body.replace('#req_body', reqBody);
                }
                else if (paramType.in === 'path') {
                    var url = '{' + paramType.name + '}',
                        path = body.replace('#path', paths[0]);
                    body = path.replace(url, '[^/]+');
                }
            }
        }

        inValues.forEach(function (token) {
            baseParams.forEach(function (value, index) {
                if (token === value) {
                    baseParams.splice(index, 1);
                }
            });
        });

        baseParams.forEach(function (param) {
            if (param === 'header') {
                body = body.replace(headerparams, '');
            }
            else if (param === 'query') {
                body = body.replace(urlparams, '');
            }
            else if (param === 'body') {
                body = body.replace(requestBody, '');
            }
        });
    }
    else {
        body = body.replace(urlparams, '').replace(headerparams, '').replace(requestBody, '');
    }
    var headervalues = requestHeader.replace(',', ''),
        paramvalues = queryparams.replace(',', ''),
        mapObj = {
            '#req_header': headervalues,
            '#query': paramvalues
        };
    body = body.replace(/\#req_header|\#query/gi, function (matched) {
        return mapObj[matched];
    });

    return body;
}

function createImposter (paths, methods, responses, codes, parameters, api) {

    var body = '{\n      "responses": [\n        {\n          "is": {\n\t\t   "statusCode": #statusCode,\n\t\t   "headers": {#res_header},\n           "body": #res_body\n          }\n        }],\n\t  "predicates": [{\n        "matches": {\n          "path": "#path",\n\t\t  "query": {#query},\n\t\t  "headers": {#req_header},\n\t\t  "method": "#method",\n\t\t  "body": #req_body\n        }\n        }\n      ]\n    }\n    ',
        imposterBody = '',
        bodywithParams = getParamvalues(api, body, parameters, paths),
        path;

    if (api.basePath !== undefined) {
        path = api.basePath + paths[0];
    }
    else { path = paths[0]; }

    var mapObj = {
        '#path': path,
        '#method': methods[0],
        '#res_header': ''
    };
    body = bodywithParams.replace(/\#path|\#method|\#res_header/gi, function (matched) {
        return mapObj[matched];
    });
    codes.forEach(function () {
        imposterBody = body + ',' + imposterBody;
    });

    responses.forEach(function (response, index) {
        imposterBody = imposterBody.replace('#res_body', response).replace('#statusCode', codes[index]);
    });

    return imposterBody;
}

function finalImposter (api, imposter) {
    var preImposterbody = '{\n  "port": "port",\n  "protocol": "protocol",\n  "name": "#name",\n  "stubs": [\n    ',
        buildImposterbody = '';
    imposter.forEach(function (responses) {
        buildImposterbody += responses;
    });
    var finalImposterbody = preImposterbody + buildImposterbody + ']\n}';
    var imposterStructure = finalImposterbody.replace(',]', ']').replace('#name', api.info.title);
    module.exports.imposterbodyExport = JSON.parse(imposterStructure);
    return imposterStructure;
}

function swagger (originalRequest, responsePromise, swaggerFile, logger) {
    return responsePromise.then(function (response) {
        var swaggerParser = require('swagger-parser'),
            Q = require('q'),
            swaggerPromises = swaggerParser.validate(swaggerFile).then(function (api) {

                var paths = [],
                    methods = [],
                    codes = [],
                    responses = [],
                    globalParams = [],
                    parameters = [],
                    finalBody = [];
                Object.keys(api.paths).forEach(function (path) {
                    paths.push(path);
                    Object.keys(api.paths[path]).forEach(function (method) {
                        if (method === 'parameters') {
                            (api.paths[path][method]).forEach(function (param) {
                                globalParams.push(param);
                            });
                        }
                        else {
                            methods.push(method);
                            var values = api.paths[path][method].parameters;
                            if (values !== undefined) {
                                values.forEach(function (parameter) {
                                    parameters.push(parameter);
                                });
                            }

                            if (globalParams !== null) {
                                globalParams.forEach(function (value) {
                                    parameters.push(value);
                                });
                            }
                            var responseBody = api.paths[path][method].responses;
                            Object.keys(api.paths[path][method].responses).forEach(function (code) {
                                if ((responseBody[code].schema) !== undefined) {
                                    var parsedResponse = JSON.stringify(getMockValue(api, responseBody[code].schema), null, '\t');
                                    responses.push(JSON.stringify(parsedResponse));
                                }
                                else { responses.push('""'); }
                                if (code === 'default') {
                                    code = 200;
                                }
                                codes.push(code);
                            });
                            finalBody.push(createImposter(paths, methods, responses, codes, parameters, api));
                            methods = [];
                            codes = [];
                            parameters = [];
                            responses = [];
                        }
                    });
                    paths = [];
                });

                finalImposter(api, finalBody);
                return response;
            });
        return Q.all(swaggerPromises).then(function () { return Q(response); });
    }).catch(function (error) {
        module.exports.parsererror = error;
        logger.error(error);
    });

}

// Array Handling main functions xpathArrayvalues, arrayHandling, arrayCopy
function xpathArrayvalues (from, copyConfig, logger) {
    var xpath = require('./xpath'), xvalue = [];
    (copyConfig.using.selector).forEach(function (selector) {
        var selectionFn = function () {
            var value = xpath.select(selector, copyConfig.using.ns, from, logger);
            xvalue.push(value);
        };
        return getMatches(selectionFn, selector, logger);
    });
    return xvalue;
}

function arrayHandling (originalRequest, responsePromise, config, logger) {
    var Q = require('q');
    return responsePromise.then(function (response) {
        config.forEach(function (arrayConfig) {
            var from = getFrom(originalRequest, arrayConfig.key.from),
                 // using = arrayConfig.key.using || {},
                fnMap = {
                    xpath: xpathArrayvalues
                },
                values = [];
            if (fnMap[arrayConfig.key.using.method]) {
                values = fnMap[arrayConfig.key.using.method](from, arrayConfig.key, logger);
            }
            var valuesinString = values.toString();
            var splitValues = valuesinString.split(',');
             // console.log("valuesinString  - > "+JSON.stringify(valuesinString));
            arrayCopy(originalRequest, arrayConfig, response, splitValues, logger);
        });
        return Q(response);
    });
}

function arrayCopy (originalRequest, arrayConfig, response, values) {
    var replaceResponse = '',
        reqArray = arrayConfig.arrayCopy.reqArray,
        resArray = arrayConfig.arrayCopy.resArray,
        intoResarray = arrayConfig.arrayCopy.intoResarray,
        dataInto = arrayConfig.dataInto,
        countReqArray = (originalRequest.body.match(new RegExp(reqArray, 'g')) || []).length,
        i, j, k, t, counter = 0,
        concatResArray = '';

    for (k = 0; k < countReqArray; k += 1) {
        concatResArray = concatResArray + '\n\r' + resArray;
    }

    for (i = 0; i < countReqArray; i += 1) {
        for (t = 0; t < intoResarray.length; t += 1) {
            for (j = counter; j < values.length; j += 1) {
                var regexstring = intoResarray[t];
                if (concatResArray.search(new RegExp(regexstring + '\\b', '')) !== -1) {
                    concatResArray = concatResArray.replace((new RegExp(regexstring + '\\b')), values[j]);
                    counter += 1;
                }
            }
        }
    }
    replaceResponse = response.body.replace(dataInto, concatResArray);
    response.body = replaceResponse;
}

/**
 * The entry point to execute all behaviors provided in the API
 * @param {Object} request - The request object
 * @param {Object} response - The response generated from the stubs
 * @param {Object} behaviors - The behaviors specified in the API
 * @param {Object} logger - The mountebank logger, useful for debugging
 * @returns {Object}
 */
function execute (request, response, behaviors, logger) {
    if (!behaviors) {
        return require('q')(response);
    }

    var Q = require('q'),
        combinators = require('../util/combinators'),
        waitFn = behaviors.wait ?
            function (result) { return wait(request, result, behaviors.wait, logger); } :
            combinators.identity,
        copyFn = behaviors.copy ?
            function (result) { return copy(request, result, behaviors.copy, logger); } :
            combinators.identity,
        lookupFn = behaviors.lookup ?
            function (result) { return lookup(request, result, behaviors.lookup, logger); } :
            combinators.identity,
        swaggerFn = behaviors.swagger ?
            function (result) { return swagger(request, result, behaviors.swagger, logger); } :
            combinators.identity,
        arrayHandlingFn = behaviors.arrayHandling ?
            function (result) { return arrayHandling(request, result, behaviors.arrayHandling, logger); } :
            combinators.identity,
        shellTransformFn = behaviors.shellTransform ?
            function (result) { return shellTransform(request, result, behaviors.shellTransform, logger); } :
            combinators.identity,
        decorateFn = behaviors.decorate ?
            function (result) { return decorate(request, result, behaviors.decorate, logger); } :
            combinators.identity;

    logger.debug('using stub response behavior ' + JSON.stringify(behaviors));

    return combinators.compose(decorateFn, shellTransformFn, copyFn, lookupFn, swaggerFn, arrayHandlingFn, waitFn, Q)(response);
}

module.exports = {
    validate: validate,
    execute: execute
};
