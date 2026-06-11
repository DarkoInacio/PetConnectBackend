'use strict';

// Workaround Windows: Node puede fallar querySrv (ECONNREFUSED) con el resolver local.
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('../src/server.js');
