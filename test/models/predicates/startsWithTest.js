'use strict';

var assert = require('assert'),
    predicates = require('../../../src/models/predicates');

describe('predicates', function () {
    describe('#startsWith', function () {
        it('should return false for request field not starting with expected', function () {
            var predicate = { startsWith: { field: 'middle' } },
                request = { field: 'begin middle end' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true for request field starting with expected', function () {
            var predicate = { startsWith: { field: 'begin' } },
                request = { field: 'begin middle end' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should be case insensitive by defaul', function () {
            var predicate = { startsWith: { field: 'BEGIN' } },
                request = { field: 'Begin middle end' };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should allow case insensitive', function () {
            var predicate = { startsWith: { field: 'BEGIN' }, caseSensitive: true },
                request = { field: 'Begin middle end' };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should match key-value pairs for objects', function () {
            var predicate = { startsWith: { headers: { key: 'begin' } } },
                request = { headers: { key: 'begin middle end' } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if no key for object', function () {
            var predicate = { startsWith: { headers: { key: 'begin' } } },
                request = { headers: {} };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return false if key for object does not start with string', function () {
            var predicate = { startsWith: { headers: { key: 'begin' } } },
                request = { headers: { key: 'middle end' } };
            assert.ok(!predicates.evaluate(predicate, request));
        });

        it('should return true if starts with binary sequence and encoding is base64', function () {
            var predicate = { startsWith: { field: new Buffer([1, 2]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(predicates.evaluate(predicate, request, 'base64'));
        });

        it('should return false if does not start with binary sequence and encoding is base64', function () {
            var predicate = { startsWith: { field: new Buffer([2]).toString('base64') } },
                request = { field: new Buffer([1, 2, 3, 4]).toString('base64') };
            assert.ok(!predicates.evaluate(predicate, request, 'base64'));
        });

        it('should return true if repeating query key has value starting with string', function () {
            var predicate = { startsWith: { query: { key: 'mid' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(predicates.evaluate(predicate, request));
        });

        it('should return false if repeating query key does not have value starting with string', function () {
            var predicate = { startsWith: { query: { key: 'egin' } } },
                request = { query: { key: ['begin', 'middle', 'end'] } };
            assert.ok(!predicates.evaluate(predicate, request));
        });
    });
});
