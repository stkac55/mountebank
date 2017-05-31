'use strict';

// swagger functions
function generateString (formatType, possibleEnum) {
    var Chance = require('chance'),
        chance = new Chance(),
        moment = require('moment'),
        btoa = require('btoa');
        
    if (possibleEnum !== undefined) {
        var randomArrayElement = possibleEnum[Math.floor(Math.random() * possibleEnum.length)];
        return randomArrayElement;
    }
    else {
        var randomProperty;
        switch (formatType) {
            case 'uuid':
                randomProperty = chance.guid();
                break;
            case 'email':
                randomProperty = chance.email({ domain: 'example.com' });
                break;
            case 'date-time':
                randomProperty = moment().format();
                break;
            case 'date':
                randomProperty = moment().format('YYYY-MM-DD');
                break;
            case 'password':
                randomProperty = 'password_' + chance.word({ length: 5 });
                break;
            case 'byte':
        // Generate a random word, then base64 encode it
                randomProperty = btoa(chance.word({ length: 5 }));
                break;
            case 'binary':
        // Generate a random string containing only 1's and 0's in sets of 8, with anywhere between 1 and 4 sets of 8 (8-32 bits total)
                randomProperty = chance.string({ pool: '01', length: 8 * chance.integer({ min: 1, max: 4 }) });
                break;
            case 'url':
                randomProperty = chance.url();
                break;
            case 'ipv4':
                randomProperty = chance.ip();
                break;
            case 'hostname':
                randomProperty = chance.domain();
                break;

      // when no format is specified (type is set to string without any additional format)
            case undefined:
                randomProperty = chance.word({ length: 10 });
                break;

            default :

                if ((formatType !== null) && (formatType !== undefined)) {
                    return formatType;
                }
      // at this point we have no definition for formatType. Regardless if propertyGenerationSetting is random or static, we throw an error
                console.error('ERROR: No value found for GenerationOptions[${'+ formatType +'}]. Please specify a value for ${'+ formatType +'} even if you wish to use random generation');
        }

        return randomProperty;
    }
}

function getMockValue (api, schema) {
    var _ = require('lodash-compat'),
        type = _.isPlainObject(schema) ? schema.type : schema,
        value;
    var Chance = require('chance'),
        chance = new Chance();


    if (!type) {
        type = 'object';
    }

    switch (type) {
        case 'array':
            value = [getMockValue(api, _.isArray(schema.items) ? schema.items[0] : schema.items)];

            break;

        case 'boolean':
            value = chance.bool();

            value = !!(value === 'true' || value === true);

            break;

        case 'file':
        case 'File':
            value = 'Pretend this is some file content';

            break;

        case 'integer':
            if (schema.enum !== undefined) {
                value = schema.enum[Math.floor(Math.random() * schema.enum.length)];
            }
            else {
                value = chance.integer({ min: -50, max: 100 });
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
                value[propName] = getMockValue(api, property);
            });

            break;

        case 'number':
            if (schema.enum !== undefined) {
                value = schema.enum[Math.floor(Math.random() * schema.enum.length)];
            }
            else {
                value = chance.integer({ min: -50, max: 100 });
            }

    // Convert value if necessary
            if (!_.isNumber(value)) {
                value = parseFloat(value);
            }

            break;

        case 'string':
            value = generateString(schema.format, schema.enum);

            break;
    }

    return value;
}

function getrequestMockValue (api, schema) {
    var _ = require('lodash-compat'),
        type = _.isPlainObject(schema) ? schema.type : schema,
        value;


    if (!type) {
        type = 'object';
    }

    switch (type) {
        case 'array':
            value = [getrequestMockValue(api, _.isArray(schema.items) ? schema.items[0] : schema.items)];

            break;

        case 'boolean':
            value = true;

            value = !!(value === 'true' || value === true);

            break;

        case 'file':
        case 'File':
            value = 'Pretend this is some file content';

            break;

        case 'integer':
            value = '\\d+';

            break;

        case 'object':
            value = {};

            _.each(schema.allOf, function (parentSchema) {
                _.each(parentSchema.properties, function (property, propName) {
                    value[propName] = getrequestMockValue(api, property);
                });
            });

            _.each(schema.properties, function (property, propName) {
                if (property.readOnly !== true) {
                    value[propName] = getrequestMockValue(api, property);
                }
            });

            break;

        case 'number':
            value = '\\d+';

            break;

        case 'string':
            value = '.+';

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
            parsedRequest = JSON.stringify(getrequestMockValue(api, schemadef));
        value = parsedRequest;
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
                value = '^[+-]?\\\\d+(\\\\.\\\\d+)?$';
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
                value = '\\\\d+';
            }

            break;
        
        case 'number':
            if (!_.isUndefined(input.default)) {
                value = input.default;
            }			
            else if (input.format === 'float' || input.format === 'double') {
                value = '^[+-]?\\\\d+(\\\\.\\\\d+)?$';
            }
            else {
                value = '\\\\d+';
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

function createbodyWithparams (api, parameters, paths, methods) {
    var body = '{\n      "responses": [\n        {\n          "is": {\n\t\t   "statusCode": #statusCode,\n\t\t   "headers": {#res_header},\n           "body": #res_body\n          }\n        }],\n\t  "predicates": [{\n        "matches": {\n          "path": "#path",\n\t\t  "query": {#query},\n\t\t  "headers": {#req_header},\n\t\t  "method": "#method",\n\t\t  "body": #req_body\n        }\n        }\n      ]\n    }\n    ',
        bodywithParams = getParamvalues(api, body, parameters, paths),
        path;

    if (api.basePath !== undefined) {
        path = api.basePath + paths[0];
    }
    else { path = paths[0]; }

    var mapObj = {
        '#path': path,
        '#method': methods[0]
    };
    body = bodywithParams.replace(/\#path|\#method/gi, function (matched) {
        return mapObj[matched];
    });

    return body;
}

function createImposter (bodyWithparams, resheaders, responses, codes) {

    var imposterBody = '';

    codes.forEach(function () {
        imposterBody = bodyWithparams + ',' + imposterBody;
    });

    responses.forEach(function (response, index) {
        imposterBody = imposterBody.replace('#res_body', response).replace('#statusCode', codes[index]).replace('#res_header', resheaders[index]);
    });

    return imposterBody;
}

function finalImposter (api, imposterPort, imposter) {
    var preImposterbody = '{\n  "port": ' + imposterPort + ',\n  "protocol": "#protocol",\n  "name": "#name",\n  "stubs": [\n    ',
        buildImposterbody = '';
    imposter.forEach(function (responses) {
        buildImposterbody += responses;
    });
    var finalImposterbody = preImposterbody + buildImposterbody + ']\n}';
    var imposterStructure = finalImposterbody.replace(',]', ']').replace('#name', api.info.title).replace('#protocol', api.schemes[0]);
    return imposterStructure;
}

function swagger (swaggerFile, imposterPort, mbPort) {
    var swaggerParser = require('swagger-parser'),
        imposter = require('request');
        
    swaggerParser.validate(swaggerFile).then(function (api) {

        var paths = [],
            methods = [],
            codes = [],
            responses = [],
            responseHeaders = [],
            globalParams = [],
            parameters = [],
            finalBody = [],
            resheaders = [],
            res;
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

                        if ((responseBody[code].headers) !== undefined) {
                            Object.keys(responseBody[code].headers).forEach(function (resHeader) {
                                responseHeaders.push(resHeader);
                            });
                        }
                        else {
                            responseHeaders.push('');
                        }

                        if (code === 'default') {
                            code = 200;
                        }
                        codes.push(code);

                        var responseHeader = '';

                        for (var j = 0; j < responseHeaders.length; j += 1) {
                            if (responseHeaders[j] !== '') {
                                responseHeader += ',"#header": "sample header"';
                                responseHeader = responseHeader.replace('#header', responseHeaders[j]);
                            }
                            else {
                                responseHeader = '';
                            }
                        }
                        resheaders.push(responseHeader.replace(',', ''));
                    });
                    var bodyWithparams = createbodyWithparams(api, parameters, paths, methods);

                    finalBody.push(createImposter(bodyWithparams, resheaders, responses, codes));
                    methods = [];
                    codes = [];
                    resheaders = [];
                    parameters = [];
                    responseHeaders = [];
                    responses = [];
                }
            });
            globalParams = [];
            paths = [];
        });

        res = JSON.parse(finalImposter(api, imposterPort, finalBody));
                
        imposter.post({
            url: 'http://localhost:' + mbPort + '/imposters',
            method: 'POST',
            json: true,
            body: res
        }, function () {

        });

        return res;
    }).catch(function (error) {
        delete error.mark;
        delete error.stack;
        console.error('Error:  ', error);
    });

}

module.exports = {
    swagger: swagger
};
