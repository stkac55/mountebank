'use strict';

var assert = require('assert'),
    api = require('../api'),
    BaseHttpClient = require('./baseHttpClient'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1,
    timeout = parseInt(process.env.MB_SLOW_TEST_TIMEOUT || 2000),
    helpers = require('../../../src/util/helpers');

['http', 'https'].forEach(function (protocol) {
    var client = BaseHttpClient.create(protocol);

    describe(protocol + ' imposter', function () {
        this.timeout(timeout);

        describe('POST /imposters with stubs', function () {
            promiseIt('should return stubbed response', function () {
                var stub = {
                        responses: [{
                            is: {
                                statusCode: 400,
                                headers: { 'X-Test': 'test header' },
                                body: 'test body',
                                query: {
                                    key: true
                                }
                            }
                        }]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);

                    return client.get('/test?key=true', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);
                    assert.strictEqual(response.body, 'test body');
                    assert.strictEqual(response.headers['x-test'], 'test header');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should allow a sequence of stubs as a circular buffer', function () {
                var stub = { responses: [{ is: { statusCode: 400 } }, { is: { statusCode: 405 } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);

                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 405);

                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400);

                    return client.get('/test', port);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 405);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should only return stubbed response if matches complex predicate', function () {
                var spec = {
                        path: '/test?key=value&next=true',
                        port: port,
                        method: 'POST',
                        headers: {
                            'X-One': 'Test',
                            'X-Two': 'Test',
                            'Content-Type': 'text/plain'
                        }
                    },
                    stub = {
                        responses: [{ is: { statusCode: 400 } }],
                        predicates: [
                            { equals: { path: '/test', method: 'POST' } },
                            { equals: { query: { key: 'value' } } },
                            { exists: { headers: { 'X-One': true } } },
                            { exists: { headers: { 'X-Two': true } } },
                            { equals: { headers: { 'X-Two': 'Test' } } },
                            { exists: { headers: { 'X-Three': false } } },
                            { not: { exists: { headers: { 'X-Four': true } } } },
                            { startsWith: { body: 'T' } },
                            { contains: { body: 'ES' } },
                            { endsWith: { body: 'T' } },
                            { matches: { body: '^TEST$' } },
                            { equals: { body: 'TEST' } },
                            { exists: { body: true } }
                        ]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function () {
                    var options = helpers.merge(spec, { path: '/', body: 'TEST' });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong path');

                    var options = helpers.merge(spec, { path: '/test?key=different', body: 'TEST' });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong query');

                    var options = helpers.merge(spec, { method: 'PUT', body: 'TEST' });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong method');

                    var options = helpers.merge(spec, { body: 'TEST' });
                    delete options.headers['X-One'];
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; missing header');

                    var options = helpers.merge(spec, { headers: { 'X-Two': 'Testing', body: 'TEST' } });
                    return client.responseFor(options);
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for header');

                    return client.responseFor(helpers.merge(spec, { body: 'TESTing' }));
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 200, 'should not have matched; wrong value for body');

                    return client.responseFor(helpers.merge(spec, { body: 'TEST' }));
                }).then(function (response) {
                    assert.strictEqual(response.statusCode, 400, 'should have matched');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should correctly handle deepEquals object predicates', function () {
                var stubWithEmptyObjectPredicate = {
                        responses: [{ is: { body: 'first stub' } }],
                        predicates: [{ deepEquals: { query: {} } }]
                    },
                    stubWithPredicateKeywordInObject = {
                        responses: [{ is: { body: 'second stub' } }],
                        predicates: [{ deepEquals: { query: { equals: 1 } } }]
                    },
                    stubWithTwoKeywordsInObject = {
                        responses: [{ is: { body: 'third stub' } }],
                        predicates: [{ deepEquals: { query: { equals: 'true', contains: false } } }]
                    },
                    stubs = [stubWithEmptyObjectPredicate, stubWithPredicateKeywordInObject, stubWithTwoKeywordsInObject],
                    request = { protocol: protocol, port: port, stubs: stubs, name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, JSON.stringify(response.body, null, 2));
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'first stub');
                    return client.get('/?equals=something', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, '');
                    return client.get('/?equals=1', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'second stub');
                    return client.get('/?contains=false&equals=true', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'third stub');
                    return client.get('/?contains=false&equals=true&matches=yes', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, '');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support sending binary response', function () {
                var buffer = new Buffer([0, 1, 2, 3]),
                    stub = { responses: [{ is: { body: buffer.toString('base64'), _mode: 'binary' } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return client.responseFor({ method: 'GET', port: port, path: '/', mode: 'binary' });
                }).then(function (response) {
                    assert.deepEqual(response.body.toJSON().data, [0, 1, 2, 3]);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support JSON bodies', function () {
                var stub = {
                        responses: [
                            {
                                is: {
                                    body: {
                                        key: 'value',
                                        sub: {
                                            'string-key': 'value'
                                        },
                                        arr: [1, 2]
                                    }
                                }
                            },
                            {
                                is: {
                                    body: {
                                        key: 'second request'
                                    }
                                }
                            }
                        ]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);

                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(JSON.parse(response.body), {
                        key: 'value',
                        sub: {
                            'string-key': 'value'
                        },
                        arr: [1, 2]
                    });
                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(JSON.parse(response.body), { key: 'second request' });
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support treating the body as a JSON object for predicate matching', function () {
                var stub = {
                        responses: [{ is: { body: 'SUCCESS' } }],
                        predicates: [
                            { equals: { body: { key: 'value' } } },
                            { equals: { body: { arr: 3 } } },
                            { deepEquals: { body: { key: 'value', arr: [2, 1, 3] } } },
                            { matches: { body: { key: '^v' } } }
                        ]
                    },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201);
                    return client.post('/', '{"key": "value", "arr": [3,2,1]}', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'SUCCESS');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support changing default response for stub', function () {
                var stub = {
                        responses: [
                            { is: { body: 'Wrong address' } },
                            { is: { statusCode: 500 } }
                        ],
                        predicates: [{ equals: { path: '/' } }]
                    },
                    defaultResponse = { statusCode: 404, body: 'Not found' },
                    request = { protocol: protocol, port: port, defaultResponse: defaultResponse, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(404, response.statusCode);
                    assert.strictEqual('Wrong address', response.body);
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(500, response.statusCode);
                    assert.strictEqual('Not found', response.body);
                    return client.get('/differentStub', port);
                }).then(function (response) {
                    assert.strictEqual(404, response.statusCode);
                    assert.strictEqual('Not found', response.body);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support keepalive connections', function () {
                var stub = { responses: [{ is: { body: 'Success' } }] },
                    defaultResponse = { headers: { CONNECTION: 'Keep-Alive' } }, // tests case-sensitivity of header match
                    request = { protocol: protocol, port: port, defaultResponse: defaultResponse, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(function (response) {
                    assert.strictEqual(response.body, 'Success');
                    assert.strictEqual(response.headers.connection, 'Keep-Alive');
                }).finally(function () {
                    return api.del('/imposters');
                });
            });

            promiseIt('should support sending multiple values back for same header', function () {
                var stub = { responses: [{ is: { headers: { 'Set-Cookie': ['first', 'second'] } } }] },
                    request = { protocol: protocol, port: port, stubs: [stub], name: this.name };

                return api.post('/imposters', request).then(function (response) {
                    assert.strictEqual(response.statusCode, 201, response.body);
                    return client.get('/', port);
                }).then(function (response) {
                    assert.deepEqual(response.headers['set-cookie'], ['first', 'second']);
                }).finally(function () {
                    return api.del('/imposters');
                });
            });
        });
    });
});
