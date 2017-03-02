'use strict';

var assert = require('assert'),
    promiseIt = require('../../testHelpers').promiseIt,
    behaviors = require('../../../src/models/behaviors'),
    Logger = require('../../fakes/fakeLogger');

describe('behaviors', function () {
    describe('#copy', function () {
        promiseIt('should support copying regex match from request', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex match from request with ignoreCase', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'MOUNT\\w+$',
                            options: { ignoreCase: true }
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex match from request with multiline', function () {
            var request = { data: 'First line\nMy name is mountebank\nThird line' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'mount\\w+$',
                            options: { multiline: true }
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should not replace if regex does not match', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: {
                            method: 'regex',
                            selector: 'Mi nombre es (\\w+)$'
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should support copying regex match into object response field', function () {
            var request = { data: 'My name is mountebank' },
                response = { outer: { inner: 'Hello, ${you}' } },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { outer: { inner: 'Hello, mountebank' } });
            });
        });

        promiseIt('should support copying regex match into all response fields', function () {
            var request = { data: 'My name is mountebank' },
                response = { data: '${you}', outer: { inner: 'Hello, ${you}' } },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'mountebank', outer: { inner: 'Hello, mountebank' } });
            });
        });

        promiseIt('should support copying regex match from object request field', function () {
            var request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: { data: 'name' },
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex match from object request field ignoring case of key', function () {
            var request = { data: { name: 'My name is mountebank', other: 'ignore' } },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: { data: 'NAME' },
                        into: '${you}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support copying regex indexed groups from request', function () {
            var request = { name: 'The date is 2016-12-29' },
                response = { data: 'Year ${DATE}[1], Month ${DATE}[2], Day ${DATE}[3]: ${DATE}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'name',
                        into: '${DATE}',
                        using: { method: 'regex', selector: '(\\d{4})-(\\d{2})-(\\d{2})' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Year 2016, Month 12, Day 29: 2016-12-29' });
            });
        });

        promiseIt('should default to first value in multi-valued request field', function () {
            var request = { data: ['first', 'second', 'third'] },
                response = { data: 'Grabbed the ${num}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'data',
                        into: '${num}',
                        using: { method: 'regex', selector: '\\w+$' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Grabbed the first' });
            });
        });

        promiseIt('should support copying xpath match into response', function () {
            var request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should ignore xpath if does not match', function () {
            var request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//title' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should ignore xpath if field is not xml', function () {
            var request = { field: '' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//title' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
                logger.warn.assertLogged('[xmldom error]\tinvalid doc source\n@#[line:undefined,col:undefined] (source: "")');
            });
        });

        promiseIt('should support replacing token with xml attribute', function () {
            var request = { field: '<doc><tool name="mountebank">Service virtualization</tool></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//tool/@name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support replacing token with xml direct text', function () {
            var request = { field: '<doc><name>mountebank</name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'xpath', selector: '//name/text()' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support replacing token with namespaced xml field', function () {
            var request = { field: '<doc xmlns:mb="http://example.com/mb"><mb:name>mountebank</mb:name></doc>' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: {
                            method: 'xpath',
                            selector: '//mb:name',
                            ns: { mb: 'http://example.com/mb' }
                        }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should support multiple indexed xpath matches into response', function () {
            var request = { field: '<doc><num>3</num><num>2</num><num>1</num></doc>' },
                response = { data: '${NUM}, ${NUM}[1], ${NUM}[2]' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${NUM}',
                        using: { method: 'xpath', selector: '//num' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: '3, 2, 1' });
            });
        });

        promiseIt('should ignore jsonpath selector if field is not json', function () {
            var request = { field: 'mountebank' },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
                logger.warn.assertLogged('Cannot parse as JSON: "mountebank"');
            });
        });

        promiseIt('should support replacing token with jsonpath selector', function () {
            var request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..name' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, mountebank' });
            });
        });

        promiseIt('should not replace token if jsonpath selector does not match', function () {
            var request = { field: JSON.stringify({ name: 'mountebank' }) },
                response = { data: 'Hello, ${you}' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${you}',
                        using: { method: 'jsonpath', selector: '$..title' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: 'Hello, ${you}' });
            });
        });

        promiseIt('should support replacing multiple indexed tokens with jsonpath selector', function () {
            var request = { field: JSON.stringify({ numbers: [{ key: 3 }, { key: 2 }, { key: 1 }] }) },
                response = { data: '${NUM}, ${NUM}[1], ${NUM}[2]' },
                logger = Logger.create(),
                config = {
                    copy: [{
                        from: 'field',
                        into: '${NUM}',
                        using: { method: 'jsonpath', selector: '$..key' }
                    }]
                };

            return behaviors.execute(request, response, config, logger).then(function (actualResponse) {
                assert.deepEqual(actualResponse, { data: '3, 2, 1' });
            });
        });

        it('should not be valid if not an array', function () {
            var errors = behaviors.validate({
                copy: {}
            });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: '"copy" behavior must be an array',
                source: { copy: {} }
            }]);
        });

        it('should not be valid if missing "from" field', function () {
            var config = { into: 'TOKEN', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field required',
                source: config
            }]);
        });

        it('should not be valid if "from" field is not a string or an object', function () {
            var config = { from: 0, into: 'TOKEN', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must be a string or an object, representing the request field to select from',
                source: config
            }]);
        });

        it('should not be valid if "from" object field has zero keys', function () {
            var config = {
                    from: {},
                    into: 'TOKEN',
                    using: { method: 'regex', selector: '.*' }
                },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must have exactly one key per object',
                source: config
            }]);
        });

        it('should not be valid if "from" object field has multiple keys', function () {
            var config = {
                    from: { first: 'first', second: 'second' },
                    into: 'TOKEN',
                    using: { method: 'regex', selector: '.*' }
                },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "from" field must have exactly one key per object',
                source: config
            }]);
        });

        it('should not be valid if missing "into" field', function () {
            var config = { from: 'field', using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "into" field required',
                source: config
            }]);
        });

        it('should not be valid if "into" field is not a string', function () {
            var config = { from: 'field', into: 0, using: { method: 'regex', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "into" field must be a string, representing the token to replace in response fields',
                source: config
            }]);
        });

        it('should not be valid if missing "using" field', function () {
            var config = { from: 'field', into: 'TOKEN' },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using" field required',
                source: config
            }]);
        });

        it('should not be valid if "using.method" field is missing', function () {
            var config = { from: 'field', into: 'TOKEN', using: { selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.method" field required',
                source: config
            }]);
        });

        it('should not be valid if "using.method" field is not supported', function () {
            var config = { from: 'field', into: 'TOKEN', using: { method: 'INVALID', selector: '.*' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.method" field must be one of [regex, xpath, jsonpath]',
                source: config
            }]);
        });

        it('should not be valid if "using.selector" field is missing', function () {
            var config = { from: 'field', into: 'TOKEN', using: { method: 'regex' } },
                errors = behaviors.validate({ copy: [config] });
            assert.deepEqual(errors, [{
                code: 'bad data',
                message: 'copy behavior "using.selector" field required',
                source: config
            }]);
        });
    });
});
