'use strict';

var Q = require('q'),
    fs = require('fs'),
    path = require('path'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    httpClient = require('./api/http/baseHttpClient').create('http'),
    headers = { connection: 'close' },
    isWindows = require('os').platform().indexOf('win') === 0,
    mbPath = process.env.MB_EXECUTABLE || path.join(__dirname, '/../bin/mb'),
    pidfile = 'test.pid',
    logfile = 'mb-test.log';

function whenFullyInitialized (callback) {
    var spinWait = function () {
        if (fs.existsSync(pidfile)) {
            callback({});
        }
        else {
            Q.delay(100).done(spinWait);
        }
    };

    if (fs.existsSync(pidfile)) {
        fs.unlinkSync(pidfile);
    }
    spinWait();
}

function spawnMb (args) {
    var command = mbPath;

    if (isWindows) {
        args.unshift(mbPath);

        if (mbPath.indexOf('.cmd') >= 0) {
            // Accommodate the self-contained Windows zip files that ship with mountebank
            args.unshift('/c');
            command = 'cmd';
        }
        else {
            command = 'node';
        }
    }

    return spawn(command, args);
}

function create (port) {

    function start (args) {
        var deferred = Q.defer(),
            mbArgs = ['restart', '--port', port, '--logfile', logfile, '--pidfile', pidfile].concat(args || []),
            mb;

        whenFullyInitialized(deferred.resolve);
        mb = spawnMb(mbArgs);
        mb.on('error', deferred.reject);

        return deferred.promise;
    }

    function stop () {
        var deferred = Q.defer(),
            command = mbPath + ' stop --pidfile ' + pidfile;

        if (isWindows && mbPath.indexOf('.cmd') < 0) {
            command = 'node ' + command;
        }
        exec(command, function (error, stdout, stderr) {
            if (error) { throw error; }
            if (stdout) { console.log(stdout); }
            if (stderr) { console.error(stderr); }

            // Prevent address in use errors on the next start
            setTimeout(deferred.resolve, isWindows ? 1000 : 250);
        });

        return deferred.promise;
    }

    function save (args) {
        var deferred = Q.defer(),
            mbArgs = ['save', '--port', port].concat(args || []),
            mb,
            stdout = '',
            stderr = '';

        mb = spawnMb(mbArgs);
        mb.on('error', deferred.reject);
        mb.stdout.on('data', function (chunk) { stdout += chunk; });
        mb.stderr.on('data', function (chunk) { stderr += chunk; });
        mb.on('close', function (exitCode) {
            deferred.resolve({
                exitCode: exitCode,
                stdout: stdout,
                stderr: stderr
            });
        });

        return deferred.promise;
    }

    // After trial and error, I discovered that we have to set
    // the connection: close header on Windows or we end up with
    // ECONNRESET errors
    function get (endpoint) {
        return httpClient.responseFor({ method: 'GET', path: endpoint, port: port, headers: headers });
    }

    function post (endpoint, body) {
        return httpClient.responseFor({ method: 'POST', path: endpoint, port: port, body: body, headers: headers });
    }

    return {
        port: port,
        url: 'http://localhost:' + port,
        start: start,
        stop: stop,
        save: save,
        get: get,
        post: post
    };
}

module.exports = {
    create: create
};
